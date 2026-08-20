import chalk from 'chalk'
import { log } from '../utils/logger.js'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { readLedger, type LedgerEntry } from '../lib/evidence-ledger.js'
import { readAiActions, type AiActionEntry } from '../lib/ai-actions-ledger.js'
import type { EvolveQueueItem } from './evolve.js'
import { readReceiptLog, type ReceiptLogEntry } from '../lib/receipt-log.js'
import { readEvolveLog, type EvolveLogEntry } from '../lib/evolve-log.js'
import { readCheckLog, type CheckLogEntry } from '../lib/check-log.js'
import {
  morningHasValues,
  readAutonomyLog,
  readMorningObservations,
  selectDailyObservations,
  type AutonomyRunEntry,
  type MorningObservation,
} from '../lib/autonomy-log.js'
// RFC 0066 §2.1 — 3중 판정 집계는 src/lib/autonomy-stats.ts 로 이관됐다(권한 판정이 lib 에서
// 이것을 쓰는데 lib → commands 역방향 의존을 만들지 않기 위해). 공개 표면 유지를 위한 re-export.
export {
  calcAutonomyStats,
  groupRuns,
  isVerifiedComplete,
  ROLLING_WINDOW,
  DEMOTION_FAILURE_THRESHOLD,
  INFRA_ABUSE_RATIO,
  INFRA_RATIO_MIN_SAMPLE,
  type AutonomyStats,
  type RunOutcome,
} from '../lib/autonomy-stats.js'
import {
  calcAutonomyStats,
  ROLLING_WINDOW,
  DEMOTION_FAILURE_THRESHOLD,
  INFRA_ABUSE_RATIO,
} from '../lib/autonomy-stats.js'
import {
  buildShaJoinCounts,
  classifyCohort,
  computeWait,
  countHighCarryoverMornings,
  generateMornings,
  judgeBottleneck,
  median,
  MIN_OBSERVED_SAMPLES,
  MIN_WINDOW_DAYS,
  type BottleneckJudgment,
  type PrCohort,
} from '../lib/pr-metrics.js'
import { fetchPrWindow, ghAvailability, type PrRecord } from '../lib/pr-metrics-github.js'

/**
 * Goal 61: vhk stats — 읽기전용 통계·대시보드 집계.
 * 3소스: 증거 원장(ledger.jsonl, PASS/WARN/FAIL) + AI 행동 원장(ai-actions.jsonl, 차단율) + 진화 결정 로그(채택률).
 * 파일 쓰기 0건(읽기 전용). 각 소스 부재 시 기본값 안전(빈 집계).
 * ⚠️ 차단율 실데이터는 Goal 55(action-ledger) 머지 후 — 미연동 시 0건 표기.
 */

// ── 순수 계산 함수 ────────────────────────────────────────────────────────────

export interface LedgerStatusCounts {
  pass: number
  warn: number
  fail: number
  total: number
}

/** 증거 원장 PASS/WARN/FAIL 카운트. */
export function countLedgerStatus(entries: LedgerEntry[]): LedgerStatusCounts {
  let pass = 0
  let warn = 0
  let fail = 0
  for (const e of entries) {
    if (e?.status === 'PASS') pass++
    else if (e?.status === 'WARN') warn++
    else if (e?.status === 'FAIL') fail++
  }
  // total = 인식된 상태 합 — 손상/미인식 라인이 total 을 부풀려 'total ≠ PASS+WARN+FAIL' 되는 불일치 방지.
  return { pass, warn, fail, total: pass + warn + fail }
}

export interface RateStat {
  count: number
  total: number
  /** 0~1. total 0 이면 0. */
  rate: number
}

/** AI 행동 차단율 — ran===false / 전체. total 0 이면 rate 0. */
export function calcBlockRate(actions: AiActionEntry[]): RateStat {
  const total = actions.length
  const blocked = actions.filter((a) => a.ran === false).length
  return { count: blocked, total, rate: total === 0 ? 0 : blocked / total }
}

/** 진화 적용율 — status==='applied' / 전체. total 0 이면 rate 0. */
export function calcApplyRate(items: EvolveQueueItem[]): RateStat {
  const total = items.length
  const applied = items.filter((i) => i.status === 'applied').length
  return { count: applied, total, rate: total === 0 ? 0 : applied / total }
}

export interface ReceiptTrend {
  total: number
  byDecision: { block: number; caution: number; pass: number }
  redRate: RateStat
  dirtyRate: RateStat
  /** measured diff-cover 비율 평균. 측정분 0 이면 null(모름을 0 으로 위장 안 함). */
  avgDiffCover: number | null
  /** diff-cover measured 표본 수(분모 정직표기 — n 작을 때 평균 오인 방지). */
  coverN: number
  /** 앞절반 vs 뒷절반 block 비율 비교. total<2 면 null. 홀수 total 은 뒤절반이 1 많음 → earlierN/recentN 명시. */
  trend: {
    earlierN: number
    recentN: number
    earlierBlockRate: number
    recentBlockRate: number
    /** recent - earlier. 양수=악화(거짓완료 판정 증가), 음수=개선. */
    delta: number
  } | null
}

/**
 * N6(ⓔ): receipt-log 시계열 추세 — 순수 계산(fs/시간 부수효과 0).
 * 거짓완료 판정(decision==='block') 추세를 ts 정렬 후 앞절반 vs 뒷절반으로 비교.
 * total<2 면 trend null, 측정분 0 이면 avgDiffCover null — 표본 부족을 0 으로 위장하지 않는다.
 */
export function computeReceiptTrend(entries: ReceiptLogEntry[]): ReceiptTrend {
  const sorted = [...entries].sort((a, b) => a.ts.localeCompare(b.ts))
  const total = sorted.length
  const byDecision = { block: 0, caution: 0, pass: 0 }
  let red = 0
  let dirty = 0
  let coverSum = 0
  let coverN = 0
  for (const e of sorted) {
    if (e.decision === 'block' || e.decision === 'caution' || e.decision === 'pass') byDecision[e.decision]++
    if (e.red) red++
    if (e.dirty) dirty++
    if (typeof e.diffCoverRatio === 'number') {
      coverSum += e.diffCoverRatio
      coverN++
    }
  }
  const rate = (c: number): RateStat => ({ count: c, total, rate: total === 0 ? 0 : c / total })
  const blockRate = (arr: ReceiptLogEntry[]): number =>
    arr.length === 0 ? 0 : arr.filter((e) => e.decision === 'block').length / arr.length
  let trend: ReceiptTrend['trend'] = null
  if (total >= 2) {
    // 홀수 total 은 뒤절반이 1 많다(earlierN/recentN 로 정직 노출 — '절반 N개씩' 오표기 방지, 적대리뷰 반영).
    const mid = Math.floor(total / 2)
    const earlier = sorted.slice(0, mid)
    const recent = sorted.slice(mid)
    const earlierBlockRate = blockRate(earlier)
    const recentBlockRate = blockRate(recent)
    trend = {
      earlierN: earlier.length,
      recentN: recent.length,
      earlierBlockRate,
      recentBlockRate,
      delta: recentBlockRate - earlierBlockRate,
    }
  }
  return {
    total,
    byDecision,
    redRate: rate(red),
    dirtyRate: rate(dirty),
    avgDiffCover: coverN === 0 ? null : coverSum / coverN,
    coverN,
    trend,
  }
}

export interface RejectReasonCount {
  reason: string
  count: number
}

export interface AdoptionStats {
  /** applied / (applied+rejected) — '전체 큐 대비'(calcApplyRate) 가 아니라 '결정된 것 대비'. */
  applied: RateStat
  /** 기각 사유 분포 — 내림차순(동률은 가나다순). 사유 미입력은 "(사유 없음)" 버킷. */
  rejectReasons: RejectReasonCount[]
}

/**
 * #374(evolve 효과측정): evolve-log 기반 채택률 — calcApplyRate(전체 큐 대비)와 달리 pending 은
 * 로그에 아예 없으므로(apply/reject 결정 시점에만 append) 분모가 자연히 "결정된 것"만 된다.
 * 기각 사유 분포도 함께 — "왜 기각되는지" 실측(표본이 대부분 '(사유 없음)' 일 수 있음, 정직 표기).
 */
export function calcAdoptionStats(entries: EvolveLogEntry[]): AdoptionStats {
  const decisions = entries.filter((entry) => entry.event !== 'undo' && entry.event !== 'migration')
  const total = decisions.length
  const applied = decisions.filter((e) => e.applied).length
  const reasonCounts = new Map<string, number>()
  for (const e of decisions) {
    if (e.applied) continue
    const key = e.rejectReason && e.rejectReason.trim() ? e.rejectReason.trim() : '(사유 없음)'
    reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1)
  }
  const rejectReasons = [...reasonCounts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
  return {
    applied: { count: applied, total, rate: total === 0 ? 0 : applied / total },
    rejectReasons,
  }
}

export interface CheckTrend {
  total: number
  /** 전체 평균 위반 총계. 표본 0 이면 null(모름을 0 으로 위장 안 함). */
  avgTotal: number | null
  /** 앞절반 vs 뒷절반 평균 위반수 비교. total<2 면 null. */
  trend: {
    earlierN: number
    recentN: number
    earlierAvg: number
    recentAvg: number
    /** recent - earlier. 양수=악화(위반 증가), 음수=개선. */
    delta: number
  } | null
}

/**
 * #374(evolve 효과측정): check-log 시계열 — computeReceiptTrend 와 동일한 앞/뒤 절반 비교
 * 알고리즘 재사용(정렬 → split → 평균 비교). evolve apply 전후로 `vhk check` 를 반복 실행하면
 * 이 추세가 "룰 반영 후 실제로 위반이 줄었는지"의 근사 신호가 된다(정밀 전/후 매칭은 후속 검토).
 */
export function computeCheckTrend(entries: CheckLogEntry[]): CheckTrend {
  const sorted = [...entries].sort((a, b) => a.ts.localeCompare(b.ts))
  const total = sorted.length
  if (total === 0) return { total: 0, avgTotal: null, trend: null }

  const avg = (arr: CheckLogEntry[]): number => arr.reduce((s, e) => s + e.total, 0) / arr.length
  const avgTotal = avg(sorted)

  let trend: CheckTrend['trend'] = null
  if (total >= 2) {
    const mid = Math.floor(total / 2)
    const earlier = sorted.slice(0, mid)
    const recent = sorted.slice(mid)
    const earlierAvg = avg(earlier)
    const recentAvg = avg(recent)
    trend = {
      earlierN: earlier.length,
      recentN: recent.length,
      earlierAvg,
      recentAvg,
      delta: recentAvg - earlierAvg,
    }
  }
  return { total, avgTotal, trend }
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

// ── 커맨드 핸들러 (읽기 전용 — 파일 쓰기 없음) ──────────────────────────────────

export async function stats(opts: { trend?: boolean } = {}): Promise<void> {
  const cwd = process.cwd()

  // N6(ⓔ): --trend → receipt-log 시계열 추세(거짓완료 판정 추이). 기본 대시보드와 분리.
  if (opts.trend) {
    renderTrend(cwd)
    return
  }

  // 모든 소스는 읽기 전용이다. 진화 통계는 폐지된 큐가 아니라 결정 로그를 사용한다.
  const ledger = readLedger(cwd)
  const actions = readAiActions(cwd)
  const evolveLog = readEvolveLogForStats(cwd)

  const ls = countLedgerStatus(ledger)
  const block = calcBlockRate(actions)
  const apply = calcAdoptionStats(evolveLog).applied

  log.bold(`\n📊 ${t('stats.title')}`)
  log.plain(chalk.gray('─'.repeat(40)))

  // 1) 증거 원장 — PASS/WARN/FAIL
  log.plain(
    chalk.cyan(`\n🔬 ${t('stats.ledger')}`) +
      chalk.white(` 총 ${ls.total}`) +
      chalk.dim(` — ✅ PASS ${ls.pass} · ⚠️ WARN ${ls.warn} · ❌ FAIL ${ls.fail}`),
  )

  // 2) AI 행동 차단율 — 55 미연동 시 데이터 없음 안내(정직)
  if (block.total === 0) {
    log.plain(chalk.cyan(`🛡️  ${t('stats.blockRate')}`) + chalk.dim(` ${t('stats.noActions')}`))
  } else {
    log.plain(
      chalk.cyan(`🛡️  ${t('stats.blockRate')}`) +
        chalk.white(` ${pct(block.rate)}`) +
        chalk.dim(` (차단 ${block.count}/${block.total})`),
    )
  }

  // 3) 진화 적용율
  log.plain(
    chalk.cyan(`🔄 ${t('stats.applyRate')}`) +
      chalk.white(` ${pct(apply.rate)}`) +
      chalk.dim(` (적용 ${apply.count}/${apply.total})`),
  )

  // 4) 자율 완주율 (#373 / Goal 104) — 표본 0 정직 표기
  renderAutonomyStats(cwd)

  // 5) 병목 계측 (Goal 111) — gh 부재·부분 실패는 측정 불가 표기
  renderBottleneckStats(cwd)

  printNextStep({
    message: t('stats.nextMessage'),
    command: 'vhk verify',
    cursorHint: t('stats.nextCursor'),
  })
}

/**
 * Goal 104 + 110: autonomy-run.jsonl × receipt-log.jsonl → 완주율 섹션(읽기 전용).
 * 표본 0·판정 불가는 비율로 위장하지 않고 건수로 그대로 적는다.
 */
function renderAutonomyStats(cwd: string): void {
  const a = calcAutonomyStats(readAutonomyLog(cwd), readReceiptLog(cwd))
  log.plain(chalk.cyan(`\n🤖 ${t('stats.autonomyTitle')}`))
  if (a.starts === 0) {
    log.plain(chalk.dim(`  ${t('stats.autonomyNoData')}`))
    return
  }

  if (a.completionRate === null) {
    log.plain(chalk.dim('  판정 대상 런 0건 — 완주율 없음(0% 아님)'))
  } else {
    log.plain(
      chalk.white(`  ${pct(a.completionRate)}`) +
        chalk.dim(
          ` (검증된 완주 ${a.verifiedComplete}/${a.judgedRuns}` +
            ` · hardstop ${a.hardstop} · blocked ${a.blocked})`,
        ),
    )
  }

  // 자기 보고와 기계 판정의 격차 — 리서치 결정 1 을 수치로 남기는 자리.
  if (a.selfReportedOnly > 0) {
    log.plain(
      chalk.yellow(`  ⚠ 자기 보고만 ${a.selfReportedOnly}건`) +
        chalk.dim(' — complete 라고 기록했지만 같은 SHA 의 receipt 가 뒷받침하지 않음'),
    )
  }
  if (a.unjudgeable > 0) {
    log.plain(chalk.dim(`  판정 불가 ${a.unjudgeable}건 (구 스키마 — SHA 없음)`))
  }
  if (a.inProgress > 0) {
    log.plain(chalk.dim(`  진행 중 ${a.inProgress}건 (종결 이벤트 없음) — 실패로 세지 않음`))
  }
  if (a.infraExcluded > 0) {
    // failureKind 는 자기 보고다. 기계로 판별할 수단이 없으므로 제외 사실과 비율을 드러낸다.
    const ratio = a.infraExcludedRatio === null ? '' : ` (${pct(a.infraExcludedRatio)})`
    log.plain(
      chalk.dim(`  인프라 실패 ${a.infraExcluded}건${ratio} — 분모에서 제외 · 자기 보고 값입니다`),
    )
    if (a.infraAbuseSuspected) {
      log.plain(
        chalk.yellow(`  ⚠ 인프라 제외 비율이 ${pct(INFRA_ABUSE_RATIO)}를 넘습니다`) +
          chalk.dim(' — 실패가 분모에서 빠지고 있는지 사람이 확인하세요'),
      )
    }
  }

  // 롤링 강등(110-T4) — 표본이 안 차면 "모름"을 그대로 적는다.
  if (a.rollingFailures === null) {
    log.plain(chalk.dim(`  롤링 판정: 표본 부족 (${a.judgedRuns}/${ROLLING_WINDOW}회)`))
  } else if (a.demotionTriggered) {
    log.plain(
      chalk.red(`  ⛔ 권한 축소 판정 — 최근 ${ROLLING_WINDOW}회 중 ${a.rollingFailures}회 실패`) +
        chalk.dim(` (기준 ${DEMOTION_FAILURE_THRESHOLD}회)`),
    )
  } else {
    log.plain(
      chalk.dim(`  롤링 판정: 유지 — 최근 ${ROLLING_WINDOW}회 중 ${a.rollingFailures}회 실패`),
    )
  }

  const kinds = Object.entries(a.byTaskKind).filter(([, n]) => n > 0)
  if (kinds.length > 0) {
    log.plain(chalk.dim(`  작업 유형: ${kinds.map(([k, n]) => `${k} ${n}`).join(' · ')}`))
  }
}

// ─── Goal 111-T6: 병목 계측 섹션 ────────────────────────────────────────────

/** 순수 조립 결과 — 렌더와 분리해 fixture 테스트 대상. */
export interface BottleneckView {
  judgment: BottleneckJudgment
  windowDays: number
  /** cohort 별 PR 수. */
  cohortCounts: Record<PrCohort, number>
  /** autonomous 관측 완료 표본 수. */
  observedCount: number
  /** autonomous censored — 아직 사람 조치 없는 PR. */
  censoredCount: number
  censoredMaxAgeHours: number | null
  /** interactive 관측 중앙값(참고 지표 — 세션 중 Claude 가 같은 계정으로 조치해 사람 반응과 혼합). */
  interactiveMedianHours: number | null
  carryoverHighMornings: number
  /** 자기신고 응답률 — 값이 있는 관측일 / 리포트가 실행된 관측일. 관측일 0 이면 null. */
  selfReportResponseRate: number | null
  selfReportDays: number
}

/**
 * 병목 뷰 조립(순수) — 네트워크·시계 의존은 인자로 받는다.
 * windowDays 는 달력이 아니라 **측정 기점**(sha 있는 첫 complete 이벤트) 기준이다 — GitHub 과거는
 * 재구성 가능하지만 autonomous cohort 는 v2 원장 배포 이후에만 존재하므로, 4주 시계는
 * 그 시점부터 세는 것이 정직하다.
 */
export function buildBottleneckView(
  prs: PrRecord[],
  runs: AutonomyRunEntry[],
  morningObs: MorningObservation[],
  nowIso: string,
  apiComplete: boolean,
  tzOffsetMinutes?: number,
): BottleneckView {
  // complete 만 — hardstop/blocked 런은 PR 을 만들지 않았어야 하는 실패라 cohort 신호도
  // 관찰 시계의 기점도 될 수 없다(감사 반례 3).
  const completes = runs.filter((e) => e.event === 'complete' && typeof e.sha === 'string' && e.sha !== null)
  const completeShas = new Set(completes.map((e) => e.sha as string))
  const epoch = completes.length > 0 ? [...completes.map((e) => e.ts)].sort()[0] : null
  const windowDays = epoch
    ? Math.min(MIN_WINDOW_DAYS, Math.floor((Date.parse(nowIso) - Date.parse(epoch)) / 86_400_000))
    : 0

  const nonBot = prs.filter((p) => !p.authorIsBot)
  const counts = buildShaJoinCounts(nonBot, completeShas)
  const cohortCounts: Record<PrCohort, number> = { autonomous: 0, interactive: 0, unknown: 0 }
  const autonomousWaits: number[] = []
  const interactiveWaits: number[] = []
  let censoredCount = 0
  let censoredMaxAgeHours: number | null = null

  for (const pr of nonBot) {
    const cohort = classifyCohort(pr, completeShas, counts)
    cohortCounts[cohort]++
    if (cohort === 'unknown') continue // 불혼입 — 어느 지표에도 안 넣는다
    const w = computeWait(pr, nowIso)
    if (w.excluded) continue
    if (w.censored) {
      if (cohort === 'autonomous') {
        censoredCount++
        if (w.censoredAgeHours !== null && (censoredMaxAgeHours === null || w.censoredAgeHours > censoredMaxAgeHours)) {
          censoredMaxAgeHours = w.censoredAgeHours
        }
      }
      continue
    }
    if (w.waitHours !== null) {
      if (cohort === 'autonomous') autonomousWaits.push(w.waitHours)
      else interactiveWaits.push(w.waitHours)
    }
  }

  const windowStartIso = new Date(Date.parse(nowIso) - MIN_WINDOW_DAYS * 86_400_000).toISOString()
  const mornings = generateMornings(windowStartIso, nowIso, 9, tzOffsetMinutes)
  const carryoverHighMornings = countHighCarryoverMornings(nonBot, mornings)

  const selfReport = calcSelfReport(morningObs)

  return {
    judgment: judgeBottleneck({
      apiComplete,
      windowDays,
      observedAutonomousWaitHours: autonomousWaits,
      carryoverHighMornings,
    }),
    windowDays,
    cohortCounts,
    observedCount: autonomousWaits.length,
    censoredCount,
    censoredMaxAgeHours,
    interactiveMedianHours: median(interactiveWaits),
    carryoverHighMornings,
    selfReportResponseRate: selfReport.rate,
    selfReportDays: selfReport.days,
  }
}

/** 자기신고 응답률 — 로컬 데이터라 gh 유무와 무관하게 계산된다. 관측일 0 이면 rate null. */
export function calcSelfReport(morningObs: MorningObservation[]): { days: number; rate: number | null } {
  const daily = selectDailyObservations(morningObs)
  const withValues = [...daily.values()].filter(morningHasValues).length
  return { days: daily.size, rate: daily.size === 0 ? null : withValues / daily.size }
}

const VERDICT_KO: Record<BottleneckJudgment['verdict'], string> = {
  confirmed: '병목 확정',
  mixed: '혼합 신호 — 사람 검토',
  'not-proven': '병목 미입증',
  'insufficient-data': '데이터 부족',
  unmeasurable: '측정 불가',
}

/** 자기신고 참고 지표 표시 — gh 유무와 무관한 로컬 데이터. rate null = 관측일 0 뿐이다. */
function renderSelfReport(view: Pick<BottleneckView, 'selfReportResponseRate' | 'selfReportDays'>): void {
  if (view.selfReportDays === 0 || view.selfReportResponseRate === null) {
    log.plain(chalk.dim('  자기신고(참고): 관측일 0 — 아침 리포트 실행 기록 없음'))
    return
  }
  log.plain(
    chalk.dim(
      `  자기신고(참고): 응답률 ${pct(view.selfReportResponseRate)} (${view.selfReportDays}개 관측일 기준)`,
    ),
  )
}

/** Goal 111: 병목 계측 섹션. gh 부재·부분 실패는 측정 불가로 표기 — 0 으로 위장하지 않는다. */
function renderBottleneckStats(cwd: string): void {
  // 병목 섹션의 어떤 실패도 stats 의 다른 섹션을 죽이면 안 된다 — 섹션 단위 방어.
  try {
    renderBottleneckStatsInner(cwd)
  } catch (e) {
    log.plain(chalk.yellow(`  측정 불가 — 병목 섹션 내부 오류: ${e instanceof Error ? e.message : String(e)}`))
  }
}

function renderBottleneckStatsInner(cwd: string): void {
  log.plain(chalk.cyan(`\n⏱  ${t('stats.bottleneckTitle')}`))
  const morningObs = readMorningObservations(cwd)
  const avail = ghAvailability()
  if (!avail.ok) {
    log.plain(chalk.yellow(`  측정 불가 — ${avail.reason}. PR 대기·이월 지표를 계산할 수 없습니다.`))
    // 자기신고는 로컬 데이터 — gh 없이도 실제 응답률을 계산한다(0% 위장 금지).
    const sr = calcSelfReport(morningObs)
    renderSelfReport({ selfReportDays: sr.days, selfReportResponseRate: sr.rate })
    return
  }

  const nowIso = new Date().toISOString()
  const windowStartIso = new Date(Date.now() - MIN_WINDOW_DAYS * 86_400_000).toISOString()
  const fetched = fetchPrWindow(windowStartIso)
  const nonBot = fetched.prs.filter((p) => !p.authorIsBot)
  const apiComplete =
    fetched.listComplete && fetched.errors.length === 0 && nonBot.every((p) => p.timelineComplete)

  // 아침 관측 시각은 실행 머신 로컬 오프셋을 명시 전달하고 아래에서 시간대를 표기한다.
  const tzOffsetMinutes = -new Date().getTimezoneOffset()
  const view = buildBottleneckView(fetched.prs, readAutonomyLog(cwd), morningObs, nowIso, apiComplete, tzOffsetMinutes)
  const j = view.judgment

  log.plain(chalk.white(`  판정: ${VERDICT_KO[j.verdict]}`))
  if (j.verdict === 'unmeasurable') {
    for (const e of fetched.errors.slice(0, 3)) log.plain(chalk.yellow(`  ⚠ ${e}`))
    if (!nonBot.every((p) => p.timelineComplete)) {
      log.plain(chalk.yellow('  ⚠ 일부 PR 타임라인 미완 수집 — 판정 자료 불완전'))
    }
  }
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  log.plain(
    chalk.dim(
      `  관측 창: ${view.windowDays}/${MIN_WINDOW_DAYS}일 (측정 기점 = SHA 있는 첫 complete) · 아침 관측 09:00 ${tz}`,
    ),
  )
  log.plain(
    chalk.dim(
      `  autonomous 대기 중앙값: ${j.medianWaitHours === null ? '표본 없음' : `${j.medianWaitHours.toFixed(1)}h`}` +
        ` (관측 완료 ${view.observedCount}/${MIN_OBSERVED_SAMPLES}개` +
        (view.censoredCount > 0
          ? ` · 미조치 ${view.censoredCount}건${view.censoredMaxAgeHours === null ? '' : ` 최장 ${view.censoredMaxAgeHours.toFixed(0)}h`}`
          : '') +
        ')',
    ),
  )
  log.plain(
    chalk.dim(
      `  이월 많은 아침: ${view.carryoverHighMornings}회 · cohort: autonomous ${view.cohortCounts.autonomous}` +
        ` / interactive ${view.cohortCounts.interactive}` +
        (view.cohortCounts.unknown > 0 ? ` / unknown ${view.cohortCounts.unknown} (불혼입)` : ''),
    ),
  )
  if (view.interactiveMedianHours !== null) {
    log.plain(
      chalk.dim(
        `  interactive 중앙값(참고): ${view.interactiveMedianHours.toFixed(1)}h — 세션 중 조치가 섞여 판정에 안 씀`,
      ),
    )
  }
  renderSelfReport(view)
}

// N6(ⓔ): receipt-log 추세 렌더링(읽기 전용). 표본 부족·미측정은 정직 표기(0 위장 금지).
function renderTrend(cwd: string): void {
  const tr = computeReceiptTrend(readReceiptLog(cwd))

  log.bold(`\n📈 ${t('stats.trendTitle')}`)
  log.plain(chalk.gray('─'.repeat(40)))

  if (tr.total === 0) {
    log.plain(chalk.dim(`  ${t('stats.trendNoData')}`))
    // receipt 없어도 evolve/autonomy 섹션은 독립 노출(표본 0 정직 표기).
    renderEvolveEffect(cwd)
    renderAutonomyStats(cwd)
    printNextStep({ message: t('stats.trendNextMessage'), command: 'vhk receipt', cursorHint: t('stats.trendNextCursor') })
    return
  }

  log.plain(
    chalk.cyan(`\n🧾 발행 ${tr.total}`) +
      chalk.dim(` — ❌ block ${tr.byDecision.block} · ⚠️ caution ${tr.byDecision.caution} · ✅ pass ${tr.byDecision.pass}`),
  )
  log.plain(chalk.cyan('🚦 게이트 red') + chalk.white(` ${pct(tr.redRate.rate)}`) + chalk.dim(` (${tr.redRate.count}/${tr.redRate.total})`))
  log.plain(chalk.cyan('📂 dirty') + chalk.white(` ${pct(tr.dirtyRate.rate)}`) + chalk.dim(` (${tr.dirtyRate.count}/${tr.dirtyRate.total})`))
  log.plain(
    chalk.cyan('🎯 diff-cover 평균') +
      (tr.avgDiffCover === null
        ? chalk.dim(' 측정 없음')
        : chalk.white(` ${pct(tr.avgDiffCover)}`) + chalk.dim(` (측정 ${tr.coverN}/${tr.total})`)),
  )

  if (tr.trend) {
    const { delta, earlierBlockRate, recentBlockRate, earlierN, recentN } = tr.trend
    const arrow = delta > 0 ? '📈 악화' : delta < 0 ? '📉 개선' : '➡️  동일'
    log.plain(
      chalk.cyan('\n📊 block 추세') +
        chalk.white(` ${pct(earlierBlockRate)} → ${pct(recentBlockRate)}`) +
        chalk.dim(` (${arrow}, 앞 ${earlierN}개 vs 뒤 ${recentN}개)`),
    )
  } else {
    log.plain(chalk.dim('\n  추세: 표본 2개 미만 — 발행 더 누적 필요'))
  }

  // #374(evolve 효과측정): evolve-log 채택률 + check-log 위반 추세 — 읽기 전용, 별도 소스.
  renderEvolveEffect(cwd)
  // Goal 104 / #373: autonomy 완주율도 --trend 경로에 노출.
  renderAutonomyStats(cwd)

  printNextStep({ message: t('stats.trendNextMessage'), command: 'vhk receipt', cursorHint: t('stats.trendNextCursor') })
}

/** #374: 진화 제안 채택률(결정 기준) + RULES.md 위반수 추세 — 표본 부족은 정직 표기(0 위장 금지). */
function renderEvolveEffect(cwd: string): void {
  const adoption = calcAdoptionStats(readEvolveLogForStats(cwd))
  const checkTrend = computeCheckTrend(readCheckLog(cwd))

  log.plain(chalk.cyan('\n🔄 진화 채택률(결정 기준)'))
  if (adoption.applied.total === 0) {
    log.plain(chalk.dim('  표본 없음 — vhk evolve apply/reject 로 결정 누적 필요'))
  } else {
    log.plain(
      chalk.white(`  ${pct(adoption.applied.rate)}`) +
        chalk.dim(` (반영 ${adoption.applied.count}/${adoption.applied.total})`),
    )
    if (adoption.rejectReasons.length > 0) {
      log.plain(chalk.dim('  기각 사유 분포:'))
      for (const r of adoption.rejectReasons) {
        log.plain(chalk.dim(`    - ${r.reason}: ${r.count}건`))
      }
    }
  }

  log.plain(chalk.cyan('\n📐 RULES.md 위반수 추세'))
  if (checkTrend.total === 0) {
    log.plain(chalk.dim('  표본 없음 — vhk check 로 스냅샷 누적 필요'))
  } else if (!checkTrend.trend) {
    log.plain(chalk.dim(`  평균 위반 ${checkTrend.avgTotal ?? 0}건 (표본 ${checkTrend.total}개 — 추세 비교엔 2개 이상 필요)`))
  } else {
    const { delta, earlierAvg, recentAvg, earlierN, recentN } = checkTrend.trend
    const arrow = delta > 0 ? '📈 악화' : delta < 0 ? '📉 개선' : '➡️  동일'
    log.plain(
      chalk.white(`  ${earlierAvg.toFixed(1)}건 → ${recentAvg.toFixed(1)}건`) +
        chalk.dim(` (${arrow}, 앞 ${earlierN}개 vs 뒤 ${recentN}개)`),
    )
  }
}

function readEvolveLogForStats(cwd: string): EvolveLogEntry[] {
  try {
    return readEvolveLog(cwd)
  } catch (error) {
    log.warn('진화 결정 기록을 읽지 못해 진화 통계를 빈 기록으로 표시합니다.')
    log.dim(`  ${error instanceof Error ? error.message : String(error)}`)
    return []
  }
}
