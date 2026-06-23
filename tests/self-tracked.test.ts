import { describe, it, expect } from 'vitest'
import {
  isSelfTrackedPath,
  porcelainPath,
  filterSelfTrackedLines,
  SELF_TRACKED_FILES,
} from '../src/lib/self-tracked.js'

// Goal 85 (#315): vhk 자기 산출 추적파일(.vhk/ledger.jsonl·.vhk/events/*.jsonl)을
// dirty 판정에서만 제외. ★퇴행 0 = 진짜 소스 변경·그 외 .vhk 파일은 여전히 dirty.

describe('isSelfTrackedPath — vhk 자기 산출 추적파일 화이트리스트', () => {
  it('증거 원장 .vhk/ledger.jsonl → true', () => {
    expect(isSelfTrackedPath('.vhk/ledger.jsonl')).toBe(true)
  })
  it('행동 원장 .vhk/events/ai-actions.jsonl → true', () => {
    expect(isSelfTrackedPath('.vhk/events/ai-actions.jsonl')).toBe(true)
  })
  it('.vhk/events/ 하위 임의 *.jsonl(미래 확장) → true', () => {
    expect(isSelfTrackedPath('.vhk/events/something-new.jsonl')).toBe(true)
  })
  // #371: diff-cover 측정 로그(.vhk/events/diff-cover.jsonl)도 자기 산출 추적파일 →
  // diff-cover 실행이 스스로 이 줄을 append 해도 dirty 로 잡히지 않아야 함(자기참조 봉인).
  it('#371 diff-cover 측정 로그 .vhk/events/diff-cover.jsonl → true', () => {
    expect(isSelfTrackedPath('.vhk/events/diff-cover.jsonl')).toBe(true)
  })
  it('Windows 백슬래시 경로도 정규화해서 매칭', () => {
    expect(isSelfTrackedPath('.vhk\\ledger.jsonl')).toBe(true)
    expect(isSelfTrackedPath('.vhk\\events\\ai-actions.jsonl')).toBe(true)
  })
  it('선행 ./ 가 붙어도 매칭', () => {
    expect(isSelfTrackedPath('./.vhk/ledger.jsonl')).toBe(true)
  })

  // ── 과확장 0 (사각지대 방지) ──
  it('진짜 소스 파일 → false (퇴행 0)', () => {
    expect(isSelfTrackedPath('src/commands/verify.ts')).toBe(false)
    expect(isSelfTrackedPath('src/lib/self-tracked.ts')).toBe(false)
  })
  it('그 외 .vhk 파일(config.json·context.md 등) → false (과확장 0)', () => {
    expect(isSelfTrackedPath('.vhk/config.json')).toBe(false)
    expect(isSelfTrackedPath('.vhk/context.md')).toBe(false)
    expect(isSelfTrackedPath('.vhk/README.md')).toBe(false)
    expect(isSelfTrackedPath('.vhk/reports/latest.json')).toBe(false)
  })
  it('.vhk/events/ 하위라도 .jsonl 이 아니면 → false (확장자 정확)', () => {
    expect(isSelfTrackedPath('.vhk/events/notes.md')).toBe(false)
    expect(isSelfTrackedPath('.vhk/events/data.json')).toBe(false)
  })
  it('이름만 비슷한 다른 위치의 ledger.jsonl → false (정확 일치)', () => {
    expect(isSelfTrackedPath('ledger.jsonl')).toBe(false)
    expect(isSelfTrackedPath('docs/.vhk/ledger.jsonl')).toBe(false)
  })
})

describe('porcelainPath — porcelain 라인에서 경로 추출', () => {
  it('수정 파일 " M src/a.ts" → src/a.ts', () => {
    expect(porcelainPath(' M src/a.ts')).toBe('src/a.ts')
  })
  it('untracked "?? .vhk/ledger.jsonl" → .vhk/ledger.jsonl', () => {
    expect(porcelainPath('?? .vhk/ledger.jsonl')).toBe('.vhk/ledger.jsonl')
  })
  it('staged "M  .vhk/ledger.jsonl" → .vhk/ledger.jsonl', () => {
    expect(porcelainPath('M  .vhk/ledger.jsonl')).toBe('.vhk/ledger.jsonl')
  })
  it('rename "R  old.ts -> new.ts" → 도착지 new.ts', () => {
    expect(porcelainPath('R  old.ts -> new.ts')).toBe('new.ts')
  })
})

describe('filterSelfTrackedLines — 자기파일만 제외(나머지는 dirty 유지)', () => {
  it('자기 ledger 만 변경 → 빈 배열(= clean 취급)', () => {
    expect(filterSelfTrackedLines([' M .vhk/ledger.jsonl'])).toEqual([])
    expect(
      filterSelfTrackedLines(['?? .vhk/ledger.jsonl', ' M .vhk/events/ai-actions.jsonl'])
    ).toEqual([])
  })
  it('자기 ledger + 진짜 소스 변경 → 소스 변경 라인만 남음(dirty 유지)', () => {
    expect(
      filterSelfTrackedLines([' M .vhk/ledger.jsonl', ' M src/a.ts'])
    ).toEqual([' M src/a.ts'])
  })
  it('그 외 .vhk 파일 변경은 남음(과확장 0)', () => {
    expect(filterSelfTrackedLines([' M .vhk/config.json'])).toEqual([' M .vhk/config.json'])
  })
})

describe('SELF_TRACKED_FILES — 최소·정확(분산 금지 SoT)', () => {
  it('두 종류(ledger·ai-actions)만 명시', () => {
    expect([...SELF_TRACKED_FILES].sort()).toEqual(
      ['.vhk/events/ai-actions.jsonl', '.vhk/ledger.jsonl'].sort()
    )
  })
})
