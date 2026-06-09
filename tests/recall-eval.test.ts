import { describe, it, expect } from 'vitest'
import { scoreEval, RECALL_EVAL_THRESHOLD, type EvalLabel } from '../src/lib/recall-eval.js'
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
