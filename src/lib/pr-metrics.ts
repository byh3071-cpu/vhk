import type { PrRecord, PrTimelineEvent } from './pr-metrics-github.js'

// Goal 111-T4 (2/3): 순수 계산 — ready 상태 머신 · 첫 적격 사람 조치 · right-censoring · 아침 이월.
// 네트워크·fs·현재시각 의존 0 — 모든 시각은 인자로 받는다(fixture 테스트 대상).
//
// 측정 계약(D‴ 확정):
// - 사람 대기시간 = ready_at → 첫 적격 사람 조치. **PR open/closed 와 무관** — 조치가 있으면
//   열린 PR 도 관측 완료, 조치가 없는 PR 만 right-censored(중앙값 제외·건수와 나이 별도 표기).
// - 아침 이월 = 관측 시각에 open AND 현재 ready AND ready 후 24h 경과 AND 적격 조치 아직 없음.
//   이미 검토됐고 CI·수정을 기다리는 PR 은 사람 병목이 아니므로 제외된다.

/** ready 구간 — end=null 은 현재도 ready. */
export interface ReadyInterval {
  start: string
  end: string | null
}

function toMs(iso: string): number {
  return Date.parse(iso)
}

/**
 * ReadyForReviewEvent · ConvertToDraftEvent 를 시각순으로 처리해 ready 구간을 복원한다.
 * 초기 상태 추론: draft 이벤트가 하나도 없으면 isDraftNow 가 그대로 생성 시점 상태다.
 * 첫 이벤트가 ready 면 생성 시 draft 였고, 첫 이벤트가 convert_to_draft 면 생성 시 ready 였다.
 */
export function buildReadyIntervals(
  createdAt: string,
  isDraftNow: boolean,
  timeline: PrTimelineEvent[],
): ReadyInterval[] {
  const draftEvents = timeline
    .filter((e) => e.type === 'ready' || e.type === 'convert_to_draft')
    .sort((a, b) => toMs(a.ts) - toMs(b.ts))

  if (draftEvents.length === 0) {
    // 전이 이력 없음 — 생성 이후 상태 불변.
    return isDraftNow ? [] : [{ start: createdAt, end: null }]
  }

  const intervals: ReadyInterval[] = []
  // 첫 전이의 반대 상태가 생성 시점 상태다.
  let ready = draftEvents[0].type === 'convert_to_draft'
  let readyStart: string | null = ready ? createdAt : null

  for (const e of draftEvents) {
    if (e.type === 'ready' && !ready) {
      ready = true
      readyStart = e.ts
    } else if (e.type === 'convert_to_draft' && ready) {
      ready = false
      if (readyStart !== null) intervals.push({ start: readyStart, end: e.ts })
      readyStart = null
    }
    // 같은 상태로의 중복 전이(비정상 데이터)는 무시 — 상태 머신이 관용적으로 흡수.
  }
  if (ready && readyStart !== null) intervals.push({ start: readyStart, end: null })
  return intervals
}

/** 적격 사람 조치 닫힌집합 — 리뷰·비봇 코멘트·머지·닫힘. committed/labeled/assigned 은 수집 단계에서 이미 제외. */
const ELIGIBLE_TYPES: ReadonlySet<PrTimelineEvent['type']> = new Set(['review', 'comment', 'merged', 'closed'])

/** 첫 적격 사람 조치 시각. 없으면 null. */
export function firstEligibleHumanAction(timeline: PrTimelineEvent[]): string | null {
  let first: string | null = null
  for (const e of timeline) {
    if (!ELIGIBLE_TYPES.has(e.type) || e.actorIsBot) continue
    if (first === null || toMs(e.ts) < toMs(first)) first = e.ts
  }
  return first
}

/** 시각 t 에 활성인 ready 구간(있으면). */
function readyIntervalAt(intervals: ReadyInterval[], tIso: string): ReadyInterval | null {
  const t = toMs(tIso)
  for (const iv of intervals) {
    if (toMs(iv.start) <= t && (iv.end === null || t < toMs(iv.end))) return iv
  }
  return null
}

/** 시각 t 이전에 시작한 마지막 ready 구간(있으면). */
function lastReadyStartBefore(intervals: ReadyInterval[], tIso: string): ReadyInterval | null {
  const t = toMs(tIso)
  let best: ReadyInterval | null = null
  for (const iv of intervals) {
    if (toMs(iv.start) <= t && (best === null || toMs(iv.start) > toMs(best.start))) best = iv
  }
  return best
}

export interface WaitObservation {
  number: number
  /** 관측 완료된 대기시간(시간 단위). censored·판정 불가면 null. */
  waitHours: number | null
  /** ready 됐는데 적격 조치가 아직 없음 — 중앙값 제외, 별도 표기 대상. */
  censored: boolean
  /** censored 인 경우 nowIso 기준 현재 대기 나이(시간). */
  censoredAgeHours: number | null
  /** ready 구간이 아예 없거나(줄곧 draft) 봇 종결 등으로 관측이 성립하지 않음. */
  excluded: boolean
  excludedReason?: string
}

/** PR 하나의 대기 관측. 순수 — 현재시각은 nowIso 인자. */
export function computeWait(pr: PrRecord, nowIso: string): WaitObservation {
  const base = { number: pr.number, waitHours: null, censored: false, censoredAgeHours: null, excluded: false }
  const intervals = buildReadyIntervals(pr.createdAt, pr.isDraft, pr.timeline)
  const action = firstEligibleHumanAction(pr.timeline)

  if (action !== null) {
    // 관측 완료 — open/closed 무관. 측정 기준점은 조치 이전 마지막 ready 시작.
    const iv = lastReadyStartBefore(intervals, action)
    const from = iv ? iv.start : pr.createdAt // draft 중 조치된 예외 — createdAt 기준으로 관측
    const hours = (toMs(action) - toMs(from)) / 3_600_000
    return { ...base, waitHours: Math.max(0, hours) }
  }

  // 적격 조치 없음.
  if (intervals.length === 0) {
    return { ...base, excluded: true, excludedReason: 'ready 이력 없음(줄곧 draft)' }
  }
  const closedTs = pr.mergedAt ?? pr.closedAt
  if (closedTs !== null) {
    // 사람 조치 없이 종결 — 봇 머지/닫힘 등. censored 도 관측도 아니다.
    return { ...base, excluded: true, excludedReason: '사람 조치 없이 종결(봇 추정)' }
  }
  const iv = lastReadyStartBefore(intervals, nowIso)
  const age = iv ? (toMs(nowIso) - toMs(iv.start)) / 3_600_000 : null
  return { ...base, censored: true, censoredAgeHours: age === null ? null : Math.max(0, age) }
}

/** 시각 t 에 PR 이 open 인가. */
function isOpenAt(pr: PrRecord, tIso: string): boolean {
  const t = toMs(tIso)
  if (toMs(pr.createdAt) > t) return false
  const closedTs = pr.mergedAt ?? pr.closedAt
  return closedTs === null || toMs(closedTs) > t
}

const CARRYOVER_AGE_MS = 24 * 3_600_000

/**
 * 아침 이월 — 관측 시각 morningIso 에 open AND 현재 ready AND ready 시작 후 24h 경과 AND
 * 그 시각까지 적격 사람 조치 없음인 비봇 PR 수. 저장 없이 타임스탬프에서 결정론 재구성.
 */
export function carryoverAtMorning(prs: PrRecord[], morningIso: string): number {
  const t = toMs(morningIso)
  let count = 0
  for (const pr of prs) {
    if (pr.authorIsBot) continue
    if (!isOpenAt(pr, morningIso)) continue
    const intervals = buildReadyIntervals(pr.createdAt, pr.isDraft, pr.timeline)
    const iv = readyIntervalAt(intervals, morningIso)
    if (!iv) continue
    if (t - toMs(iv.start) < CARRYOVER_AGE_MS) continue
    const action = firstEligibleHumanAction(pr.timeline)
    if (action !== null && toMs(action) <= t) continue
    count++
  }
  return count
}

/** 관측 창 안의 매일 아침 시각 목록 (로컬 시간 hour시). 순수 — 로컬 tz 는 실행 머신 기준. */
export function generateMornings(windowStartIso: string, windowEndIso: string, hour = 9): string[] {
  const out: string[] = []
  const start = new Date(windowStartIso)
  const end = toMs(windowEndIso)
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate(), hour, 0, 0, 0)
  if (cursor.getTime() < toMs(windowStartIso)) cursor.setDate(cursor.getDate() + 1)
  while (cursor.getTime() <= end) {
    out.push(cursor.toISOString())
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
