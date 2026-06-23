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
  memoryArchive,
  activeMemoryLines,
  MEMORY_PATH_REL,
  type MemoryFileV2,
} from '../src/commands/memory.js'
import { context } from '../src/commands/context.js'

// ────────────────────────────────────────────────────────────────────────────
// 창 C — memory v2 엣지 하드닝 2탄 (ultracode 멀티렌즈 리뷰에서 도출 → 자체 검증).
// 워크플로 권고는 그대로 안 씀: 기대값을 src/commands/memory.ts 실제 로직으로 재유도해
// 못박음. (예: parseLearnings 정규식 `\]\s*(.+)` 은 `]` 직후 공백 없는 교훈도 매칭 →
// 워크플로가 제시한 "length 1" 은 틀림. 실제 동작 기준으로 작성.)
// 전부 현 구현에서 green = characterization. Windows: chdir(origCwd) → rmSync 순서.
// ────────────────────────────────────────────────────────────────────────────

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-meme-'))
}
function memPath(d: string): string {
  return path.join(d, MEMORY_PATH_REL)
}
function seedV1(d: string, arr: unknown[]): void {
  fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
  fs.writeFileSync(memPath(d), JSON.stringify(arr), 'utf-8')
}
function seedRaw(d: string, raw: string): void {
  fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
  fs.writeFileSync(memPath(d), raw, 'utf-8')
}
function seedV2(d: string, mem: MemoryFileV2): void {
  fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
  fs.writeFileSync(memPath(d), JSON.stringify(mem, null, 2) + '\n', 'utf-8')
}
function readMem(d: string): MemoryFileV2 {
  return JSON.parse(fs.readFileSync(memPath(d), 'utf-8'))
}
function rm(d: string): void {
  fs.rmSync(d, { recursive: true, force: true })
}
function entry(over: Partial<MemoryFileV2['decisions'][number]> = {}) {
  return { id: 'd1', content: 'x', tags: [], createdAt: '', status: 'active' as const, ...over }
}

// ════════════════════════════════════════════════════════════════════════════
// A — learnings.md 흡수(마이그레이션) 파싱 견고성
//   parseLearnings regex: /^-\s*\[(\d{4}-\d{2}-\d{2})\s+([^\]]*)\]\s*(.+)$/
// ════════════════════════════════════════════════════════════════════════════
describe('memory v2 엣지 A — learnings 흡수 파싱', () => {
  it('정상/무효 혼합 — date 없음·] 직전 공백 없음(태그 누락)·리스트 아님 은 드롭', () => {
    const mixed =
      '- [2026-01-01 goal-1] 유효교훈.\n' + // 매칭
      '- [bad goal-1] 날짜불량\n' + // date 정규식 실패 → 드롭
      '- [2026-01-02] 태그공백없음\n' + // date 뒤 `\s+태그` 없음 → 드롭
      'random 일반 텍스트\n' // `^-\s*\[` 아님 → 드롭
    const v2 = migrateMemory([], mixed)
    expect(v2.failures).toHaveLength(1)
    expect(v2.failures[0].lesson).toBe('유효교훈.')
    expect(v2.failures[0].tags).toEqual(['goal-1'])
  })

  it('[characterization] `]` 직후 공백 없는 교훈도 매칭 (\\s* 가 0 허용)', () => {
    const v2 = migrateMemory([], '- [2026-01-03 goal-2]즉시교훈\n')
    expect(v2.failures).toHaveLength(1)
    expect(v2.failures[0].lesson).toBe('즉시교훈')
    expect(v2.failures[0].tags).toEqual(['goal-2'])
  })

  it('공백만 태그 → 빈 tags 배열', () => {
    const v2 = migrateMemory([], '- [2026-01-01 ] 교훈.\n')
    expect(v2.failures).toHaveLength(1)
    expect(v2.failures[0].tags).toEqual([])
    expect(v2.failures[0].lesson).toBe('교훈.')
  })

  it('다중 단어 태그 — 내부 공백 보존', () => {
    const v2 = migrateMemory([], '- [2026-05-27 goal-1 extra] 교훈.\n')
    expect(v2.failures[0].tags).toEqual(['goal-1 extra'])
  })

  it('공백만 교훈 → trim 후 빈 문자열 lesson (드롭 안 함)', () => {
    const v2 = migrateMemory([], '- [2026-01-01 goal-1]     ')
    expect(v2.failures).toHaveLength(1)
    expect(v2.failures[0].lesson).toBe('')
    expect(v2.failures[0].tags).toEqual(['goal-1'])
  })

  it('[characterization] 비현실 날짜(2026-13-01)도 의미검증 없이 as-is 저장', () => {
    const v2 = migrateMemory([], '- [2026-13-01 goal-1] 교훈.\n')
    expect(v2.failures).toHaveLength(1)
    expect(v2.failures[0].createdAt).toBe('2026-13-01')
  })

  it('매칭 라인 0개 learnings → failures 빈 배열 (에러 없음)', () => {
    expect(migrateMemory([], '# Learnings\n\n그냥 텍스트\n').failures).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════════════════════
// B — v1 데이터 변형 흡수
// ════════════════════════════════════════════════════════════════════════════
describe('memory v2 엣지 B — v1 데이터 변형', () => {
  it('tags 가 배열 아님(scalar/object) → [] 로 강제 (조용한 손실 특성)', () => {
    const a = migrateMemory([{ content: 'A', tags: 'single' }])
    expect(a.decisions[0].tags).toEqual([])
    const b = migrateMemory([{ content: 'B', tags: { category: 'api' } }])
    expect(b.decisions[0].tags).toEqual([])
  })

  it('addedAt 없으면 createdAt 빈 문자열', () => {
    const v2 = migrateMemory([{ content: 'A' }])
    expect(v2.decisions[0].createdAt).toBe('')
    expect(v2.decisions[0].status).toBe('active')
  })

  it('emoji/RTL/결합문자 content — 마이그레이션+디스크 왕복 무손상', () => {
    const d = tmp()
    seedV1(d, [{ content: '결정 🎯' }, { content: 'café' }, { content: 'العربية' }])
    const m1 = readMemory(d)
    expect(m1.decisions[0].content).toBe('결정 🎯')
    expect(m1.decisions[1].content).toBe('café')
    expect(m1.decisions[2].content).toBe('العربية')
    const m2 = readMemory(d) // 디스크 v2 재읽기
    expect(JSON.stringify(m2)).toBe(JSON.stringify(m1))
    rm(d)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// C — 인코딩 정규화 / 손상 v2
// ════════════════════════════════════════════════════════════════════════════
describe('memory v2 엣지 C — 인코딩/손상 v2', () => {
  it('CRLF v2 입력 → read→write 후 canonical LF (CRLF 제거)', () => {
    const d = tmp()
    const v2: MemoryFileV2 = { schemaVersion: 2, decisions: [entry()], failures: [], successes: [], patterns: [] }
    const crlf = JSON.stringify(v2, null, 2).replace(/\n/g, '\r\n') + '\r\n'
    seedRaw(d, crlf)
    expect(fs.readFileSync(memPath(d), 'utf-8')).toContain('\r\n')
    writeMemory(d, readMemory(d))
    const after = fs.readFileSync(memPath(d), 'utf-8')
    expect(after).not.toContain('\r\n')
    expect(after).toBe(JSON.stringify(v2, null, 2) + '\n')
    rm(d)
  })

  it('BOM v2 → read→write 후 출력 BOM 없음(canonical)', () => {
    const d = tmp()
    const v2: MemoryFileV2 = { schemaVersion: 2, decisions: [entry({ content: 'canonical' })], failures: [], successes: [], patterns: [] }
    seedRaw(d, '﻿' + JSON.stringify(v2, null, 2) + '\n')
    expect(fs.readFileSync(memPath(d), 'utf-8').charCodeAt(0)).toBe(0xfeff)
    writeMemory(d, readMemory(d))
    const out = fs.readFileSync(memPath(d), 'utf-8')
    expect(out.charCodeAt(0)).not.toBe(0xfeff)
    expect(out.charCodeAt(0)).toBe(0x7b) // '{'
    rm(d)
  })

  it('손상 v2(버킷 타입 틀림/누락) → arr() 안전 강등으로 빈 배열, 크래시 없음', () => {
    const d = tmp()
    seedRaw(d, '{"schemaVersion":2,"decisions":"notarray","failures":null,"successes":123,"patterns":{}}')
    const m = readMemory(d)
    expect(m.decisions).toEqual([])
    expect(m.failures).toEqual([])
    expect(m.successes).toEqual([])
    expect(m.patterns).toEqual([])
    rm(d)
  })

  it('버킷 전부 누락된 v2 → 빈 배열로 정규화', () => {
    const d = tmp()
    seedRaw(d, '{"schemaVersion":2}')
    const m = readMemory(d)
    expect(m.decisions).toEqual([])
    expect(m.patterns).toEqual([])
    rm(d)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// D — id / index 경계 (커맨드)
// ════════════════════════════════════════════════════════════════════════════
describe('memory v2 엣지 D — id/index 경계', () => {
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

  it('[characterization] nextId 는 malformed id(d1a/d3x) regex 필터 → 정상 id 만으로 max', async () => {
    const d = tmp()
    seedV2(d, {
      schemaVersion: 2,
      decisions: [
        entry({ id: 'd1', content: 'ok' }),
        entry({ id: 'd1a', content: 'malformed' }),
        entry({ id: 'd2', content: 'ok' }),
        entry({ id: 'd3x', content: 'malformed' }),
      ],
      failures: [],
      successes: [],
      patterns: [],
    })
    process.chdir(d)
    await memoryAdd('새것') // max(1,2)=2 → d3
    const added = readMem(d).decisions.find((e) => e.content === '새것')
    expect(added?.id).toBe('d3')
    process.chdir(origCwd)
    rm(d)
  })

  it('빈 메모리에서 archive → exit 1 (remove 와 대칭, 크래시 없음)', async () => {
    const d = tmp()
    process.chdir(d)
    await memoryArchive('1')
    expect(process.exitCode).toBe(1)
    process.chdir(origCwd)
    rm(d)
  })

  // #318: 소수 index 는 더 이상 parseInt 절삭으로 수용되지 않는다 — 엄격 정수 검증으로 거부.
  it('소수 index("2.9") → 거부 (parseInt 절삭 금지) + 보관 0 + exit 1', async () => {
    const d = tmp()
    process.chdir(d)
    await memoryAdd('첫째')
    await memoryAdd('둘째')
    await memoryArchive('2.9') // 옛 동작: parseInt('2.9')=2 → idx1 archive. 이제 거부.
    const mem = readMem(d)
    expect(mem.decisions[0].status).toBe('active')
    expect(mem.decisions[1].status).toBe('active') // 엉뚱한 절삭 보관 없음
    expect(process.exitCode).toBe(1)
    process.chdir(origCwd)
    rm(d)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// E — resolved 상태 (도달 불가 특성 + 전이)
// ════════════════════════════════════════════════════════════════════════════
describe('memory v2 엣지 E — resolved 상태', () => {
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

  it('[characterization/finding] 공개 커맨드로 resolved 생성 불가 (add→active, archive→archived)', async () => {
    const d = tmp()
    process.chdir(d)
    await memoryAdd('결정')
    await memoryAdd('실패', { type: 'failure', lesson: 'L' })
    await memoryArchive('1')
    const mem = readMem(d)
    const statuses = [...mem.decisions, ...mem.failures].map((e) => e.status)
    expect(statuses).not.toContain('resolved') // resolved 는 어떤 커맨드도 안 만듦
    expect(mem.decisions[0].status).toBe('archived')
    process.chdir(origCwd)
    rm(d)
  })

  it('디스크의 resolved 항목 — resolvedAt 미설정(undefined), archive 시 archived+archivedAt', async () => {
    const d = tmp()
    seedV2(d, {
      schemaVersion: 2,
      decisions: [entry({ id: 'd1', content: '활성' }), entry({ id: 'd2', content: '해결', status: 'resolved' })],
      failures: [],
      successes: [],
      patterns: [],
    })
    expect(readMem(d).decisions[1].resolvedAt).toBeUndefined() // 코드가 resolvedAt 안 씀
    process.chdir(d)
    await memoryArchive('2') // resolved → archived
    const mem = readMem(d)
    expect(mem.decisions[1].status).toBe('archived')
    expect(typeof mem.decisions[1].archivedAt).toBe('string') // archivedAt 설정됨
    process.chdir(origCwd)
    rm(d)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// F — learn / recordLesson / memoryAdd lesson
// ════════════════════════════════════════════════════════════════════════════
describe('memory v2 엣지 F — learn/lesson', () => {
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

  it('recordLesson goalId=0(falsy 숫자) → tag goal-0 (no-goal 아님)', () => {
    const d = tmp()
    const e = recordLesson(d, '교훈', 0)
    expect(e.tags).toEqual(['goal-0']) // goalId !== undefined → 0 도 유효
    rm(d)
  })

  it('[characterization] recordLesson 은 공백 lesson 거부 안 함 → trim 후 빈 문자열 저장', () => {
    const d = tmp()
    const e = recordLesson(d, '    ')
    expect(e.lesson).toBe('')
    expect(readMem(d).failures).toHaveLength(1)
    rm(d)
  })

  it('[characterization/finding] memoryAdd 의 lesson 은 trim 안 함 (recordLesson 과 불일치)', async () => {
    const d = tmp()
    process.chdir(d)
    await memoryAdd('내용', { type: 'failure', lesson: '  공백둘러쌈  ' })
    expect(readMem(d).failures[0].lesson).toBe('  공백둘러쌈  ') // verbatim (content 는 trim 되지만 lesson 은 아님)
    process.chdir(origCwd)
    rm(d)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// G — activeMemoryLines 렌더 분기
// ════════════════════════════════════════════════════════════════════════════
describe('memory v2 엣지 G — activeMemoryLines 렌더', () => {
  it('active > limit → 최근 limit개 + "… 외 N개" 절단', () => {
    const decisions = Array.from({ length: 7 }, (_, i) =>
      entry({ id: `d${i + 1}`, content: `결정${i + 1}` })
    )
    const mem: MemoryFileV2 = { schemaVersion: 2, decisions, failures: [], successes: [], patterns: [] }
    const out = activeMemoryLines(mem, 5).join('\n')
    expect(out).toContain('결정3') // 최근 5개 = 결정3..7
    expect(out).toContain('결정7')
    expect(out).not.toContain('결정1') // 잘림
    expect(out).toContain('… 외 2개')
  })

  it('failure 에 content+lesson 둘 다 → "content — 💡 lesson" 포맷', () => {
    const mem: MemoryFileV2 = {
      schemaVersion: 2,
      decisions: [],
      failures: [{ id: 'f1', content: '기술부채', tags: [], createdAt: '', status: 'active', lesson: '자동테스트 필수' }],
      successes: [],
      patterns: [],
    }
    expect(activeMemoryLines(mem).join('\n')).toContain('기술부채 — 💡 자동테스트 필수')
  })

  it('patterns 있으면 카운트 라인 노출', () => {
    const mem: MemoryFileV2 = {
      schemaVersion: 2,
      decisions: [],
      failures: [],
      successes: [],
      patterns: [{ id: 'p1' }, { id: 'p2' }],
    }
    const out = activeMemoryLines(mem).join('\n')
    expect(out).toContain('2개')
    expect(out).toContain('vhk pattern')
  })

  it('active 0 + patterns 0 → 빈 출력(섹션 헤더 없음)', () => {
    const mem: MemoryFileV2 = {
      schemaVersion: 2,
      decisions: [entry({ status: 'archived' })],
      failures: [{ id: 'f1', content: '', tags: [], createdAt: '', status: 'archived', lesson: 'L' }],
      successes: [],
      patterns: [],
    }
    const lines = activeMemoryLines(mem)
    expect(lines.join('\n')).not.toContain('결정')
    expect(lines.join('\n')).not.toContain('실패')
    expect(lines.filter((l) => l.startsWith('**'))).toHaveLength(0)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// H — 통합 / write-once 견고성
// ════════════════════════════════════════════════════════════════════════════
describe('memory v2 엣지 H — 통합/write-once', () => {
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

  it('context() — 손상 memory.json 이어도 크래시 없이 context.md 생성', async () => {
    const d = tmp()
    seedRaw(d, '{ broken json ]]')
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 't', version: '0.0.0' }), 'utf-8')
    process.chdir(d)
    await expect(context()).resolves.not.toThrow()
    expect(fs.existsSync(path.join(d, '.vhk', 'context.md'))).toBe(true)
    process.chdir(origCwd)
    rm(d)
  })

  it('외부 revert(v2→v1) 후 readMemory 재실행 — .v1.bak write-once 유지, 다시 v2 영구화', () => {
    const d = tmp()
    seedV1(d, [{ content: '원본' }])
    readMemory(d) // 1회: v1→v2, .v1.bak = 원본 v1
    const bak1 = fs.readFileSync(memPath(d) + '.v1.bak', 'utf-8')
    fs.writeFileSync(memPath(d), JSON.stringify([{ content: '원본' }]), 'utf-8') // 외부 v1 revert
    readMemory(d) // 2회: 디스크 v1 → 재마이그레이션, 단 .v1.bak 존재 → write-once 가드
    const bak2 = fs.readFileSync(memPath(d) + '.v1.bak', 'utf-8')
    expect(bak2).toBe(bak1) // .v1.bak 무변경
    expect(readMem(d).schemaVersion).toBe(2) // memory.json 다시 v2
    rm(d)
  })
})
