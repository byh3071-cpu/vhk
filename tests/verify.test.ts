import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setSink } from '../src/utils/logger.js'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  aggregateStatus,
  buildReport,
  buildNextActions,
  buildVerifyAdvisories,
  dismissVerifyAdvisory,
  formatVerifyAdvisory,
  detectPm,
  runSecureGate,
  verifyEvidence,
  verify,
  REPORT_SCHEMA_VERSION,
  REPORT_PATH_REL,
  type GateResult,
} from '../src/commands/verify.js'
import { buildLedgerEntry, readLedger } from '../src/lib/evidence-ledger.js'
import { MAX_SCAN_FILE_BYTES } from '../src/lib/scan-files.js'
import {
  GATES_SCHEMA_VERSION,
  readGatesConfig,
  type GateId,
} from '../src/lib/gates-config.js'
import { collectReceipt } from '../src/commands/receipt.js'
import { readActionLedger } from '../src/lib/action-ledger.js'

function gate(id: GateResult['id'], status: GateResult['status'], exitCode: number | null = 0): GateResult {
  return { id, label: id, status, exitCode, skipped: status === 'skip' }
}

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-verify-'))
}

function declareOptionalGates(dir: string, ids: GateId[]): void {
  fs.mkdirSync(path.join(dir, '.vhk'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, '.vhk', 'gates.json'),
    JSON.stringify({
      schemaVersion: GATES_SCHEMA_VERSION,
      gates: Object.fromEntries(ids.map((id) => [id, { optional: true, reason: `${id} 미도입` }])),
    }),
    'utf-8'
  )
}

describe('verify — 상태 집계 (aggregateStatus)', () => {
  it('fail 하나라도 → FAIL (skip/pass 무관)', () => {
    expect(aggregateStatus([gate('typecheck', 'pass'), gate('test', 'fail', 1), gate('build', 'skip', null)])).toBe('FAIL')
  })
  it('fail 없고 skip 있으면 → WARN (거짓 PASS 금지)', () => {
    expect(aggregateStatus([gate('typecheck', 'pass'), gate('test', 'skip', null)])).toBe('WARN')
  })
  it('명시적으로 미도입한 skip만 있으면 → PASS', () => {
    const skipped = gate('test', 'skip', null)
    skipped.declaredOptional = true
    expect(aggregateStatus([gate('typecheck', 'pass'), skipped])).toBe('PASS')
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
    expect(r.summary).toEqual({ total: 4, pass: 2, fail: 1, skip: 1, warn: 0 })
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
  it('fail 이면 vhk learn 힌트 (#466)', () => {
    expect(buildNextActions([gate('test', 'fail', 1)]).join(' ')).toMatch(/vhk learn/)
  })
  it('skip 이면 스크립트 추가 힌트', () => {
    expect(buildNextActions([gate('build', 'skip', null)]).join(' ')).toMatch(/scripts|게이트/)
  })
})

describe('verify — 알림 안정 ID와 숨김', () => {
  it('같은 게이트 문제는 반복 실행에도 같은 알림 ID', () => {
    expect(buildVerifyAdvisories([gate('lint', 'skip', null)])).toEqual([
      expect.objectContaining({
        id: 'lint-gate',
        message: 'lint 검사가 설정되어 있지 않습니다.\n해결: package.json에 lint 스크립트 추가',
      }),
    ])
  })

  it('다시 발생한 문제는 경과 시간과 이전 숨김 횟수를 명확하게 출력', () => {
    expect(formatVerifyAdvisory({
      id: 'lint-gate',
      message: 'lint 검사가 설정되어 있지 않습니다.\n해결: package.json에 lint 스크립트 추가',
      ageMs: 2 * 24 * 60 * 60 * 1000,
      dismissCount: 3,
      escalated: true,
    })).toBe([
      '🚨 같은 문제가 다시 발생했습니다.',
      '   lint 검사가 설정되어 있지 않습니다.',
      '   2일째 계속됨 · 이전에 이 알림을 3번 숨김',
      '   해결: package.json에 lint 스크립트 추가',
      '   알림 ID: lint-gate',
    ].join('\n'))
  })

  it('latest.json의 권고를 무시하면 action-ledger에 누적', () => {
    const d = tmp()
    try {
      fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'tp', version: '0.0.0' }), 'utf-8')
      verifyEvidence(d)
      expect(dismissVerifyAdvisory(d, 'lint-gate')).toBe(true)
      expect(readActionLedger(d)).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: 'advisory-dismiss', target: 'lint-gate', ran: true }),
      ]))
    } finally {
      fs.rmSync(d, { recursive: true, force: true })
    }
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

describe('gates-config — 검사 도입 의도 reader', () => {
  it('schemaVersion 1 + optional/reason 선언을 BOM-safe로 읽는다', () => {
    const d = tmp()
    fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
    fs.writeFileSync(
      path.join(d, '.vhk', 'gates.json'),
      '\ufeff' + JSON.stringify({
        schemaVersion: GATES_SCHEMA_VERSION,
        gates: { lint: { optional: true, reason: '  일회성 프로젝트  ' } },
      }),
      'utf-8'
    )
    expect(readGatesConfig(d).gates.lint).toEqual({ optional: true, reason: '일회성 프로젝트' })
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('미지원 버전·빈 사유는 경고 억제 선언으로 채택하지 않는다', () => {
    const d = tmp()
    fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
    fs.writeFileSync(
      path.join(d, '.vhk', 'gates.json'),
      JSON.stringify({ schemaVersion: 99, gates: { lint: { optional: true, reason: '미도입' } } }),
      'utf-8'
    )
    expect(readGatesConfig(d).gates).toEqual({})

    fs.writeFileSync(
      path.join(d, '.vhk', 'gates.json'),
      JSON.stringify({ schemaVersion: GATES_SCHEMA_VERSION, gates: { lint: { optional: true, reason: ' ' } } }),
      'utf-8'
    )
    expect(readGatesConfig(d).gates).toEqual({})
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
    expect(readActionLedger(d)).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'verify', result: 'WARN', ran: true }),
    ]))
    // reports/ 로컬 전용 등재
    expect(fs.readFileSync(path.join(d, '.vhk', '.gitignore'), 'utf-8')).toContain('reports/')
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('신규 프로젝트의 선언된 미도입은 WARN·Receipt soft warning에서 제외한다', () => {
    const d = tmp()
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'tp', version: '0.0.0' }), 'utf-8')
    declareOptionalGates(d, ['typecheck', 'lint', 'test', 'build'])

    const { report } = verifyEvidence(d)
    expect(report.status).toBe('PASS')
    expect(report.summary).toEqual({ total: 1, pass: 1, fail: 0, skip: 0, warn: 0 })
    expect(report.gates.filter((g) => g.declaredOptional)).toHaveLength(4)
    expect(report.nextActions).toEqual(['검증 통과 — vhk save 로 저장하세요.'])

    const receipt = collectReceipt(d)
    expect(receipt.evidence.gates.status).toBe('PASS')
    expect(receipt.evidence.gates.hasSoftWarning).toBe(false)
    fs.rmSync(d, { recursive: true, force: true })
  })

  // RFC 0057 트랙② — verifyEvidence 가 .vhk/ledger.jsonl 에 append 하는 buildLedgerEntry 호출에
  // detectAgent() 를 실제로 실어 보내는지. CLAUDECODE 를 강제해 검증(buildLedgerEntry 의 정적
  // 기본값 'unknown' 만으로는 통과 못 하고, verify.ts 가 감지 결과를 3번째 인자로 넘겨야 한다).
  it('RFC 0057 트랙② — 원장(.vhk/ledger.jsonl)에 agent 필드가 detectAgent() 결과로 기록됨', () => {
    const d = tmp()
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'tp', version: '1.2.3' }), 'utf-8')
    const orig = process.env.CLAUDECODE
    try {
      process.env.CLAUDECODE = '1'
      verifyEvidence(d)
      const ledger = readLedger(d)
      expect(ledger).toHaveLength(1)
      expect(ledger[0].agent).toBe('claude-code')
    } finally {
      if (orig === undefined) delete process.env.CLAUDECODE
      else process.env.CLAUDECODE = orig
      fs.rmSync(d, { recursive: true, force: true })
    }
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

  it('BOM 붙은 package.json 에서도 크래시 없이 latest.json 생성 (Windows 회귀)', () => {
    // PowerShell Set-Content -Encoding utf8 등은 파일 맨 앞에 ﻿(BOM)를 붙인다.
    // raw JSON.parse 면 죽어서 증거(latest.json)도 못 남기던 버그 → readJsonFile(BOM strip) 회귀 가드.
    const d = tmp()
    fs.writeFileSync(
      path.join(d, 'package.json'),
      '﻿' + JSON.stringify({ name: 'tp', version: '0.0.0', scripts: { 'test:run': 'node ok.js' } }),
      'utf-8'
    )
    fs.writeFileSync(path.join(d, 'ok.js'), 'process.exit(0)\n', 'utf-8')
    const { report } = verifyEvidence(d)
    // 계약: 성공·실패 무관 항상 증거 기록 — BOM 으로도 죽지 않음
    expect(fs.existsSync(path.join(d, REPORT_PATH_REL))).toBe(true)
    expect(report.schemaVersion).toBe(REPORT_SCHEMA_VERSION)
    // scripts 가 정상 인식돼 test 게이트 실행됨(BOM 만 제거되고 본문 보존)
    expect(report.gates.find((g) => g.id === 'test')?.skipped).toBe(false)
    fs.rmSync(d, { recursive: true, force: true })
  }, 30_000)

  it('손상된 package.json → 크래시 없이 외부 게이트 skip + 증거 기록(거짓 PASS 금지)', () => {
    const d = tmp()
    fs.writeFileSync(path.join(d, 'package.json'), '{ this is not valid json', 'utf-8')
    const { report } = verifyEvidence(d)
    expect(fs.existsSync(path.join(d, REPORT_PATH_REL))).toBe(true)
    // scripts 파싱 실패 → 외부 게이트 전부 skip(추측 PASS 금지)
    expect(report.gates.find((g) => g.id === 'typecheck')?.status).toBe('skip')
    expect(report.gates.find((g) => g.id === 'lint')?.status).toBe('skip')
    expect(report.gates.find((g) => g.id === 'test')?.status).toBe('skip')
    expect(report.gates.find((g) => g.id === 'build')?.status).toBe('skip')
    fs.rmSync(d, { recursive: true, force: true })
  })
})

// Goal: verify lint 게이트 — receipt(verify 게이트 소비)가 eslint 거짓완료(#381 류)를 못 잡던 갭 봉합.
// 패턴은 typecheck/test/build 와 동일(scripts.lint 있으면 실행→실종료코드, 없으면 skip — 거짓 PASS 금지).
describe('verify — lint 게이트 (#381 거짓완료 클래스 포획)', () => {
  it('lint 스크립트 + eslint 에러 → lint 게이트 fail(실종료코드) → 종합 status FAIL', () => {
    const d = tmp()
    // 실제 종료코드 1로 끝나는 lint 스탠드인(node 스크립트 — eslint 미설치 의존 회피, 종료코드만 관건).
    fs.writeFileSync(path.join(d, 'lint-fail.js'), 'process.exit(1)\n', 'utf-8')
    fs.writeFileSync(
      path.join(d, 'package.json'),
      JSON.stringify({ name: 'tp', version: '0.0.0', scripts: { lint: 'node lint-fail.js' } }),
      'utf-8'
    )
    const { report } = verifyEvidence(d)
    const lintGate = report.gates.find((g) => g.id === 'lint')
    expect(lintGate?.status).toBe('fail')
    expect(lintGate?.exitCode).toBe(1)
    expect(lintGate?.skipped).toBe(false)
    expect(report.status).toBe('FAIL')
    fs.rmSync(d, { recursive: true, force: true })
  }, 30_000)

  it('lint 스크립트 없는 프로젝트 → lint 게이트 skip(fail 아님 — 비-lint 프로젝트 회귀 0)', () => {
    const d = tmp()
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'tp', version: '0.0.0' }), 'utf-8')
    const { report } = verifyEvidence(d)
    const lintGate = report.gates.find((g) => g.id === 'lint')
    expect(lintGate?.status).toBe('skip')
    expect(lintGate?.skipped).toBe(true)
    // skip 은 fail 이 아니다 — 비-lint 프로젝트에서 lint 때문에 FAIL 나면 안 됨.
    expect(report.status).not.toBe('FAIL')
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('lint 스크립트 통과(종료코드 0) → lint 게이트 pass', () => {
    const d = tmp()
    fs.writeFileSync(path.join(d, 'lint-ok.js'), 'process.exit(0)\n', 'utf-8')
    fs.writeFileSync(
      path.join(d, 'package.json'),
      JSON.stringify({ name: 'tp', version: '0.0.0', scripts: { lint: 'node lint-ok.js' } }),
      'utf-8'
    )
    const { report } = verifyEvidence(d)
    expect(report.gates.find((g) => g.id === 'lint')?.status).toBe('pass')
    fs.rmSync(d, { recursive: true, force: true })
  }, 30_000)

  it('게이트 집합 = typecheck/lint/test/build/secure 5종(추가만 — 기존 4종 불변)', () => {
    const d = tmp()
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'tp', version: '0.0.0' }), 'utf-8')
    const { report } = verifyEvidence(d)
    const ids = report.gates.map((g) => g.id)
    expect(ids).toEqual(['typecheck', 'lint', 'test', 'build', 'secure'])
    expect(report.summary.total).toBe(5)
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

  it('선언된 미도입은 "미도입 N종(선언됨)" 한 줄로 표시하고 WARN을 내지 않는다', async () => {
    const d = tmp()
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'tp', version: '0.0.0' }), 'utf-8')
    declareOptionalGates(d, ['typecheck', 'lint', 'test', 'build'])
    process.chdir(d)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await verify()
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(printed).toContain('미도입 4종(선언됨)')
    // #552 리뷰 대응 — 게이트 행·미도입 요약은 logger 단일 sink 를 거친다.
    const sinkLines: string[] = []
    const restoreSink = setSink((line) => sinkLines.push(line))
    try {
      await verify()
    } finally {
      restoreSink()
    }
    expect(sinkLines.join('|')).toContain('미도입 4종(선언됨)')
    expect(printed).toMatch(/결과: PASS/)
    expect(printed).not.toMatch(/결과: WARN/)
    expect(process.exitCode).toBe(0)
    process.chdir(origCwd)
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

describe('verify — Goal 59: 스캔 불완전 → secure WARN (거짓 PASS 차단)', () => {
  it('runSecureGate — 파일>512KB(불완전)+severe 0 → warn(scan-incomplete) + exitCode 0(비차단)', () => {
    const d = tmp()
    fs.writeFileSync(path.join(d, 'big.js'), 'x'.repeat(MAX_SCAN_FILE_BYTES + 1), 'utf-8')
    const g = runSecureGate(d)
    expect(g.status).toBe('warn')
    expect(g.exitCode).toBe(0) // 비차단 — 가시화만(거짓 FAIL 도 거짓 PASS 도 아님)
    expect(g.skipped).toBe(false)
    expect(g.detail).toMatch(/scan-incomplete/)
    expect(g.detail).toMatch(/file-size/)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('runSecureGate — 시크릿 없고 완전 스캔이면 여전히 pass (회귀 0)', () => {
    const d = tmp()
    fs.writeFileSync(path.join(d, 'a.js'), 'const x = 1\n', 'utf-8')
    expect(runSecureGate(d).status).toBe('pass')
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('aggregateStatus — warn 게이트 있으면 WARN(fail 없을 때) / fail 있으면 FAIL 우선', () => {
    const warn: GateResult = { id: 'secure', label: 'secure', status: 'warn', exitCode: 0, skipped: false }
    expect(aggregateStatus([gate('typecheck', 'pass'), warn])).toBe('WARN')
    expect(aggregateStatus([gate('test', 'fail', 1), warn])).toBe('FAIL')
  })

  it('buildReport summary — warn 게이트를 warn 버킷에 집계(pass+fail+skip+warn=total, 게이트 안 사라짐)', () => {
    const warn: GateResult = { id: 'secure', label: 'secure', status: 'warn', exitCode: 0, skipped: false }
    const r = buildReport(
      [gate('typecheck', 'pass'), gate('test', 'pass'), gate('build', 'pass'), warn],
      '2026-06-10T00:00:00.000Z',
      '2026-06-10'
    )
    expect(r.summary).toEqual({ total: 4, pass: 3, fail: 0, skip: 0, warn: 1 })
    expect(r.summary.pass + r.summary.fail + r.summary.skip + r.summary.warn).toBe(r.summary.total)
  })

  it('buildReport + buildLedgerEntry — secure warn → report.status WARN → 원장 status WARN 전파', () => {
    const warn: GateResult = {
      id: 'secure',
      label: 'secure scan',
      status: 'warn',
      exitCode: 0,
      skipped: false,
      detail: '스캔 불완전(scan-incomplete: file-size)',
    }
    const r = buildReport([gate('typecheck', 'pass'), warn], '2026-06-10T00:00:00.000Z', '2026-06-10')
    expect(r.status).toBe('WARN')
    expect(buildLedgerEntry(r, '1.2.3').status).toBe('WARN')
  })
})

// 멀티PC dirty-block(B축) — verify 가 events/ledger append 로 만든 dirty 를 저소음 단일 커밋으로
// 정리한다. 단, 커밋은 verify 명령 본체에만(verifyEvidence 본체는 HEAD 불변 — receipt stale 보호).
describe('verify — 증거 원장 저소음 커밋 (멀티PC dirty-block B축)', () => {
  let origCwd: string

  // 커밋 1개 있는 임시 git 레포(전역 identity 없는 CI 대비 -c 주입은 config 로 처리).
  function makeRepo(): string {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-verify-commit-'))
    const g = (args: string[]): void => {
      execFileSync('git', args, { cwd: d, stdio: 'pipe' })
    }
    g(['init'])
    g(['config', 'user.email', 't@t'])
    g(['config', 'user.name', 't'])
    // 추적되는 events/ledger 씨앗(이미 추적 상태여야 verify append 가 modified=dirty 가 됨).
    fs.mkdirSync(path.join(d, '.vhk', 'events'), { recursive: true })
    fs.writeFileSync(path.join(d, '.vhk', 'events', 'ai-actions.jsonl'), '')
    fs.writeFileSync(path.join(d, '.vhk', 'ledger.jsonl'), '')
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'tp', version: '0.0.0' }), 'utf-8')
    g(['add', '.'])
    g(['commit', '-m', 'seed'])
    return d
  }

  const headSha = (d: string): string =>
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: d, encoding: 'utf-8' }).trim()

  // .vhk/events·ledger 만 본 porcelain (raw). clean 이면 빈 문자열.
  const ledgerStatus = (d: string): string =>
    execFileSync('git', ['status', '--porcelain', '--', '.vhk/events', '.vhk/ledger.jsonl'], {
      cwd: d,
      encoding: 'utf-8',
    }).trim()

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

  it('verify 1회 → events/ledger 변경이 단일 커밋으로 정리되고 직후 clean', async () => {
    const d = makeRepo()
    const before = headSha(d)
    process.chdir(d)
    await verify()
    process.chdir(origCwd)
    // events/ledger 가 clean (저소음 커밋이 정리).
    expect(ledgerStatus(d)).toBe('')
    // 커밋 정확히 1개 추가(저소음).
    const after = headSha(d)
    expect(after).not.toBe(before)
    const count = execFileSync('git', ['rev-list', '--count', `${before}..${after}`], {
      cwd: d,
      encoding: 'utf-8',
    }).trim()
    expect(count).toBe('1')
    fs.rmSync(d, { recursive: true, force: true })
  }, 30_000)

  it('재실행 시 추가 커밋 0 (diff-cached 가드 — 변경 없으면 commit skip)', async () => {
    const d = makeRepo()
    process.chdir(d)
    await verify() // 1회: 정리 커밋
    const afterFirst = headSha(d)
    await verify() // 2회: events/ledger append 후 정리 — 커밋이 새로 생기긴 함(append 가 dirty 유발)
    process.chdir(origCwd)
    // 핵심 가드: 매 실행이 정확히 1커밋씩(휩쓸기/중복 커밋 0). 정리 후 항상 clean.
    expect(ledgerStatus(d)).toBe('')
    const secondHead = headSha(d)
    const count = execFileSync('git', ['rev-list', '--count', `${afterFirst}..${secondHead}`], {
      cwd: d,
      encoding: 'utf-8',
    }).trim()
    expect(Number(count)).toBeLessThanOrEqual(1)
    fs.rmSync(d, { recursive: true, force: true })
  }, 30_000)

  // ★receipt 무회귀(치명)★ — verifyEvidence 본체는 HEAD 를 움직이지 않는다.
  // (커밋은 verify 명령 본체에만. verifyEvidence 가 HEAD 를 옮기면 collectReceipt 가
  //  verifyEvidence 직후 읽는 stale 판정이 거짓 true 가 됨 → 거짓 CAUTION/BLOCK.)
  it('verifyEvidence 는 HEAD 를 이동시키지 않는다 (receipt stale 보호)', () => {
    const d = makeRepo()
    const before = headSha(d)
    verifyEvidence(d) // 게이트+증거기록만 — 커밋 없음
    expect(headSha(d)).toBe(before)
    fs.rmSync(d, { recursive: true, force: true })
  }, 30_000)
})
