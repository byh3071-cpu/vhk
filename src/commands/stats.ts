import chalk from 'chalk'
import { log } from '../utils/logger.js'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { readLedger, type LedgerEntry } from '../lib/evidence-ledger.js'
import { readAiActions, type AiActionEntry } from '../lib/ai-actions-ledger.js'
import { readQueue, type EvolveQueueItem } from './evolve.js'

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
    if (e.status === 'PASS') pass++
    else if (e.status === 'WARN') warn++
    else if (e.status === 'FAIL') fail++
  }
  return { pass, warn, fail, total: entries.length }
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

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

// ── 커맨드 핸들러 (읽기 전용 — 파일 쓰기 없음) ──────────────────────────────────

export async function stats(): Promise<void> {
  const cwd = process.cwd()

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
