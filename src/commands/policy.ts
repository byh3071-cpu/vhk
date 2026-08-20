/*
 * policy.ts — `vhk policy` 컨테이너 (작업 단위 124-T4 · RFC 0066 §8).
 *
 * 세 서브커맨드 전부 **읽기 전용이고 원장에 기록하지 않는다.** 조회로 전이가 일어나면
 * `vhk policy level` 을 세 번 불러 L1 → L3 로 올라가는 경로가 열린다(§4.3 적대 검증 치명 3).
 * 그래서 이 파일은 `appendPolicyDecision` 을 import 하지 않는다 — 실수로도 못 쓰게 한다.
 *
 * 전이는 자율 런 종결 이벤트에서만 일어난다. 여기서는 계산 결과를 보여주기만 한다.
 */
import chalk from 'chalk'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { log } from '../utils/logger.js'
import { ko } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { readAutonomyLog } from '../lib/autonomy-log.js'
import { readReceiptLog } from '../lib/receipt-log.js'
import { calcAutonomyStats } from '../lib/autonomy-stats.js'
import { decidePermissionLevel, PROMOTION_FAILURE_MAX } from '../lib/permission-level.js'
import { loadPolicyConfig } from '../lib/policy-config.js'
import { checkPolicyBaseline } from '../lib/policy-baseline.js'
import { lastLevelLine } from '../lib/policy-log.js'
import { deriveTaskKindDetailed, stagedPaths } from '../lib/task-kind.js'
import { preflight, exitCodeOf } from '../lib/execution-preflight.js'
import { readRunState } from '../lib/run-state.js'
import { HARD_STOP_PATH } from '../lib/state-files.js'
import { riskClassOf } from '../lib/risk-class.js'

/** 설정이 신뢰할 수 없으면 그 사실을 먼저 알린다 — 자율 레인은 이 상태에서 전부 거부다. */
function printConfigHealth(cwd: string): void {
  const config = loadPolicyConfig(cwd)
  if (config.failClosed) {
    log.warn(ko.policy.configFailClosed(config.reasonCode ?? 'UNKNOWN'))
  }
  const baseline = checkPolicyBaseline(cwd)
  if (baseline.mutated) log.warn(ko.policy.baselineMutated)
}

export function policyLevel(cwd: string = process.cwd()): void {
  console.log(chalk.bold(`\n${ko.policy.levelTitle}`))
  printConfigHealth(cwd)

  const config = loadPolicyConfig(cwd)
  const stats = calcAutonomyStats(readAutonomyLog(cwd), readReceiptLog(cwd))
  const last = lastLevelLine(cwd)
  const previous =
    last?.to !== undefined ? { to: last.to, judgedRuns: last.judgedRuns ?? 0, ts: last.ts } : null
  const decision = decidePermissionLevel(stats, { maxLevel: config.maxLevel }, previous)

  console.log(`  ${ko.policy.currentLevel(decision.level, decision.reasonCode)}`)
  console.log(chalk.dim(`  ${ko.policy.previousLine(previous?.to ?? null, previous?.judgedRuns ?? null)}`))

  // 조회로는 올라가지 않으므로 사람이 무엇을 기다려야 하는지 보이는 편이 낫다(§8.1).
  console.log(
    chalk.dim(
      `  ${ko.policy.nextPromotion(stats.judgedRuns, previous?.judgedRuns ?? 0, stats.rollingFailures, PROMOTION_FAILURE_MAX)}`,
    ),
  )

  printNextStep({
    message: ko.policy.nextStepLevel,
    command: 'vhk policy show',
    cursorHint: '권한 정책 보여줘',
  })
}

export function policyRisk(cwd: string = process.cwd()): void {
  console.log(chalk.bold(`\n${ko.policy.riskTitle}`))
  printConfigHealth(cwd)

  // 조회 시점 판정 대상 = 스테이징 목록(§5.2). 작업 트리 전체를 세면 관련 없는 로컬 변경
  // 하나가 모든 판정을 human 으로 만든다.
  const paths = stagedPaths(cwd)
  const breakdown = deriveTaskKindDetailed(paths)
  const risk = riskClassOf(breakdown)

  console.log(`  ${ko.policy.riskLine(risk, breakdown.kind)}`)
  console.log(chalk.dim(`  ${ko.policy.riskBreakdown(breakdown.total, breakdown.unclassified)}`))
  if (breakdown.unclassified > 0) console.log(chalk.yellow(`  ${ko.policy.unclassifiedHint}`))

  printNextStep({
    message: ko.policy.nextStepRisk,
    command: 'vhk policy show',
    cursorHint: '권한 정책 보여줘',
  })
}

export function policyShow(cwd: string = process.cwd()): void {
  const config = loadPolicyConfig(cwd)
  console.log(chalk.bold(`\n${ko.policy.showTitle}`))
  console.log(`  ${ko.policy.flags(config.record, config.enforce)}`)
  console.log(chalk.dim(`  ${ko.policy.maxLevelLine(config.maxLevel ?? null)}`))

  policyLevel(cwd)
  policyRisk(cwd)
}

/**
 * `vhk policy check -- <bin> [args...]` — 실행 전 결정론 검사를 사람이 미리 돌려본다.
 *
 * **읽기 전용이다.** 판정만 하고 원장에 쓰지 않으며 명령을 실행하지도 않는다.
 * 집행은 125b(작업 단위 126 과 함께)이고 여기서는 "돌리면 어떻게 판정되나" 만 보여준다.
 *
 * 종료 코드로 결과를 전달한다 — allow 0 · require-human 2 · deny 1.
 * `require-human` 을 0 으로 두지 않는 이유는 §4.3 이다.
 */
export function policyCheck(argv: string[], cwd: string = process.cwd()): void {
  console.log(chalk.bold(`
${ko.policy.checkTitle}`))
  printConfigHealth(cwd)

  const [bin, ...args] = argv
  if (!bin) {
    log.warn(ko.policy.checkUsage)
    process.exitCode = 1
    return
  }

  const config = loadPolicyConfig(cwd)
  if (!config.sectionsUsable || !config.limits) {
    // 허용목록·한도가 없으면 자율 레인은 아무것도 못 돌린다. 그 사실을 그대로 알린다.
    log.warn(ko.policy.checkNoSections)
    console.log(chalk.dim(`  ${ko.policy.configExample}`))
    process.exitCode = exitCodeOf('deny')
    return
  }

  const stats = calcAutonomyStats(readAutonomyLog(cwd), readReceiptLog(cwd))
  const last = lastLevelLine(cwd)
  const previous =
    last?.to !== undefined ? { to: last.to, judgedRuns: last.judgedRuns ?? 0, ts: last.ts } : null
  const level = decidePermissionLevel(stats, { maxLevel: config.maxLevel }, previous).level

  // 런 밖 판정이면 상태 파일이 없다 — 카운터 0, 경과 0 으로 본다(§6.3).
  const nowUtc = new Date().toISOString()
  const runs = Object.values(readRunState(cwd))
  const run = runs.length === 1 ? runs[0] : undefined

  const result = preflight(
    { bin, args },
    {
      // 판정용 존재 확인만 한다 — 기존 가드는 출력·차단까지 해서 조회 명령에 맞지 않는다.
      hardStopActive: existsSync(join(cwd, HARD_STOP_PATH)),
      allowlist: config.allow,
      limits: config.limits,
      level,
      runCommandCount: run?.commandCount ?? 0,
      startedAtUtc: run?.startedAtUtc ?? nowUtc,
      lastSeenUtc: run?.lastSeenUtc ?? nowUtc,
      nowUtc,
      clockAnomaly: run?.clockAnomaly,
    },
  )

  console.log(`  ${ko.policy.checkVerdict(result.verdict, result.reasonCode)}`)
  if (result.matchedId) console.log(chalk.dim(`  ${ko.policy.checkMatched(result.matchedId)}`))
  if (run === undefined) console.log(chalk.dim(`  ${ko.policy.checkOutsideRun}`))
  process.exitCode = exitCodeOf(result.verdict)
}
