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

/** 평가셋 형식 불량(구조 오류) — 깨진 JSON 과 동일하게 친절 메시지로 처리하기 위한 전용 에러 (#323). */
export class EvalFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EvalFormatError'
  }
}

/**
 * 외부/수동 편집된 평가셋 JSON 의 런타임 형식검증 (PAT-002 — raw parse 금지, 추출기+검증).
 * #322: expectIds 가 문자열이면 scoreEval 의 includes 가 String.includes(부분일치)로 갈려
 *       거짓 100% Recall@5 를 만든다 → 배열 강제 + 원소 string 강제로 정확매칭만 허용.
 * #323: labels 비배열·query/expectIds 누락 등 구조 불량은 raw JS 에러 대신 EvalFormatError 로 던져
 *       호출부가 깨진 JSON 과 동일한 친절 메시지 분기로 흡수하게 한다.
 * labels 누락(undefined)·빈 배열은 '빈 평가셋'으로 정상 취급(throw 아님).
 */
export function validateEvalLabels(raw: unknown): EvalLabel[] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new EvalFormatError('평가셋 형식 오류 — 최상위는 { "labels": [...] } 객체여야 합니다.')
  }
  const labels = (raw as { labels?: unknown }).labels
  if (labels === undefined) return []
  if (!Array.isArray(labels)) {
    throw new EvalFormatError('평가셋 형식 오류 — labels 는 배열이어야 합니다.')
  }
  return labels.map((label, i) => {
    const at = `라벨 #${i + 1}`
    if (typeof label !== 'object' || label === null || Array.isArray(label)) {
      throw new EvalFormatError(`평가셋 형식 오류 — ${at} 가 객체가 아닙니다.`)
    }
    const { query, expectIds } = label as { query?: unknown; expectIds?: unknown }
    if (typeof query !== 'string' || query.trim() === '') {
      throw new EvalFormatError(`평가셋 형식 오류 — ${at} 의 query 가 비어있거나 문자열이 아닙니다.`)
    }
    if (!Array.isArray(expectIds) || expectIds.length === 0) {
      throw new EvalFormatError(
        `평가셋 형식 오류 — ${at} 의 expectIds 는 비어있지 않은 배열이어야 합니다(문자열 금지).`
      )
    }
    if (!expectIds.every((id) => typeof id === 'string')) {
      throw new EvalFormatError(`평가셋 형식 오류 — ${at} 의 expectIds 원소는 모두 문자열이어야 합니다.`)
    }
    return { query, expectIds: expectIds as string[] }
  })
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
