import chalk from 'chalk'
import inquirer from 'inquirer'
import { readConfig, writeConfig } from '../lib/config.js'
import { readCostEntries, appendCostEntry, sumUsd, type CostEntry } from '../lib/cost-ledger.js'
import { evaluateBudget, usdOf, type BudgetEval } from '../lib/cost-policy.js'

// Goal 56: vhk cost — 자문형 비용·예산 가드.
// vhk 는 Claude API 를 직접 호출하지 않아 비용을 자동 추적 못 함 → 사용량은 외부 입력
// (`vhk cost add` 수동 / 환경변수 VHK_COST_*)으로 먹이고, 가드는 임계 초과 시 신호(exit code)로 집행.

export interface CostOptions {
  usd?: number
  in?: number
  out?: number
  model?: string
  /** --yes: 비대화형/초과 시 명시 승인 */
  yes?: boolean
}

interface UsageInput {
  usd?: number
  model?: string
  inputTokens?: number
  outputTokens?: number
}

/** 환경변수 주입 읽기. VHK_COST_USD 또는 토큰 셋이 있으면 그 사용량, 없으면 null. */
function readEnvUsage(): UsageInput | null {
  const usd = process.env.VHK_COST_USD
  const inT = process.env.VHK_COST_INPUT_TOKENS
  const outT = process.env.VHK_COST_OUTPUT_TOKENS
  const model = process.env.VHK_COST_MODEL
  if (usd === undefined && inT === undefined && outT === undefined) return null
  return {
    usd: usd !== undefined ? Number(usd) : undefined,
    model,
    inputTokens: inT !== undefined ? Number(inT) : undefined,
    outputTokens: outT !== undefined ? Number(outT) : undefined,
  }
}

function formatPct(pct: number): string {
  return `${Math.round(pct * 100)}%`
}

function printStatus(usedUsd: number, limitUsd: number | undefined, ev: BudgetEval): void {
  if (!limitUsd || limitUsd <= 0) {
    console.log(chalk.dim('  예산 미설정 — `vhk cost budget <usd>` 로 월 예산을 설정하세요.'))
    console.log(`  누적 사용량: $${usedUsd.toFixed(2)}`)
    return
  }
  const bar =
    ev.level === 'block'
      ? chalk.red(`🛑 ${formatPct(ev.pct)} (초과)`)
      : ev.level === 'warn'
        ? chalk.yellow(`⚠️ ${formatPct(ev.pct)}`)
        : chalk.green(`✅ ${formatPct(ev.pct)}`)
  console.log(`  예산: $${limitUsd.toFixed(2)} · 사용: $${usedUsd.toFixed(2)} · ${bar}`)
}

/**
 * `vhk cost [action] [value]`
 * - (없음)  status: 예산·사용량·임계 조회(읽기전용)
 * - add     사용량 기록(--usd N | --in/--out [+--model], 또는 VHK_COST_* env) → cost.jsonl append
 * - check   임계 집행: warn(≥80%) 경고 · block(≥100%) 비-TTY+미승인 차단(exit 1)·TTY 확인·--yes 승인
 * - budget  예산($) 설정 (vhk cost budget 100)
 */
export async function cost(action?: string, value?: string, opts: CostOptions = {}): Promise<void> {
  const cwd = process.cwd()
  const cfg = readConfig(cwd)
  const limit = cfg.budget?.limitUsd
  const warnPct = cfg.budget?.warnPct ?? 0.8
  const pricing = cfg.pricing

  console.log(chalk.bold('\n💰 비용·예산 가드'))
  console.log(chalk.gray('─'.repeat(40)))

  // ── budget: 예산 설정(쓰기) ──
  if (action === 'budget') {
    const amt = Number(value)
    if (!value || Number.isNaN(amt) || amt <= 0) {
      console.error(chalk.red('❌ 유효한 예산($) 필요 — 예: vhk cost budget 100'))
      process.exitCode = 1
      return
    }
    writeConfig({ ...cfg, budget: { ...cfg.budget, limitUsd: amt } }, cwd)
    console.log(chalk.green(`✅ 월 예산 → $${amt}`))
    return
  }

  // ── add: 사용량 기록(append) ──
  if (action === 'add') {
    const env = readEnvUsage()
    const src: UsageInput = env ?? {
      usd: opts.usd,
      model: opts.model,
      inputTokens: opts.in,
      outputTokens: opts.out,
    }
    const usd = usdOf(src, pricing)
    const hasTokens = !!(src.inputTokens || src.outputTokens)
    if (!(usd > 0) && !hasTokens) {
      console.error(
        chalk.red('❌ 사용량 필요 — `--usd N` 또는 `--in N --out N [--model M]`(config pricing) / 또는 VHK_COST_* env')
      )
      process.exitCode = 1
      return
    }
    const entry: CostEntry = {
      ts: new Date().toISOString(),
      source: env ? 'env' : 'manual',
      usd,
      model: src.model,
      inputTokens: src.inputTokens,
      outputTokens: src.outputTokens,
    }
    appendCostEntry(cwd, entry)
    console.log(chalk.green(`✅ 비용 +$${usd.toFixed(4)} 기록 (${entry.source})`))
    printStatus(sumUsd(readCostEntries(cwd)), limit, evaluateBudget(sumUsd(readCostEntries(cwd)), limit, warnPct))
    return
  }

  // status / check 공통 — 누적 사용량 평가
  const used = sumUsd(readCostEntries(cwd))
  const ev = evaluateBudget(used, limit, warnPct)
  printStatus(used, limit, ev)

  // ── status (action 없음): 조회만 ──
  if (action !== 'check') {
    if (ev.level === 'warn') console.log(chalk.yellow('  ⚠️ 예산 80% 도달 — 사용량 점검 권장.'))
    if (ev.level === 'block') console.log(chalk.red('  🛑 예산 초과 — `vhk cost check` 로 가드 집행.'))
    return
  }

  // ── check: 임계 집행(runGuarded 동형 의미 — cost level 구동) ──
  if (ev.level === 'allow') return
  if (ev.level === 'warn') {
    console.log(chalk.yellow('⚠️ 예산 80% 도달 — 경고(차단 아님).'))
    return
  }
  // block (≥100%)
  if (opts.yes) {
    console.log(chalk.yellow('⚠️ 예산 초과지만 --yes 승인 → 진행.'))
    return
  }
  const isTTY = !!process.stdout.isTTY
  if (isTTY) {
    const { ok } = await inquirer.prompt<{ ok: boolean }>([
      { type: 'confirm', name: 'ok', message: '예산을 초과했습니다. 그래도 계속할까요?', default: false },
    ])
    if (ok) return
    console.log(chalk.gray('취소됨 — 예산 가드에서 중단.'))
    process.exitCode = 1
    return
  }
  console.log(chalk.red('🛑 예산 초과(100%+) — 비대화형+미승인 → 차단(exit 1). (--yes 로 승인)'))
  process.exitCode = 1
}
