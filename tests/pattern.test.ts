import { describe, it, expect } from 'vitest'
import { detectCandidates, tokenize, MIN_TAG_FREQ, MIN_KEYWORD_FREQ } from '../src/commands/pattern.js'
import type { MemoryFileV2, FailEntry, SuccessEntry } from '../src/commands/memory.js'

/**
 * Goal 19: pattern detection v0 단위 테스트.
 * 순수 함수(detectCandidates, tokenize) 만 테스트 — fs/Date 부수효과 없음.
 * 결정적 입력 → 결정적 출력. ML/외부 라이브러리 0.
 */

function emptyMem(): MemoryFileV2 {
  return { schemaVersion: 2, decisions: [], failures: [], successes: [], patterns: [] }
}

function fail(id: string, tags: string[], lesson: string): FailEntry {
  return { id, content: '', tags, createdAt: '2026-01-01T00:00:00Z', status: 'active', lesson }
}

function success(id: string, tags: string[], content: string): SuccessEntry {
  return { id, content, tags, createdAt: '2026-01-01T00:00:00Z', status: 'active' }
}

// ── tokenize ──────────────────────────────────────────────────────────────────

describe('tokenize', () => {
  it('소문자 변환 + 구두점 제거', () => {
    const tokens = tokenize('Hello, World!')
    expect(tokens).toContain('hello')
    expect(tokens).toContain('world')
  })

  it('한국어 토큰 포함', () => {
    const tokens = tokenize('타입스크립트 오류 발생')
    expect(tokens).toContain('타입스크립트')
    expect(tokens).toContain('오류')
  })

  it('불용어 제거', () => {
    const tokens = tokenize('the quick brown fox')
    expect(tokens).not.toContain('the')
    expect(tokens).toContain('quick')
  })

  it('2자 미만 토큰 제거', () => {
    const tokens = tokenize('a b cd ef')
    expect(tokens).not.toContain('a')
    expect(tokens).not.toContain('b')
    expect(tokens).toContain('cd')
    expect(tokens).toContain('ef')
  })
})

// ── detectCandidates ─────────────────────────────────────────────────────────

describe('detectCandidates — 태그 군집 (축1)', () => {
  it('임계 이상 동일 태그 → avoid 후보', () => {
    const mem = emptyMem()
    mem.failures = [
      fail('f1', ['build'], '빌드 실패'),
      fail('f2', ['build'], '타입 오류'),
      fail('f3', ['build'], '컴파일 실패'),
    ]
    const candidates = detectCandidates(mem, 3)
    const tagCand = candidates.filter(c => c.axis === 'tag' && c.signal === 'build')
    expect(tagCand).toHaveLength(1)
    expect(tagCand[0].kind).toBe('avoid')
    expect(tagCand[0].count).toBe(3)
    expect(tagCand[0].sources).toEqual(['f1', 'f2', 'f3'])
  })

  it('임계 미달 태그 → 감지 안 됨', () => {
    const mem = emptyMem()
    mem.failures = [
      fail('f1', ['auth'], '로그인 실패'),
      fail('f2', ['auth'], '토큰 만료'),
    ]
    const candidates = detectCandidates(mem, 3)
    expect(candidates.filter(c => c.signal === 'auth')).toHaveLength(0)
  })

  it('no-goal 태그 제외', () => {
    const mem = emptyMem()
    mem.failures = [
      fail('f1', ['no-goal'], '교훈1'),
      fail('f2', ['no-goal'], '교훈2'),
      fail('f3', ['no-goal'], '교훈3'),
    ]
    const candidates = detectCandidates(mem, 3)
    expect(candidates.filter(c => c.signal === 'no-goal')).toHaveLength(0)
  })

  it('successes → reinforce 후보', () => {
    const mem = emptyMem()
    mem.successes = [
      success('s1', ['tdd'], 'TDD로 버그 없음'),
      success('s2', ['tdd'], '테스트 커버리지 높음'),
      success('s3', ['tdd'], '리팩토링 용이'),
    ]
    const candidates = detectCandidates(mem, 3)
    const tagCand = candidates.filter(c => c.axis === 'tag' && c.signal === 'tdd')
    expect(tagCand).toHaveLength(1)
    expect(tagCand[0].kind).toBe('reinforce')
    expect(tagCand[0].count).toBe(3)
  })
})

describe('detectCandidates — 키워드 문서빈도 (축2)', () => {
  it('공통 키워드 3건 이상 → 후보', () => {
    const mem = emptyMem()
    mem.failures = [
      fail('f1', [], '타입스크립트 오류 발생'),
      fail('f2', [], '타입스크립트 컴파일 문제'),
      fail('f3', [], '타입스크립트 빌드 실패'),
    ]
    const candidates = detectCandidates(mem, 3)
    const kwCand = candidates.filter(c => c.axis === 'keyword' && c.signal === '타입스크립트')
    expect(kwCand).toHaveLength(1)
    expect(kwCand[0].kind).toBe('avoid')
    expect(kwCand[0].count).toBe(3)
  })

  it('한 항목에 같은 단어 여러 번 → 문서빈도는 1로 계산', () => {
    const mem = emptyMem()
    mem.failures = [
      fail('f1', [], '오류 오류 오류'),
      fail('f2', [], '오류가 발생했음'),
    ]
    const candidates = detectCandidates(mem, 3)
    const kwCand = candidates.filter(c => c.axis === 'keyword' && c.signal === '오류')
    // 2건 → 임계 3 미달
    expect(kwCand).toHaveLength(0)
  })
})

describe('detectCandidates — active 만 처리', () => {
  it('archived 항목은 감지 제외', () => {
    const mem = emptyMem()
    mem.failures = [
      { ...fail('f1', ['env'], '환경변수 오류'), status: 'archived' },
      { ...fail('f2', ['env'], '환경변수 문제'), status: 'archived' },
      { ...fail('f3', ['env'], '환경변수 누락'), status: 'archived' },
    ]
    const candidates = detectCandidates(mem, 3)
    expect(candidates.filter(c => c.signal === 'env')).toHaveLength(0)
  })

  it('resolved 항목은 감지 제외', () => {
    const mem = emptyMem()
    mem.failures = [
      { ...fail('f1', ['goal-1'], '교훈'), status: 'resolved' },
      { ...fail('f2', ['goal-1'], '교훈'), status: 'resolved' },
      { ...fail('f3', ['goal-1'], '교훈'), status: 'resolved' },
    ]
    const candidates = detectCandidates(mem, 3)
    expect(candidates.filter(c => c.signal === 'goal-1')).toHaveLength(0)
  })
})

describe('detectCandidates — 정렬·결정성', () => {
  it('동일 입력 → 동일 순서(count desc, signal asc)', () => {
    const mem = emptyMem()
    mem.failures = [
      fail('f1', ['auth', 'build'], '오류1'),
      fail('f2', ['auth', 'build'], '오류2'),
      fail('f3', ['auth', 'build'], '오류3'),
      fail('f4', ['auth'], '오류4'),
      fail('f5', ['auth'], '오류5'),
      fail('f6', ['auth'], '오류6'),
      fail('f7', ['auth'], '오류7'),
    ]
    const r1 = detectCandidates(mem, 3)
    const r2 = detectCandidates(mem, 3)
    expect(r1.map(c => `${c.axis}:${c.signal}`)).toEqual(r2.map(c => `${c.axis}:${c.signal}`))
  })

  it('count 높은 것이 먼저', () => {
    const mem = emptyMem()
    mem.failures = [
      fail('f1', ['rare'], '오류'),
      fail('f2', ['rare'], '오류'),
      fail('f3', ['rare'], '오류'),
      fail('f4', ['common', 'rare'], '오류'),
      fail('f5', ['common', 'rare'], '오류'),
      fail('f6', ['common', 'rare'], '오류'),
      fail('f7', ['common'], '오류'),
    ]
    const tagCands = detectCandidates(mem, 3).filter(c => c.axis === 'tag')
    // common: 4건, rare: 6건 → rare 먼저
    expect(tagCands[0].count).toBeGreaterThanOrEqual(tagCands[1]?.count ?? 0)
  })
})

describe('detectCandidates — --min 임계 조정', () => {
  it('--min 2 → 2건 이상에서 감지', () => {
    const mem = emptyMem()
    mem.failures = [
      fail('f1', ['deploy'], '오류1'),
      fail('f2', ['deploy'], '오류2'),
    ]
    const candidates = detectCandidates(mem, 2)
    expect(candidates.filter(c => c.signal === 'deploy')).toHaveLength(1)
  })

  it('--min 5 → 4건으로는 미탐', () => {
    const mem = emptyMem()
    mem.failures = Array.from({ length: 4 }, (_, i) =>
      fail(`f${i + 1}`, ['net'], `오류${i + 1}`)
    )
    const candidates = detectCandidates(mem, 5)
    expect(candidates.filter(c => c.signal === 'net')).toHaveLength(0)
  })
})

describe('MIN_TAG_FREQ / MIN_KEYWORD_FREQ 상수', () => {
  it('매직넘버 아님 — 명명 상수 존재', () => {
    expect(MIN_TAG_FREQ).toBe(3)
    expect(MIN_KEYWORD_FREQ).toBe(3)
  })
})
