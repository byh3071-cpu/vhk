import { describe, it, expect } from 'vitest'
import {
  scoreEval,
  validateEvalLabels,
  EvalFormatError,
  RECALL_EVAL_THRESHOLD,
  type EvalLabel,
} from '../src/lib/recall-eval.js'
import { type MemoryFileV2, type FailEntry } from '../src/commands/memory.js'

const NOW = Date.parse('2026-06-09T00:00:00Z')

function fail(id: string, lesson: string, tags: string[]): FailEntry {
  return { id, content: '', tags, createdAt: '2026-06-01T00:00:00Z', status: 'active', lesson }
}
function mem(failures: FailEntry[]): MemoryFileV2 {
  return { schemaVersion: 2, decisions: [], failures, successes: [], patterns: [] }
}

const M = mem([
  fail('f1', 'publish 가드가 feature 브랜치 발행 차단', ['publish']),
  fail('f2', 'CHANGELOG 드리프트 발생', ['changelog']),
  fail('f3', 'deploy 환경변수 누락', ['deploy']),
])

describe('scoreEval (순수)', () => {
  it('정답이 top-5 안 → found + rank 정확', () => {
    const r = scoreEval(M, [{ query: 'publish', expectIds: ['f1'] }], NOW)
    expect(r.perQuery[0]).toMatchObject({ found: true, rank: 1 })
    expect(r.recallAt5).toBe(1)
    expect(r.mrr).toBe(1)
  })

  it('무매칭 → found:false, rank:null', () => {
    const r = scoreEval(M, [{ query: '데이터베이스 마이그레이션', expectIds: ['f1'] }], NOW)
    expect(r.perQuery[0]).toMatchObject({ found: false, rank: null })
    expect(r.recallAt5).toBe(0)
    expect(r.mrr).toBe(0)
  })

  it('여러 label 평균 (하나 맞고 하나 틀림 → 0.5)', () => {
    const labels: EvalLabel[] = [
      { query: 'publish', expectIds: ['f1'] }, // rank 1
      { query: '관계없는쿼리', expectIds: ['f2'] }, // 무매칭
    ]
    const r = scoreEval(M, labels, NOW)
    expect(r.n).toBe(2)
    expect(r.recallAt5).toBe(0.5)
    expect(r.mrr).toBe(0.5)
  })

  it('verdict: recallAt5 ≥ 0.7 → sufficient', () => {
    const r = scoreEval(M, [{ query: 'publish', expectIds: ['f1'] }], NOW)
    expect(r.recallAt5).toBeGreaterThanOrEqual(RECALL_EVAL_THRESHOLD)
    expect(r.verdict).toBe('sufficient')
  })

  it('verdict: recallAt5 < 0.7 → ml-signal', () => {
    const r = scoreEval(M, [{ query: '관계없는쿼리', expectIds: ['f2'] }], NOW)
    expect(r.verdict).toBe('ml-signal')
  })

  it('빈 label → n=0, recallAt5=0', () => {
    const r = scoreEval(M, [], NOW)
    expect(r.n).toBe(0)
    expect(r.recallAt5).toBe(0)
  })
})

// #322: expectIds 가 배열 아닌 문자열이면 String.includes(부분일치)로 거짓 100% Recall@5 → Kill-gate 오염.
//        검증기가 문자열 expectIds 를 거부해 부분일치 거짓통과를 원천 차단해야 한다.
// #323: labels 비배열·query/expectIds 누락 등 구조 불량은 raw JS 에러 대신 EvalFormatError(친절 메시지).
describe('validateEvalLabels (#322 정확매칭 · #323 형식검증)', () => {
  it('정상 라벨 → 그대로 통과', () => {
    const labels = validateEvalLabels({ labels: [{ query: 'tRPC', expectIds: ['d1'] }] })
    expect(labels).toEqual([{ query: 'tRPC', expectIds: ['d1'] }])
  })

  it('빈 labels 배열 → 빈 배열 (정상)', () => {
    expect(validateEvalLabels({ labels: [] })).toEqual([])
  })

  it('labels 누락(undefined) → 빈 배열 (정상 — 빈 평가셋과 동치)', () => {
    expect(validateEvalLabels({})).toEqual([])
  })

  // #323
  it('labels 가 배열 아님(문자열) → EvalFormatError', () => {
    expect(() => validateEvalLabels({ labels: 'oops' })).toThrow(EvalFormatError)
  })

  it('루트가 객체 아님(배열·null) → EvalFormatError', () => {
    expect(() => validateEvalLabels(null)).toThrow(EvalFormatError)
    expect(() => validateEvalLabels([{ query: 'x', expectIds: ['d1'] }])).toThrow(EvalFormatError)
  })

  it('query 누락 → EvalFormatError', () => {
    expect(() => validateEvalLabels({ labels: [{ expectIds: ['d1'] }] })).toThrow(EvalFormatError)
  })

  it('query 가 빈 문자열 → EvalFormatError', () => {
    expect(() => validateEvalLabels({ labels: [{ query: '  ', expectIds: ['d1'] }] })).toThrow(
      EvalFormatError
    )
  })

  it('expectIds 누락 → EvalFormatError', () => {
    expect(() => validateEvalLabels({ labels: [{ query: 'tRPC' }] })).toThrow(EvalFormatError)
  })

  // #322 핵심: expectIds 가 문자열이면 거부 (부분일치 거짓통과 차단)
  it('expectIds 가 배열 아닌 문자열 → EvalFormatError', () => {
    expect(() => validateEvalLabels({ labels: [{ query: 'tRPC', expectIds: 'XYZd1' }] })).toThrow(
      EvalFormatError
    )
  })

  it('expectIds 가 빈 배열 → EvalFormatError (정답 없는 라벨은 무의미)', () => {
    expect(() => validateEvalLabels({ labels: [{ query: 'tRPC', expectIds: [] }] })).toThrow(
      EvalFormatError
    )
  })

  it('expectIds 원소가 문자열 아님 → EvalFormatError', () => {
    expect(() =>
      validateEvalLabels({ labels: [{ query: 'tRPC', expectIds: [1, 2] }] })
    ).toThrow(EvalFormatError)
  })

  it('EvalFormatError 메시지는 한국어 친절 안내(스택 미노출)', () => {
    try {
      validateEvalLabels({ labels: 'oops' })
      expect.unreachable('던져야 함')
    } catch (e) {
      expect(e).toBeInstanceOf(EvalFormatError)
      expect((e as Error).message).toMatch(/형식|평가셋|labels/)
    }
  })
})

// #322 회귀: scoreEval 은 검증 통과한 배열 expectIds 만 받으므로 정확매칭이어야 한다.
//        (부분일치였다면 expectIds:['XYZd1'] 가 실제 id 'd1' 을 못 잡아야 정상 — 거짓 100% 0.)
describe('scoreEval 정확매칭 회귀 (#322)', () => {
  it('expectIds 가 실제 id 의 상위문자열이어도 부분일치로 거짓 통과하지 않음', () => {
    // 실제 id 는 'f1'. expectIds 에 'XYZf1' 을 넣어도 정확매칭이라 미발견이어야 한다.
    const r = scoreEval(M, [{ query: 'publish', expectIds: ['XYZf1'] }], NOW)
    expect(r.perQuery[0]).toMatchObject({ found: false, rank: null })
    expect(r.recallAt5).toBe(0)
  })
})
