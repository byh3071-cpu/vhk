import type { PatternEntryV19 } from '../commands/pattern.js'

export const EVOLVE_CANDIDATE_TTL_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

export interface InlineEvolveCandidate {
  id: string
  patternId: string
  kind: 'rule'
  targetLayer: 'rule'
  status: 'pending'
  draft: string
  dedupeKey: string
  createdAt: string
  expiresAt: string
}

export function buildCandidateDraft(pattern: PatternEntryV19): string {
  const axisLabel = pattern.axis === 'tag'
    ? `태그 '${pattern.signal}'`
    : `키워드 '${pattern.signal}'`

  if (pattern.kind === 'reinforce') {
    return `- ${axisLabel} 관련 작업은 검증된 접근을 계속 권장 (근거: ${pattern.count}건 성공 사례)`
  }

  return `- ${axisLabel} 관련 작업 전 사전 점검 필수 (근거: ${pattern.count}건 반복, ${pattern.summary})`
}

export function generateInlineCandidates(
  patterns: PatternEntryV19[],
  decidedKeys: ReadonlySet<string>,
  nowIso: string,
): InlineEvolveCandidate[] {
  const nowMs = Date.parse(nowIso)
  if (!Number.isFinite(nowMs)) return []

  const candidates: InlineEvolveCandidate[] = []
  for (const pattern of patterns) {
    if (pattern.status !== 'active') continue
    if (pattern.kind !== 'avoid' && pattern.kind !== 'reinforce') continue

    const createdMs = Date.parse(pattern.createdAt)
    if (!Number.isFinite(createdMs)) continue

    const dedupeKey = `${pattern.id}:rule`
    if (decidedKeys.has(dedupeKey)) continue

    const expiresMs = createdMs + EVOLVE_CANDIDATE_TTL_DAYS * DAY_MS
    if (nowMs >= expiresMs) continue

    candidates.push({
      id: dedupeKey,
      patternId: pattern.id,
      kind: 'rule',
      targetLayer: 'rule',
      status: 'pending',
      draft: buildCandidateDraft(pattern),
      dedupeKey,
      createdAt: new Date(createdMs).toISOString(),
      expiresAt: new Date(expiresMs).toISOString(),
    })
  }

  return candidates.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
}
