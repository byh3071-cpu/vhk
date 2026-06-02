import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  migrateMemory,
  readMemory,
  writeMemory,
  recordLesson,
  memoryAdd,
  memoryList,
  memoryRemove,
  memoryArchive,
  memoryMigrate,
  activeMemoryLines,
  MEMORY_PATH_REL,
  type MemoryFileV2,
} from '../src/commands/memory.js'
import { context } from '../src/commands/context.js'
import { findSecretsInLine, filterSevereFindings } from '../src/lib/scan-secrets.js'

// ────────────────────────────────────────────────────────────────────────────
// 창 C — memory schema v2 회귀/엣지 하드닝 (characterization 안전망).
// schema v2 는 breaking(v1 평면배열 → v2 4버킷). 로직은 이미 존재 → 이 테스트는
// "현 동작을 못박는" 것이며 현 구현에서 전부 green 이어야 정상.
// Windows: 임시디렉토리 정리 시 chdir(origCwd) 를 rmSync 보다 먼저 (EPERM 회피).
// ────────────────────────────────────────────────────────────────────────────

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-memh-'))
}
function memPath(d: string): string {
  return path.join(d, MEMORY_PATH_REL)
}
/** v1 평면 배열 시드 (.vhk/memory.json) */
function seedV1(d: string, arr: unknown[]): void {
  fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
  fs.writeFileSync(memPath(d), JSON.stringify(arr), 'utf-8')
}
/** raw 문자열을 그대로 .vhk/memory.json 에 기록 (손상 입력 시드용) */
function seedRaw(d: string, raw: string): void {
  fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
  fs.writeFileSync(memPath(d), raw, 'utf-8')
}
function seedV2(d: string, mem: MemoryFileV2): void {
  fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
  fs.writeFileSync(memPath(d), JSON.stringify(mem, null, 2) + '\n', 'utf-8')
}
function seedLearnings(d: string, body: string): void {
  fs.mkdirSync(path.join(d, 'docs', 'state'), { recursive: true })
  fs.writeFileSync(path.join(d, 'docs', 'state', 'learnings.md'), body, 'utf-8')
}
function readMem(d: string): MemoryFileV2 {
  return JSON.parse(fs.readFileSync(memPath(d), 'utf-8'))
}
function rm(d: string): void {
  fs.rmSync(d, { recursive: true, force: true })
}

// ════════════════════════════════════════════════════════════════════════════
// 케이스 1 — 마이그레이션 멱등성 (FS 레벨: 2회 실행해도 무변경/무중복)
// ════════════════════════════════════════════════════════════════════════════
describe('memory v2 하드닝 1 — 마이그레이션 멱등성 (FS)', () => {
  let origCwd: string
  beforeEach(() => {
    origCwd = process.cwd()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    vi.restoreAllMocks()
  })

  it('memoryMigrate 2회 — 두 번째는 no-op (바이트 동일, failures 중복 흡수 안 함)', async () => {
    const d = tmp()
    seedV1(d, [{ content: '결정A' }, { content: '결정B' }])
    seedLearnings(d, '- [2026-01-01 goal-1] 교훈1.\n- [2026-01-02 goal-2] 교훈2.\n')
    process.chdir(d)

    await memoryMigrate()
    const afterFirst = fs.readFileSync(memPath(d), 'utf-8')
    const mem1 = JSON.parse(afterFirst)
    expect(mem1.decisions).toHaveLength(2)
    expect(mem1.failures).toHaveLength(2) // learnings 1회 흡수

    await memoryMigrate() // 이미 v2 → no-op
    const afterSecond = fs.readFileSync(memPath(d), 'utf-8')
    expect(afterSecond).toBe(afterFirst) // 바이트 단위 무변경
    const mem2 = JSON.parse(afterSecond)
    expect(mem2.decisions).toHaveLength(2) // 중복 없음
    expect(mem2.failures).toHaveLength(2) // learnings 재흡수 안 함 (4 아님)

    process.chdir(origCwd)
    rm(d)
  })

  it('readMemory 2회 — v1 1회 영구화 후 재읽기는 디스크 무변경 (멱등)', () => {
    const d = tmp()
    seedV1(d, [{ content: '결정X', tags: ['t'], addedAt: '2026-03-03' }])

    readMemory(d) // 1회: v1 → v2 영구화 (+ .bak/.v1.bak)
    const afterFirst = fs.readFileSync(memPath(d), 'utf-8')
    expect(JSON.parse(afterFirst).schemaVersion).toBe(2)

    readMemory(d) // 2회: 디스크 v2 → write 안 함
    const afterSecond = fs.readFileSync(memPath(d), 'utf-8')
    expect(afterSecond).toBe(afterFirst)

    rm(d)
  })

  it('순수 migrateMemory — 이미 v2 면 learnings 무시 (재흡수 0)', () => {
    const once = migrateMemory([{ content: 'A' }], '- [2026-01-01 g] L1.\n')
    expect(once.failures).toHaveLength(1)
    const twice = migrateMemory(once, '- [2026-01-01 g] L1.\n- [2026-01-02 g] L2.\n')
    expect(twice.failures).toHaveLength(1) // v2 입력이면 새 learnings 도 안 흡수
    expect(twice.decisions).toHaveLength(1)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 케이스 2 — 손상 v1 입력 복구 (빈 파일 / BOM / 깨진 JSON → 크래시 없음)
// ════════════════════════════════════════════════════════════════════════════
describe('memory v2 하드닝 2 — 손상 입력 안전 복구', () => {
  it('빈 파일 → 크래시 없이 빈 v2 (버킷 전부 빈 배열)', () => {
    const d = tmp()
    seedRaw(d, '')
    let mem: MemoryFileV2 | undefined
    expect(() => {
      mem = readMemory(d)
    }).not.toThrow()
    expect(mem!.schemaVersion).toBe(2)
    expect(mem!.decisions).toEqual([])
    expect(mem!.failures).toEqual([])
    expect(mem!.successes).toEqual([])
    expect(mem!.patterns).toEqual([])
    rm(d)
  })

  it('공백만 있는 파일 → 크래시 없음', () => {
    const d = tmp()
    seedRaw(d, '   \n\t  \n')
    expect(() => readMemory(d)).not.toThrow()
    expect(readMemory(d).schemaVersion).toBe(2)
    rm(d)
  })

  it('깨진 JSON → 크래시 없이 빈 v2', () => {
    const d = tmp()
    seedRaw(d, '{ this is not : valid json ]]')
    let mem: MemoryFileV2 | undefined
    expect(() => {
      mem = readMemory(d)
    }).not.toThrow()
    expect(mem!.decisions).toEqual([])
    rm(d)
  })

  it('BOM + 유효 v1 배열 → 정상 파싱 (decisions 흡수)', () => {
    const d = tmp()
    seedRaw(d, '﻿' + JSON.stringify([{ content: 'BOM 결정' }]))
    const mem = readMemory(d)
    expect(mem.decisions).toHaveLength(1)
    expect(mem.decisions[0].content).toBe('BOM 결정')
    rm(d)
  })

  it('BOM + 유효 v2 객체 → v2 로 인식 (마이그레이션·.v1.bak 생성 안 함)', () => {
    const d = tmp()
    const v2: MemoryFileV2 = {
      schemaVersion: 2,
      decisions: [{ id: 'd1', content: 'x', tags: [], createdAt: '', status: 'active' }],
      failures: [],
      successes: [],
      patterns: [],
    }
    seedRaw(d, '﻿' + JSON.stringify(v2, null, 2) + '\n')
    const mem = readMemory(d)
    expect(mem.decisions[0].content).toBe('x')
    expect(fs.existsSync(memPath(d) + '.v1.bak')).toBe(false) // 이미 v2 → 백업 안 함
    rm(d)
  })

  it('순수 migrateMemory — null/문자열/객체(비배열) 입력은 빈 v2', () => {
    expect(migrateMemory(null).decisions).toEqual([])
    expect(migrateMemory('just a string' as unknown).decisions).toEqual([])
    expect(migrateMemory({ foo: 'bar' } as unknown).decisions).toEqual([])
    // 배열이어도 content 가 문자열 아닌 항목은 건너뜀
    const v2 = migrateMemory([{ content: 'ok' }, { nope: 1 }, { content: 123 }])
    expect(v2.decisions).toHaveLength(1)
    expect(v2.decisions[0].content).toBe('ok')
  })

  it('파일 아예 없음 → 빈 v2 반환 + 디스크에 쓰지 않음', () => {
    const d = tmp() // .vhk/memory.json 없음
    const mem = readMemory(d)
    expect(mem.schemaVersion).toBe(2)
    expect(mem.decisions).toEqual([])
    expect(fs.existsSync(memPath(d))).toBe(false) // read 가 빈 파일 만들지 않음
    rm(d)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 케이스 3 — .v1.bak 원본 write-once 영구 보존
// ════════════════════════════════════════════════════════════════════════════
describe('memory v2 하드닝 3 — .v1.bak 원본 보존', () => {
  let origCwd: string
  beforeEach(() => {
    origCwd = process.cwd()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    process.exitCode = 0
  })
  afterEach(() => {
    process.chdir(origCwd)
    vi.restoreAllMocks()
    process.exitCode = 0
  })

  it('마이그레이션 후 add/archive 여러 번 — .v1.bak 은 v1 원본 그대로', async () => {
    const d = tmp()
    const original = [{ content: '원본1' }, { content: '원본2', tags: ['x'] }]
    seedV1(d, original)
    process.chdir(d)

    await memoryMigrate()
    await memoryAdd('새 결정')
    await memoryAdd('성공 기록', { type: 'success' })
    await memoryArchive('1')
    await memoryRemove('2')

    const v1bak = JSON.parse(fs.readFileSync(memPath(d) + '.v1.bak', 'utf-8'))
    expect(Array.isArray(v1bak)).toBe(true)
    expect(v1bak).toEqual(original) // 후속 쓰기들이 절대 못 덮음
    process.chdir(origCwd)
    rm(d)
  })

  it('.v1.bak 이 이미 있으면 write-once 가드로 덮어쓰지 않음', () => {
    const d = tmp()
    seedV1(d, [{ content: 'v1 데이터' }])
    const sentinel = '["SENTINEL_PRE_EXISTING_BAK"]'
    fs.writeFileSync(memPath(d) + '.v1.bak', sentinel, 'utf-8')

    writeMemory(d, migrateMemory(readMemory(d))) // 마이그레이션 1회 쓰기
    expect(fs.readFileSync(memPath(d) + '.v1.bak', 'utf-8')).toBe(sentinel) // 무변경
    rm(d)
  })

  it('롤링 .bak 은 최신 직전 상태, .v1.bak 은 원본 — 서로 다름', async () => {
    const d = tmp()
    seedV1(d, [{ content: '원본만' }])
    process.chdir(d)

    await memoryMigrate()
    await memoryAdd('두번째 결정')

    const v1bak = JSON.parse(fs.readFileSync(memPath(d) + '.v1.bak', 'utf-8'))
    const bak = JSON.parse(fs.readFileSync(memPath(d) + '.bak', 'utf-8'))
    expect(Array.isArray(v1bak)).toBe(true) // 원본 = v1 평면 배열
    expect(bak.schemaVersion).toBe(2) // 롤링 = 직전 v2 상태
    expect(bak.decisions).toHaveLength(1) // add '두번째' 직전 = 결정 1개
    process.chdir(origCwd)
    rm(d)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 케이스 4 — learn → failures.lesson 통합 + 중복 흡수 방지
// ════════════════════════════════════════════════════════════════════════════
describe('memory v2 하드닝 4 — learn 통합 + 중복 흡수 방지', () => {
  let origCwd: string
  beforeEach(() => {
    origCwd = process.cwd()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    vi.restoreAllMocks()
  })

  it('recordLesson 다회 — failures.lesson 누적 + id f1,f2 증가, learnings.md 미생성', () => {
    const d = tmp()
    const e1 = recordLesson(d, '교훈 하나', 7)
    const e2 = recordLesson(d, '교훈 둘') // goalId 없음 → no-goal
    expect(e1.id).toBe('f1')
    expect(e2.id).toBe('f2')
    const mem = readMem(d)
    expect(mem.failures.map((f) => f.lesson)).toEqual(['교훈 하나', '교훈 둘'])
    expect(mem.failures[0].tags).toEqual(['goal-7'])
    expect(mem.failures[1].tags).toEqual(['no-goal'])
    expect(fs.existsSync(path.join(d, 'docs', 'state', 'learnings.md'))).toBe(false)
    rm(d)
  })

  it('vhk learn 호출 → failures.lesson + learnings.md 신규 기록 안 함', async () => {
    const d = tmp()
    process.chdir(d)
    const { learn } = await import('../src/commands/agent.js')
    await learn('PowerShell 은 && 미지원')
    const mem = readMem(d)
    expect(mem.schemaVersion).toBe(2)
    expect(mem.failures[0].lesson).toBe('PowerShell 은 && 미지원')
    expect(fs.existsSync(path.join(d, 'docs', 'state', 'learnings.md'))).toBe(false)
    process.chdir(origCwd)
    rm(d)
  })

  it('learnings.md 흡수는 마이그레이션 1회뿐 — 이후 recordLesson 이 재흡수 안 함', () => {
    const d = tmp()
    seedV1(d, [{ content: '결정1' }])
    seedLearnings(d, '- [2026-01-01 goal-1] L1.\n- [2026-01-02 goal-2] L2.\n')

    const m1 = readMemory(d) // 마이그레이션: learnings 2개 흡수
    expect(m1.failures).toHaveLength(2)

    recordLesson(d, '새 교훈 추가') // failures 3번째
    const m2 = readMem(d)
    expect(m2.failures).toHaveLength(3) // 2(흡수) + 1(신규) — 재흡수 시 5가 됨
    const lessons = m2.failures.map((f) => f.lesson)
    expect(lessons).toEqual(['L1.', 'L2.', '새 교훈 추가']) // L1/L2 각 1회만
    rm(d)
  })

  it('마이그레이션 후 learnings.md 에 항목 추가돼도 재읽기는 흡수 안 함 (v2 디스크)', () => {
    const d = tmp()
    seedV1(d, [{ content: '결정' }])
    seedLearnings(d, '- [2026-01-01 goal-1] 원래교훈.\n')

    readMemory(d) // v1 → v2, 교훈 1개 흡수
    // 마이그레이션 후 learnings.md 가 더 늘어나는 상황을 모사
    fs.appendFileSync(path.join(d, 'docs', 'state', 'learnings.md'), '- [2026-02-02 goal-2] 추가교훈.\n', 'utf-8')

    const m = readMemory(d) // 디스크 v2 → learnings 무시
    expect(m.failures).toHaveLength(1)
    expect(m.failures[0].lesson).toBe('원래교훈.')
    rm(d)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 케이스 5 — status 전이 (active→archived) + archive 동작 + 잘못된 전이 거부
// ════════════════════════════════════════════════════════════════════════════
describe('memory v2 하드닝 5 — status 전이 / archive', () => {
  let origCwd: string
  beforeEach(() => {
    origCwd = process.cwd()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    process.exitCode = 0
  })
  afterEach(() => {
    process.chdir(origCwd)
    vi.restoreAllMocks()
    process.exitCode = 0
  })

  it('active → archived: archive 후 status/archivedAt 설정, 활성 렌더에서 제외', async () => {
    const d = tmp()
    process.chdir(d)
    await memoryAdd('보관 대상')
    await memoryArchive('1')
    const mem = readMem(d)
    expect(mem.decisions[0].status).toBe('archived')
    expect(typeof mem.decisions[0].archivedAt).toBe('string')
    // activeMemoryLines 는 active 만 — archived 제외
    expect(activeMemoryLines(mem).join('\n')).not.toContain('보관 대상')
    process.chdir(origCwd)
    rm(d)
  })

  it('잘못된 index (0 / 음수 / 비숫자 / 범위초과) → exit 1, 파일 무변경', async () => {
    const d = tmp()
    process.chdir(d)
    await memoryAdd('하나') // v2 생성
    const before = fs.readFileSync(memPath(d), 'utf-8')

    for (const bad of ['0', '-1', 'abc', '99']) {
      process.exitCode = 0
      await memoryArchive(bad)
      expect(process.exitCode).toBe(1)
    }
    // 잘못된 index 는 어떤 쓰기도 유발 안 함
    expect(fs.readFileSync(memPath(d), 'utf-8')).toBe(before)
    expect(readMem(d).decisions[0].status).toBe('active')
    process.chdir(origCwd)
    rm(d)
  })

  it('memoryRemove 잘못된 index → exit 1, 삭제 안 함', async () => {
    const d = tmp()
    process.chdir(d)
    await memoryAdd('남아야함')
    await memoryRemove('5')
    expect(process.exitCode).toBe(1)
    expect(readMem(d).decisions).toHaveLength(1)
    process.chdir(origCwd)
    rm(d)
  })

  it('resolved 상태(데이터)는 activeMemoryLines 에서 제외, archive 하면 archived 로 전이', async () => {
    const d = tmp()
    seedV2(d, {
      schemaVersion: 2,
      decisions: [
        { id: 'd1', content: '활성결정', tags: [], createdAt: '', status: 'active' },
        { id: 'd2', content: '해결결정', tags: [], createdAt: '', status: 'resolved' },
      ],
      failures: [],
      successes: [],
      patterns: [],
    })
    const mem = readMemory(d)
    const lines = activeMemoryLines(mem).join('\n')
    expect(lines).toContain('활성결정')
    expect(lines).not.toContain('해결결정') // resolved 는 active 렌더 제외

    process.chdir(d)
    // orderedAll 순서상 d2 는 index 2 — resolved → archived 전이
    await memoryArchive('2')
    expect(readMem(d).decisions[1].status).toBe('archived')
    process.chdir(origCwd)
    rm(d)
  })

  it('이미 archived 항목 재-archive → 크래시 없이 archived 유지 (idempotent re-stamp)', async () => {
    const d = tmp()
    process.chdir(d)
    await memoryAdd('두번보관')
    await memoryArchive('1')
    await memoryArchive('1') // 두 번째
    const mem = readMem(d)
    expect(mem.decisions[0].status).toBe('archived')
    process.chdir(origCwd)
    rm(d)
  })

  it('archived 항목 — 기본 목록 숨김, --all 로만 노출 (memoryList 스모크, no throw)', async () => {
    const d = tmp()
    process.chdir(d)
    await memoryAdd('활성것')
    await memoryAdd('보관것')
    await memoryArchive('2')
    await expect(memoryList()).resolves.not.toThrow()
    await expect(memoryList({ all: true })).resolves.not.toThrow()
    process.chdir(origCwd)
    rm(d)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 케이스 6 — secret 미포함 (4버킷 어디에도 토큰/API키 안 샘)
// memory.json 은 .gitignore 대상(로컬 전용). 핵심 불변식: memory 가 env/타 파일에서
// 시크릿을 자동 흡수하지 않는다 (사용자가 명시 입력하지 않는 한).
// ════════════════════════════════════════════════════════════════════════════
describe('memory v2 하드닝 6 — secret 미포함', () => {
  let origCwd: string
  beforeEach(() => {
    origCwd = process.cwd()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    vi.restoreAllMocks()
  })

  /** memory.json + 백업 파일 전부를 프로젝트 시크릿 스캐너로 검사 */
  function scanMemArtifacts(d: string): string[] {
    const hits: string[] = []
    for (const suffix of ['', '.bak', '.v1.bak']) {
      const p = memPath(d) + suffix
      if (!fs.existsSync(p)) continue
      const content = fs.readFileSync(p, 'utf-8')
      content.split('\n').forEach((line, i) => {
        for (const f of filterSevereFindings(findSecretsInLine(line, p, i + 1))) {
          hits.push(`${p}:${f.line} ${f.patternId}`)
        }
      })
    }
    return hits
  }

  it('정상 입력 후 memory 산출물에 시크릿 패턴 0건 (포맷이 시크릿 만들지 않음)', () => {
    const d = tmp()
    seedV1(d, [{ content: 'API 는 tRPC 사용', tags: ['api'] }])
    readMemory(d) // 마이그레이션 → v2 + 백업들
    recordLesson(d, '롤백은 백업 먼저', 1)
    expect(scanMemArtifacts(d)).toEqual([])
    rm(d)
  })

  it('환경변수/타 파일의 시크릿을 memory 가 자동 흡수하지 않음', async () => {
    const d = tmp()
    const ghToken = 'ghp_' + 'x'.repeat(36) // 가짜(패턴만 일치)
    const awsKey = 'AKIA' + 'ABCDEFGHIJKLMNOP'
    // 환경변수 + 프로젝트 파일에 시크릿 심기
    process.env.VHK_TEST_FAKE_SECRET = ghToken
    fs.writeFileSync(path.join(d, '.env'), `AWS_KEY=${awsKey}\n`, 'utf-8')
    seedLearnings(d, '- [2026-01-01 goal-1] 평범한 교훈.\n')
    seedV1(d, [{ content: '평범한 결정' }])
    try {
      process.chdir(d)
      readMemory(d) // 마이그레이션
      recordLesson(d, '또 다른 평범한 교훈')
      await context() // memory 를 렌더하는 경로

      const blob = [
        fs.readFileSync(memPath(d), 'utf-8'),
        fs.existsSync(memPath(d) + '.bak') ? fs.readFileSync(memPath(d) + '.bak', 'utf-8') : '',
        fs.existsSync(memPath(d) + '.v1.bak') ? fs.readFileSync(memPath(d) + '.v1.bak', 'utf-8') : '',
        fs.readFileSync(path.join(d, '.vhk', 'context.md'), 'utf-8'),
      ].join('\n')
      expect(blob).not.toContain(ghToken) // env 시크릿 누출 없음
      expect(blob).not.toContain(awsKey) // .env 시크릿 누출 없음
    } finally {
      delete process.env.VHK_TEST_FAKE_SECRET
      process.chdir(origCwd)
      rm(d)
    }
  })

  it('[characterization] memoryAdd 는 content 를 verbatim 저장 — redaction 없음 (.gitignore 의존)', async () => {
    const d = tmp()
    const secret = 'ghp_' + 'y'.repeat(36)
    process.chdir(d)
    await memoryAdd(`토큰 메모: ${secret}`)
    // 현 구현은 redaction 안 함 → verbatim 저장됨을 못박음 (창 A 판단용 finding 근거)
    expect(fs.readFileSync(memPath(d), 'utf-8')).toContain(secret)
    // 동시에 스캐너는 이를 시크릿으로 탐지 (= memory 가 자체 스캔하지 않는다는 갭 증명)
    const found = filterSevereFindings(findSecretsInLine(secret, memPath(d), 1))
    expect(found.length).toBeGreaterThan(0)
    process.chdir(origCwd)
    rm(d)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// 케이스 7 — v1 API 무파괴 회귀 (add / list / remove 기존 동작)
// ════════════════════════════════════════════════════════════════════════════
describe('memory v2 하드닝 7 — add/list/remove 무파괴 회귀', () => {
  let origCwd: string
  beforeEach(() => {
    origCwd = process.cwd()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    process.exitCode = 0
  })
  afterEach(() => {
    process.chdir(origCwd)
    vi.restoreAllMocks()
    process.exitCode = 0
  })

  it('add 3 → list(스모크) → remove 중간 → 정확히 남음 (id d1,d2,d3)', async () => {
    const d = tmp()
    process.chdir(d)
    await memoryAdd('첫째')
    await memoryAdd('둘째')
    await memoryAdd('셋째')
    let mem = readMem(d)
    expect(mem.decisions.map((e) => e.id)).toEqual(['d1', 'd2', 'd3'])
    expect(mem.decisions.every((e) => e.status === 'active')).toBe(true)

    await expect(memoryList()).resolves.not.toThrow()

    await memoryRemove('2') // 중간(둘째) 삭제
    mem = readMem(d)
    expect(mem.decisions.map((e) => e.content)).toEqual(['첫째', '셋째'])
    process.chdir(origCwd)
    rm(d)
  })

  it('remove 후 nextId 는 잔존 max+1 (id 단조, 충돌 없음)', async () => {
    const d = tmp()
    process.chdir(d)
    await memoryAdd('A') // d1
    await memoryAdd('B') // d2
    await memoryRemove('1') // d1 삭제 → 남은 [d2]
    await memoryAdd('C') // max(2)+1 = d3
    const mem = readMem(d)
    expect(mem.decisions.map((e) => e.id)).toEqual(['d2', 'd3'])
    expect(mem.decisions.map((e) => e.content)).toEqual(['B', 'C'])
    process.chdir(origCwd)
    rm(d)
  })

  it('버킷별 id prefix 독립 (decision d / failure f / success s) + orderedAll 순서대로 remove', async () => {
    const d = tmp()
    process.chdir(d)
    await memoryAdd('결정', { type: 'decision' })
    await memoryAdd('실패', { type: 'failure', lesson: 'L' })
    await memoryAdd('성공', { type: 'success' })
    let mem = readMem(d)
    expect(mem.decisions[0].id).toBe('d1')
    expect(mem.failures[0].id).toBe('f1')
    expect(mem.successes[0].id).toBe('s1')

    // orderedAll = decisions→failures→successes: index 2 = failure
    await memoryRemove('2')
    mem = readMem(d)
    expect(mem.failures).toHaveLength(0)
    expect(mem.decisions).toHaveLength(1)
    expect(mem.successes).toHaveLength(1)
    process.chdir(origCwd)
    rm(d)
  })

  it('빈 메모리에서 remove → exit 1 (크래시 없음)', async () => {
    const d = tmp()
    process.chdir(d)
    await memoryRemove('1')
    expect(process.exitCode).toBe(1)
    process.chdir(origCwd)
    rm(d)
  })

  it('빈 content add → exit 1, 파일 미생성', async () => {
    const d = tmp()
    process.chdir(d)
    await memoryAdd('   ')
    expect(process.exitCode).toBe(1)
    expect(fs.existsSync(memPath(d))).toBe(false)
    process.chdir(origCwd)
    rm(d)
  })
})
