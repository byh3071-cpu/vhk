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

/** 첫 적격 사람 조치 시각(ready 여부 무관 — 원시 탐색). 없으면 null. */
export function firstEligibleHumanAction(timeline: PrTimelineEvent[]): string | null {
  let first: string | null = null
  for (const e of timeline) {
    if (!ELIGIBLE_TYPES.has(e.type) || e.actorIsBot) continue
    if (first === null || toMs(e.ts) < toMs(first)) first = e.ts
  }
  return first
}

/**
 * **ready 구간 안에서** 발생한 첫 적격 사람 조치. draft 상태의 댓글은 검토 응답이 아니다 —
 * 그걸 관측으로 세면 draft 중 잡담 한 줄이 대기시간을 만들어낸다(머지 보류 감사 반례 1).
 */
export function firstEligibleActionInReady(
  intervals: ReadyInterval[],
  timeline: PrTimelineEvent[],
): string | null {
  let first: string | null = null
  for (const e of timeline) {
    if (!ELIGIBLE_TYPES.has(e.type) || e.actorIsBot) continue
    if (readyIntervalAt(intervals, e.ts) === null) continue
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
  // ready 구간 안의 조치만 응답이다 — draft 중 댓글은 관측을 만들지 않는다(감사 반례 1).
  const action = firstEligibleActionInReady(intervals, pr.timeline)

  if (action !== null) {
    // 관측 완료 — open/closed 무관. 측정 기준점은 그 조치가 속한 ready 구간의 시작.
    const iv = readyIntervalAt(intervals, action)
    const from = iv ? iv.start : pr.createdAt // 방어 — InReady 가 보장하므로 실제로는 항상 iv 존재
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
  // 나이는 현재 ready 인 경우에만 — draft 로 회귀해 있으면 지금 검토 대기 중이 아니다.
  const iv = readyIntervalAt(intervals, nowIso)
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
    // draft 중 댓글은 이월도 해소하지 못한다 — ready 안의 조치만 검토로 인정(감사 반례 1c).
    const action = firstEligibleActionInReady(intervals, pr.timeline)
    if (action !== null && toMs(action) <= t) continue
    count++
  }
  return count
}

/**
 * 관측 창 안의 매일 아침 시각 목록 — 지정 오프셋 지역의 hour시.
 *
 * tzOffsetMinutes 를 명시하면 실행 머신과 무관하게 같은 아침 시각이 나온다(판정 재현성).
 * 미지정이면 실행 머신 로컬 — 스펙("09:00 로컬")의 기본값이지만, 다른 타임존 머신(CI 등)에서는
 * 이월 아침 수가 달라질 수 있으므로 판정 목적의 호출부는 오프셋을 명시하고 표기해야 한다.
 * 고정 오프셋 근사라 DST 지역에서는 전환일 ±1h 오차가 있다(KST 는 DST 없음).
 */
export function generateMornings(
  windowStartIso: string,
  windowEndIso: string,
  hour = 9,
  tzOffsetMinutes?: number,
): string[] {
  const offsetMin = tzOffsetMinutes ?? -new Date().getTimezoneOffset()
  const startMs = toMs(windowStartIso)
  const endMs = toMs(windowEndIso)
  const dayMs = 86_400_000
  // 지역시 = UTC + offset. 창 시작을 지역 날짜로 내림한 뒤 그 날짜의 hour시를 UTC 로 환산.
  const localStartMs = startMs + offsetMin * 60_000
  const localMidnightMs = Math.floor(localStartMs / dayMs) * dayMs
  let t = localMidnightMs + hour * 3_600_000 - offsetMin * 60_000
  if (t < startMs) t += dayMs
  const out: string[] = []
  while (t <= endMs) {
    out.push(new Date(t).toISOString())
    t += dayMs
  }
  return out
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// ─── Goal 111-T4 (3/3): SHA cohort 조인 + 5상태 판정 ─────────────────────────

export type PrCohort = 'autonomous' | 'interactive' | 'unknown'

/** 자율 PR 보조 신호 라벨 — 소유: auto_pr_goal.ps1 + overnight 런북. */
export const AUTONOMOUS_LABEL = 'autonomous'

/** PR 의 SHA 신호 — 정확 일치(headRefOid) 우선, 없으면 commits 포함(커밋 목록이 완전할 때만). */
function shaMatchesOf(pr: PrRecord, completeShas: ReadonlySet<string>): string[] {
  if (completeShas.has(pr.headRefOid)) return [pr.headRefOid]
  if (!pr.commitsComplete) return []
  return pr.commitOids.filter((oid) => completeShas.has(oid))
}

/**
 * complete SHA → 그 SHA 와 조인되는(head 정확 일치 또는 commits 포함) PR 수. 복수 후보 감지용.
 */
export function buildShaJoinCounts(prs: PrRecord[], completeShas: ReadonlySet<string>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const pr of prs) {
    for (const sha of new Set(shaMatchesOf(pr, completeShas))) {
      counts.set(sha, (counts.get(sha) ?? 0) + 1)
    }
  }
  return counts
}

/**
 * cohort 판정 — autonomous 는 **이중 신호**(complete SHA 조인 AND 라벨)일 때만.
 *
 * why 이중 신호인가: 라벨은 GitHub 쪽 상태라 사람이 붙이거나 뗄 수 있고, sha 는 원장 쪽이라
 * 위조가 커밋 diff 에 드러난다. 둘이 일치할 때만 믿고, 하나만 있으면(라벨 부착 실패·수동 라벨·
 * 원장 유실) 어느 쪽 기준선에도 섞지 않고 unknown 으로 격리한다.
 *
 * SHA 조인은 headRefOid 정확 일치를 우선하고, 리뷰 수정 커밋이 얹혀 head 가 밀린 PR 은
 * commits 포함으로 복원한다(D‴ 계약 — 감사 반례 5). 같은 SHA 가 여러 PR 과 조인되면 전부
 * unknown. **complete 이벤트의 SHA 만 신호다** — hardstop/blocked 런은 PR 을 만들지 않았어야
 * 하는 실패라 cohort 근거가 될 수 없다(감사 반례 3).
 */
export function classifyCohort(
  pr: PrRecord,
  completeShas: ReadonlySet<string>,
  shaJoinCounts: ReadonlyMap<string, number>,
): PrCohort {
  // 라벨 페이지가 잘렸으면 라벨 신호의 유무 자체를 모른다 — 어느 쪽으로도 분류하지 않는다.
  if (!pr.labelsComplete) return 'unknown'
  const matches = shaMatchesOf(pr, completeShas)
  const shaSignal = matches.length > 0
  const labeled = pr.labels.includes(AUTONOMOUS_LABEL)
  if (shaSignal && matches.some((s) => (shaJoinCounts.get(s) ?? 0) > 1)) return 'unknown' // 복수 후보
  if (shaSignal && labeled) return 'autonomous'
  if (shaSignal || labeled) return 'unknown' // 신호 하나만 — 불혼입
  return 'interactive'
}

// 판정 임계 — 2026-08-12 사람 승인 초기값. 4주 실측 뒤 재조정 지점.
export const WAIT_THRESHOLD_HOURS = 48
/** 아침 한 번의 이월 건수가 이 값 이상이면 "이월 많은 아침". */
export const CARRYOVER_THRESHOLD = 3
/** 4주 창에서 이월 많은 아침이 이 횟수 이상이면 "반복". */
export const CARRYOVER_REPEAT_MORNINGS = 3
/** 관측 완료된 autonomous 반응시간 최소 표본 — 관찰 게이트의 "유효 실행 10회"와 별개 조건. */
export const MIN_OBSERVED_SAMPLES = 10
export const MIN_WINDOW_DAYS = 28

/** 이월 많은 아침(이월 ≥ CARRYOVER_THRESHOLD) 수. */
export function countHighCarryoverMornings(prs: PrRecord[], mornings: string[]): number {
  return mornings.filter((m) => carryoverAtMorning(prs, m) >= CARRYOVER_THRESHOLD).length
}

export type BottleneckVerdict =
  | 'confirmed' // 병목 확정
  | 'mixed' // 혼합 신호·사람 검토
  | 'not-proven' // 병목 미입증
  | 'insufficient-data' // 데이터 부족
  | 'unmeasurable' // 측정 불가

export interface BottleneckJudgmentInput {
  /** PR 목록·필요 타임라인이 전부 수집됐는가. 하나라도 빠지면 판정 자료 불완전. */
  apiComplete: boolean
  /** 관측 창 길이(일). */
  windowDays: number
  /** 관측 완료된 autonomous 첫 반응시간(시간 단위) — censored 제외. */
  observedAutonomousWaitHours: number[]
  /** 창 안에서 이월 많은 아침 수. */
  carryoverHighMornings: number
}

export interface BottleneckJudgment {
  verdict: BottleneckVerdict
  medianWaitHours: number | null
  /** 자료 불완전·표본 부족이면 null — 지표별 초과 여부를 추정하지 않는다. */
  waitExceeded: boolean | null
  carryoverExceeded: boolean | null
}

/**
 * 5상태 판정 — 정확 비교(중앙값 >48h · 이월 많은 아침 ≥3회). "경계값" 같은 미정 상태 없음.
 * 순서: 측정 불가(자료 불완전) → 데이터 부족(4주·표본 10 미충족) → 확정/혼합/미입증.
 */
export function judgeBottleneck(input: BottleneckJudgmentInput): BottleneckJudgment {
  const med = median(input.observedAutonomousWaitHours)
  if (!input.apiComplete) {
    return { verdict: 'unmeasurable', medianWaitHours: med, waitExceeded: null, carryoverExceeded: null }
  }
  if (input.windowDays < MIN_WINDOW_DAYS || input.observedAutonomousWaitHours.length < MIN_OBSERVED_SAMPLES) {
    return { verdict: 'insufficient-data', medianWaitHours: med, waitExceeded: null, carryoverExceeded: null }
  }
  const waitExceeded = med !== null && med > WAIT_THRESHOLD_HOURS
  const carryoverExceeded = input.carryoverHighMornings >= CARRYOVER_REPEAT_MORNINGS
  const verdict: BottleneckVerdict =
    waitExceeded && carryoverExceeded ? 'confirmed' : waitExceeded || carryoverExceeded ? 'mixed' : 'not-proven'
  return { verdict, medianWaitHours: med, waitExceeded, carryoverExceeded }
}
