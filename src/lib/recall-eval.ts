import { recallMemories, type MemoryFileV2 } from '../commands/memory.js'

/**
 * recall 검증 채점 (RFC 0049 ③) — 키워드 회상이 '충분한지' 측정.
 * Kill-gate: recallAt5 < 0.7 누적 증명 전까지 ML(임베딩·벡터) 도입 금지.
 * 순수 함수 — recallMemories(결정적) 재사용.
 */

export const RECALL_EVAL_THRESHOLD = 0.7
export const EVAL_K = 5

export interface EvalLabel {
  query: string
  expectIds: string[]
}

export interface EvalPerQuery {
  query: string
  found: boolean
  rank: number | null
}

export interface EvalResult {
  n: number
  recallAt5: number
  mrr: number
  perQuery: EvalPerQuery[]
  verdict: 'sufficient' | 'ml-signal'
}

export function scoreEval(
  mem: MemoryFileV2,
  labels: EvalLabel[],
  nowMs: number = Date.now()
): EvalResult {
  const perQuery: EvalPerQuery[] = labels.map((label) => {
    const ids = recallMemories(mem, label.query, EVAL_K, nowMs).map((h) => h.entry.id)
    const idx = ids.findIndex((id) => label.expectIds.includes(id))
    const rank = idx >= 0 ? idx + 1 : null
    return { query: label.query, found: rank !== null, rank }
  })

  const n = labels.length
  const foundCount = perQuery.filter((p) => p.found).length
  const recallAt5 = n === 0 ? 0 : foundCount / n
  const mrr = n === 0 ? 0 : perQuery.reduce((s, p) => s + (p.rank ? 1 / p.rank : 0), 0) / n
  const verdict = recallAt5 >= RECALL_EVAL_THRESHOLD ? 'sufficient' : 'ml-signal'

  return { n, recallAt5, mrr, perQuery, verdict }
}
