import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  aggregateStatus,
  buildReport,
  buildNextActions,
  detectPm,
  runSecureGate,
  verifyEvidence,
  verify,
  REPORT_SCHEMA_VERSION,
  REPORT_PATH_REL,
  type GateResult,
} from '../src/commands/verify.js'

function gate(id: GateResult['id'], status: GateResult['status'], exitCode: number | null = 0): GateResult {
  return { id, label: id, status, exitCode, skipped: status === 'skip' }
}

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-verify-'))
}

describe('verify — 상태 집계 (aggregateStatus)', () => {
  it('fail 하나라도 → FAIL (skip/pass 무관)', () => {
    expect(aggregateStatus([gate('typecheck', 'pass'), gate('test', 'fail', 1), gate('build', 'skip', null)])).toBe('FAIL')
  })
  it('fail 없고 skip 있으면 → WARN (거짓 PASS 금지)', () => {
    expect(aggregateStatus([gate('typecheck', 'pass'), gate('test', 'skip', null)])).toBe('WARN')
  })
  it('전부 pass → PASS', () => {
    expect(aggregateStatus([gate('typecheck', 'pass'), gate('secure', 'pass')])).toBe('PASS')
  })
})

describe('verify — 리포트 빌드 (buildReport)', () => {
  it('스키마 + summary 카운트 정확', () => {
    const gates = [gate('typecheck', 'pass'), gate('test', 'fail', 1), gate('build', 'skip', null), gate('secure', 'pass')]
    const r = buildReport(gates, '2026-06-02T00:00:00.000Z', '2026-06-02')
    expect(r.schemaVersion).toBe(REPORT_SCHEMA_VERSION)
    expect(r.generatedAt).toBe('2026-06-02T00:00:00.000Z')
    expect(r.date).toBe('2026-06-02')
    expect(r.status).toBe('FAIL')
    expect(r.summary).toEqual({ total: 4, pass: 2, fail: 1, skip: 1 })
    expect(r.gates).toHaveLength(4)
    expect(Array.isArray(r.nextActions)).toBe(true)
    expect(r.nextActions.length).toBeGreaterThan(0)
  })
})

describe('verify — nextActions', () => {
  it('전부 pass 면 저장 안내', () => {
    expect(buildNextActions([gate('typecheck', 'pass')]).join(' ')).toMatch(/vhk save|저장/)
  })
  it('fail 이면 수정 힌트', () => {
    expect(buildNextActions([gate('test', 'fail', 1)]).join(' ')).toMatch(/실패|수정/)
  })
  it('skip 이면 스크립트 추가 힌트', () => {
    expect(buildNextActions([gate('build', 'skip', null)]).join(' ')).toMatch(/scripts|게이트/)
  })
})

describe('verify — detectPm', () => {
  it('lockfile 로 pm 감지 (없으면 npm)', () => {
    const d = tmp()
    expect(detectPm(d)).toBe('npm')
    fs.writeFileSync(path.join(d, 'pnpm-lock.yaml'), '', 'utf-8')
    expect(detectPm(d)).toBe('pnpm')
    fs.rmSync(d, { recursive: true, force: true })
  })
})

describe('verify — verifyEvidence (실제 게이트 + 증거 기록)', () => {
  it('scripts 없으면 외부 게이트 skip → WARN, latest.json 항상 생성 + 스키마 통과', () => {
    const d = tmp()
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'tp', version: '0.0.0' }), 'utf-8')
    const { report, path: rel } = verifyEvidence(d)
    expect(rel).toBe(REPORT_PATH_REL)
    // 파일이 실제로 생성됨
    const onDisk = JSON.parse(fs.readFileSync(path.join(d, REPORT_PATH_REL), 'utf-8'))
    expect(onDisk.schemaVersion).toBe(REPORT_SCHEMA_VERSION)
    expect(onDisk.status).toBe(report.status)
    // typecheck/test/build skip, secure pass(시크릿 없음) → WARN
    expect(report.status).toBe('WARN')
    expect(report.gates.find((g) => g.id === 'typecheck')?.status).toBe('skip')
    expect(report.gates.find((g) => g.id === 'secure')?.status).toBe('pass')
    // reports/ 로컬 전용 등재
    expect(fs.readFileSync(path.join(d, '.vhk', '.gitignore'), 'utf-8')).toContain('reports/')
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('거짓 PASS 회귀 가드 — test 게이트 실패 시 status=FAIL + 해당 gate fail (실제 종료코드)', () => {
    const d = tmp()
    fs.writeFileSync(path.join(d, 'fail.js'), 'process.exit(1)\n', 'utf-8')
    fs.writeFileSync(
      path.join(d, 'package.json'),
      JSON.stringify({ name: 'tp', version: '0.0.0', scripts: { 'test:run': 'node fail.js' } }),
      'utf-8'
    )
    const { report } = verifyEvidence(d)
    const testGate = report.gates.find((g) => g.id === 'test')
    expect(testGate?.status).toBe('fail')
    expect(testGate?.exitCode).toBe(1)
    expect(report.status).toBe('FAIL')
    fs.rmSync(d, { recursive: true, force: true })
  }, 30_000)

  it('secure 게이트 — severe 시크릿 발견 시 fail, 리포트에 시크릿 값 미포함(누출 0)', () => {
    const d = tmp()
    // 테스트 소스에 contiguous 매칭이 안 생기도록 런타임 조합 (repo 자체 스캔 회피).
    const fakeKey = 'AKIA' + 'IOSFODNN7EXAMPLE'
    fs.writeFileSync(path.join(d, 'leak.js'), `const k = "${fakeKey}"\n`, 'utf-8')
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'tp', version: '0.0.0' }), 'utf-8')
    const { report } = verifyEvidence(d)
    const secure = report.gates.find((g) => g.id === 'secure')
    expect(secure?.status).toBe('fail')
    expect(report.status).toBe('FAIL')
    // 리포트 직렬화 어디에도 시크릿 값이 없어야 함
    const json = JSON.stringify(report)
    expect(json).not.toContain(fakeKey)
    const onDisk = fs.readFileSync(path.join(d, REPORT_PATH_REL), 'utf-8')
    expect(onDisk).not.toContain(fakeKey)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('runSecureGate — 시크릿 없으면 pass', () => {
    const d = tmp()
    fs.writeFileSync(path.join(d, 'a.js'), 'const x = 1\n', 'utf-8')
    expect(runSecureGate(d).status).toBe('pass')
    fs.rmSync(d, { recursive: true, force: true })
  })
})

describe('verify — CLI (--json / HARD_STOP)', () => {
  let origCwd: string
  beforeEach(() => {
    origCwd = process.cwd()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    process.exitCode = 0
  })
  afterEach(() => {
    process.chdir(origCwd)
    vi.restoreAllMocks()
    process.exitCode = 0
  })

  it('--json → stdout 으로 리포트 JSON (파싱 가능)', async () => {
    const d = tmp()
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'tp', version: '0.0.0' }), 'utf-8')
    process.chdir(d)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await verify({ json: true })
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    const parsed = JSON.parse(printed)
    expect(parsed.schemaVersion).toBe(REPORT_SCHEMA_VERSION)
    expect(['PASS', 'WARN', 'FAIL']).toContain(parsed.status)
    process.chdir(origCwd) // Windows: cwd 인 디렉터리는 rmSync 불가 → 먼저 빠져나온다
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('HARD_STOP 존재 → verify 거부 + exitCode 1 + 리포트 미생성', async () => {
    const d = tmp()
    fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
    fs.writeFileSync(path.join(d, '.vhk', 'HARD_STOP'), 'ts\nreason\n', 'utf-8')
    process.chdir(d)
    await verify()
    expect(process.exitCode).toBe(1)
    expect(fs.existsSync(path.join(d, REPORT_PATH_REL))).toBe(false)
    process.chdir(origCwd) // Windows: cwd 인 디렉터리는 rmSync 불가 → 먼저 빠져나온다
    fs.rmSync(d, { recursive: true, force: true })
  })
})
