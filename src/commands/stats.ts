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
import { readAutonomyLog, type AutonomyRunEntry } from '../lib/autonomy-log.js'

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
  const decisions = entries.filter((entry) => entry.event !== 'undo')
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

/** Goal 104 / #373: autonomy-run 완주율. starts=0 이면 rate null(0% 위장 금지). */
export interface AutonomyStats {
  starts: number
  complete: number
  hardstop: number
  blocked: number
  /** interventions=0 complete / starts. starts=0 → null */
  completionRate: number | null
  /** complete 중 interventions>0 */
  intervenedComplete: number
}

/**
 * 자율 루프 완주율 — 순수 계산(fs 0).
 * 분자 = complete 이면서 (interventions ?? 0)===0.
 * 분모 = start 이벤트 수. 표본 0이면 completionRate=null.
 */
export function calcAutonomyStats(entries: AutonomyRunEntry[]): AutonomyStats {
  let starts = 0
  let complete = 0
  let hardstop = 0
  let blocked = 0
  let unattendedComplete = 0
  let intervenedComplete = 0
  for (const e of entries) {
    if (e.event === 'start') starts++
    else if (e.event === 'complete') {
      complete++
      if ((e.interventions ?? 0) > 0) intervenedComplete++
      else unattendedComplete++
    } else if (e.event === 'hardstop') hardstop++
    else if (e.event === 'blocked') blocked++
  }
  return {
    starts,
    complete,
    hardstop,
    blocked,
    intervenedComplete,
    completionRate: starts === 0 ? null : unattendedComplete / starts,
  }
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

  printNextStep({
    message: t('stats.nextMessage'),
    command: 'vhk verify',
    cursorHint: t('stats.nextCursor'),
  })
}

/** Goal 104: autonomy-run.jsonl → 완주율 섹션(읽기 전용). */
function renderAutonomyStats(cwd: string): void {
  const a = calcAutonomyStats(readAutonomyLog(cwd))
  log.plain(chalk.cyan(`\n🤖 ${t('stats.autonomyTitle')}`))
  if (a.starts === 0) {
    log.plain(chalk.dim(`  ${t('stats.autonomyNoData')}`))
    return
  }
  log.plain(
    chalk.white(`  ${pct(a.completionRate!)}`) +
      chalk.dim(
        ` (무인 complete ${a.complete - a.intervenedComplete}/${a.starts}` +
          ` · hardstop ${a.hardstop} · blocked ${a.blocked}` +
          (a.intervenedComplete > 0 ? ` · 개입complete ${a.intervenedComplete}` : '') +
          ')',
      ),
  )
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
