import chalk from 'chalk'
import { log } from '../utils/logger.js'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { readLedger, type LedgerEntry } from '../lib/evidence-ledger.js'
import { readAiActions, type AiActionEntry } from '../lib/ai-actions-ledger.js'
import { readQueue, type EvolveQueueItem } from './evolve.js'
import { readReceiptLog, type ReceiptLogEntry } from '../lib/receipt-log.js'

/**
 * Goal 61: vhk stats — 읽기전용 통계·대시보드 집계.
 * 3소스: 증거 원장(ledger.jsonl, PASS/WARN/FAIL) + AI 행동 원장(ai-actions.jsonl, 차단율) + 진화 큐(적용율).
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
  /** 앞절반 vs 뒷절반 block 비율 비교. total<2 면 null(표본 부족). */
  trend: {
    window: number
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
    const mid = Math.floor(total / 2)
    const earlierBlockRate = blockRate(sorted.slice(0, mid))
    const recentBlockRate = blockRate(sorted.slice(mid))
    trend = { window: mid, earlierBlockRate, recentBlockRate, delta: recentBlockRate - earlierBlockRate }
  }
  return {
    total,
    byDecision,
    redRate: rate(red),
    dirtyRate: rate(dirty),
    avgDiffCover: coverN === 0 ? null : coverSum / coverN,
    trend,
  }
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

  // 3소스 읽기 (전부 읽기 전용 — readQueue 는 in-memory v2 변환만, 디스크 미변경)
  const ledger = readLedger(cwd)
  const actions = readAiActions(cwd)
  const queue = readQueue(cwd)

  const ls = countLedgerStatus(ledger)
  const block = calcBlockRate(actions)
  const apply = calcApplyRate(queue.items)

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

  printNextStep({
    message: t('stats.nextMessage'),
    command: 'vhk verify',
    cursorHint: t('stats.nextCursor'),
  })
}

// N6(ⓔ): receipt-log 추세 렌더링(읽기 전용). 표본 부족·미측정은 정직 표기(0 위장 금지).
function renderTrend(cwd: string): void {
  const tr = computeReceiptTrend(readReceiptLog(cwd))

  log.bold(`\n📈 ${t('stats.trendTitle')}`)
  log.plain(chalk.gray('─'.repeat(40)))

  if (tr.total === 0) {
    log.plain(chalk.dim(`  ${t('stats.trendNoData')}`))
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
      (tr.avgDiffCover === null ? chalk.dim(' 측정 없음') : chalk.white(` ${pct(tr.avgDiffCover)}`)),
  )

  if (tr.trend) {
    const { delta, earlierBlockRate, recentBlockRate, window } = tr.trend
    const arrow = delta > 0 ? '📈 악화' : delta < 0 ? '📉 개선' : '➡️  동일'
    log.plain(
      chalk.cyan('\n📊 block 추세') +
        chalk.white(` ${pct(earlierBlockRate)} → ${pct(recentBlockRate)}`) +
        chalk.dim(` (${arrow}, 절반 ${window}개씩)`),
    )
  } else {
    log.plain(chalk.dim('\n  추세: 표본 2개 미만 — 발행 더 누적 필요'))
  }

  printNextStep({ message: t('stats.trendNextMessage'), command: 'vhk receipt', cursorHint: t('stats.trendNextCursor') })
}
