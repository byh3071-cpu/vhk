import chalk from 'chalk'
import { existsSync, readFileSync } from 'node:fs'
import { ko } from '../i18n/ko.js'
import { listGoals } from '../lib/goal-frontmatter.js'
import {
  appendBlocker,
  clearHardStop,
  countActiveBlockers,
  isHardStopActive,
  readHardStopReason,
  BLOCKERS_PATH,
  HARD_STOP_BLOCKER_THRESHOLD,
} from '../lib/state-files.js'
import {
  appendAutonomyEntry,
  newAutonomyRunId,
  normalizeFailureKind,
  readAutonomyLog,
  AUTONOMY_SCHEMA_VERSION,
  type AutonomyEvent,
  type AutonomyRunEntry,
} from '../lib/autonomy-log.js'
import {
  changedPathsBetweenDetailed,
  deriveTaskKindDetailed,
  normalizeTaskKind,
  type TaskKind,
  type TaskKindBreakdown,
} from '../lib/task-kind.js'
import { getCommitInfo } from '../lib/git-repo.js'
import {
  expectedRiskDecision,
  recordRunTermination,
  type RunTerminationRecord,
} from '../lib/policy-record.js'
import {
  isCompleteRiskDecisionForRun,
  readPolicyLog,
  type RiskDerivation,
} from '../lib/policy-log.js'
import { checkPolicyBaseline } from '../lib/policy-baseline.js'
import { readPolicyConfigSnapshot, type PolicyConfigSnapshot } from '../lib/policy-config.js'
import { ensurePolicyFilesIgnored } from '../lib/policy-files.js'
import {
  endRun,
  ensureTerminalRequestSnapshotLocked,
  ensureTerminationPolicySnapshotLocked,
  inspectRunRecord,
  readRunState,
  startRun,
  withRunStateLock,
  type ExpectedTerminalRequest,
} from '../lib/run-state.js'
import { recordLesson, recordSuccess } from './memory.js'
import { selectActiveId } from './goal.js'

/** #373 재검증: '--goal abc'→NaN, ' 1'(공백패딩)→조용히 1 로 오염되는 걸 막는 전용 마커
 * (#317 resolveGoalId 와 동일 가드 — 원시 문자열 단계에서 /^\d+$/ 로만 통과시킨다). */
export const INVALID_AUTONOMY_ARG = Symbol('invalid-autonomy-arg')

/** --goal/--ticks/--interventions 원시 문자열을 Number() 변환 전에 검증(#317 과 동일 계약). */
export function parseAutonomyIntArg(
  raw: string | undefined
): number | undefined | typeof INVALID_AUTONOMY_ARG {
  if (raw === undefined) return undefined
  if (!/^\d+$/.test(raw)) return INVALID_AUTONOMY_ARG
  return Number(raw)
}

function activeGoalId(): number | undefined {
  const goals = listGoals('goals')
  const id = selectActiveId(goals)
  return id ?? undefined
}

export async function blocker(description: string, opts: { dryRun?: boolean } = {}): Promise<void> {
  console.log(chalk.bold(`\n${ko.agent.blockerTitle}\n`))
  if (!description || !description.trim()) {
    console.log(chalk.red('  ❌ 블로커 설명을 입력해 주세요.'))
    console.log(chalk.dim('  예: vhk blocker "tsc 에러 — simple-git 타입 호환"'))
    process.exitCode = 1
    return
  }
  // #159: --dry-run — blockers.md/HARD_STOP 변경 없이 기록 시 결과만 미리보기.
  if (opts.dryRun) {
    const current = existsSync(BLOCKERS_PATH) ? readFileSync(BLOCKERS_PATH, 'utf-8') : ''
    const active = countActiveBlockers(current)
    const isDogfood = /\[(dogfood|skip-hardstop)\]/i.test(description)
    const projected = active + (isDogfood ? 0 : 1)
    console.log(chalk.cyan(`  🔎 --dry-run — 기록하지 않음. 현재 활성 ${active}건 → 기록 시 ${projected}건${isDogfood ? ' ([dogfood] 태그: 임계값 제외)' : ''}.`))
    if (!isDogfood && projected >= HARD_STOP_BLOCKER_THRESHOLD) {
      console.log(chalk.yellow(`     ⚠️  기록하면 임계값(${HARD_STOP_BLOCKER_THRESHOLD}) 도달 → HARD_STOP 트립. ([dogfood] 태그로 회피 가능)`))
    }
    return
  }
  const goalId = activeGoalId()
  const r = appendBlocker(description, goalId)
  console.log(chalk.green(`  ✅ blocker 기록 (현재 활성 ${r.count}건)`))
  if (r.hardStopTripped) {
    console.log(chalk.red.bold('  🛑 HARD_STOP 자동 생성 — 모든 자동화 중단.'))
    console.log(chalk.yellow('     사람 검토 후 `vhk resume --confirm` 으로만 해제.'))
    process.exitCode = 2
  }
}

export async function learn(lesson: string): Promise<void> {
  console.log(chalk.bold(`\n${ko.agent.learnTitle}\n`))
  if (!lesson || !lesson.trim()) {
    console.log(chalk.red('  ❌ 교훈 내용을 입력해 주세요.'))
    console.log(chalk.dim('  예: vhk learn "PowerShell 에서는 ; 사용 (&& 미지원)"'))
    process.exitCode = 1
    return
  }
  // Goal 18(v2.0 breaking): 교훈은 memory v2 failures.lesson 한 곳(단일 출처)에 모은다.
  // (과거엔 learnings.md 에 따로 적었으나 v2 는 통합 — learnings.md 기존 항목은 마이그레이션으로 흡수.)
  const goalId = activeGoalId()
  const entry = recordLesson(process.cwd(), lesson, goalId)
  if (!entry) {
    // memory.json 손상 의심 — 빈 v2 로 덮지 않고 중단(데이터 손실 방지).
    console.log(chalk.red('  ❌ memory.json 손상 의심 — 교훈 기록 중단. 원본/백업 확인 후 다시 시도하세요.'))
    process.exitCode = 1
    return
  }
  console.log(chalk.green(`  ✅ 교훈 기록 → memory failures.lesson (${entry.id})`))
  console.log(chalk.dim('  교훈·결정·실패·성공 모두 vhk memory (단일 SoT). vhk memory list 로 확인.'))
}

// N3: vhk win — 성공 기록(learn 의 성공 쌍둥이). successes.content → pattern reinforce → evolve 후보.
export async function win(content: string): Promise<void> {
  console.log(chalk.bold(`\n${ko.agent.winTitle}\n`))
  if (!content || !content.trim()) {
    console.log(chalk.red('  ❌ 성공 내용을 입력해 주세요.'))
    console.log(chalk.dim('  예: vhk win "worktree 병렬로 충돌 0 머지 성공"'))
    process.exitCode = 1
    return
  }
  const goalId = activeGoalId()
  const entry = recordSuccess(process.cwd(), content, goalId)
  if (!entry) {
    // memory.json 손상 의심 — 빈 v2 로 덮지 않고 중단(데이터 손실 방지, learn 과 동일 계약).
    console.log(chalk.red('  ❌ memory.json 손상 의심 — 성공 기록 중단. 원본/백업 확인 후 다시 시도하세요.'))
    process.exitCode = 1
    return
  }
  console.log(chalk.green(`  ✅ 성공 기록 → memory successes (${entry.id})`))
  console.log(chalk.dim('  성공 패턴은 vhk pattern detect → vhk evolve 재사용 후보로 복리됩니다.'))
}

export interface AutonomyLogOptions {
  event: AutonomyEvent
  goal?: number
  runId?: string
  ticks?: number
  interventions?: number
  reviewRejected?: boolean
  /** Goal 110-T5: 인프라 실패(네트워크·할당량)는 분모에서 빠진다. 종결 이벤트에서만 의미 있음. */
  failureKind?: string
}

function terminalRequestFromOptions(
  opts: AutonomyLogOptions,
  goalId: number | undefined,
  nowIso: string,
  policyInvalidated: boolean,
): ExpectedTerminalRequest {
  const optionalCount = (value: number | undefined): number | undefined => (
    Number.isSafeInteger(value) && (value as number) >= 0 ? value : undefined
  )
  return {
    ts: nowIso,
    event: opts.event as ExpectedTerminalRequest['event'],
    policyInvalidated,
    goal: optionalCount(goalId),
    ticks: optionalCount(opts.ticks),
    interventions: optionalCount(opts.interventions),
    reviewRejected: opts.event === 'hardstop' ? opts.reviewRejected : undefined,
    failureKind: opts.event === 'complete' ? undefined : normalizeFailureKind(opts.failureKind),
  }
}

/** 이미 내구화된 legacy terminal을 backfill할 때는 현재 CLI 입력이 아니라 공개 종결을 고정한다. */
function terminalRequestFromEntry(entry: AutonomyRunEntry): ExpectedTerminalRequest | null {
  if (entry.event !== 'complete' && entry.event !== 'hardstop' && entry.event !== 'blocked') return null
  const ts: unknown = entry.ts
  if (
    typeof ts !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(ts)
    || !Number.isFinite(Date.parse(ts))
  ) return null

  const optionalCount = (value: unknown): number | undefined => (
    Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : undefined
  )
  const goal = optionalCount(entry.goal)
  const ticks = optionalCount(entry.ticks)
  const interventions = optionalCount(entry.interventions)
  if (
    (entry.goal !== undefined && goal === undefined)
    || (entry.ticks !== undefined && ticks === undefined)
    || (entry.interventions !== undefined && interventions === undefined)
  ) return null

  const rawReviewRejected: unknown = entry.reviewRejected
  if (rawReviewRejected !== undefined && typeof rawReviewRejected !== 'boolean') return null
  if (entry.event !== 'hardstop' && rawReviewRejected !== undefined) return null

  const rawFailureKind: unknown = entry.failureKind
  const failureKind = typeof rawFailureKind === 'string'
    ? normalizeFailureKind(rawFailureKind)
    : undefined
  if (rawFailureKind !== undefined && failureKind === undefined) return null
  if (entry.event === 'complete' && rawFailureKind !== undefined) return null

  return {
    ts,
    event: entry.event,
    policyInvalidated: false,
    goal,
    ticks,
    interventions,
    reviewRejected: entry.event === 'hardstop' ? rawReviewRejected : undefined,
    failureKind: entry.event === 'complete' ? undefined : failureKind,
  }
}

/** 이 런의 변경 범위 — 종결 라인의 `taskKind` 와 위험도 판정(124-T2)이 같은 값을 본다. */
interface RunScope {
  taskKind: TaskKind
  breakdown: TaskKindBreakdown
  derivedFrom: RiskDerivation
}

const UNKNOWN_SCOPE: RunScope = {
  taskKind: 'unknown',
  breakdown: { kind: 'unknown', total: 0, unclassified: 0 },
  derivedFrom: 'none',
}

/**
 * Goal 110-T3: 이 런이 건드린 작업 유형을 경로에서 유도한다.
 * 같은 runId 의 start 라인이 남긴 sha 가 시작점 — 그 라인이 없거나(구스키마) sha 가 없으면
 * 범위를 알 수 없으므로 'unknown'. 안전한 유형으로 낙관 추정하지 않는다.
 *
 * `breakdown.kind` 는 `deriveTaskKind` 와 같은 값이다(task-kind.ts 계약). 원장에 쓰는
 * `taskKind` 의 의미는 그대로고, 미분류 수와 유도 출처만 위험도 판정용으로 덧붙는다(RFC 0066 §5.3).
 */
function deriveRunScope(cwd: string, runId: string, headSha: string | null): RunScope {
  if (!headSha) return UNKNOWN_SCOPE
  const start = readAutonomyLog(cwd).find((e) => e.runId === runId && e.event === 'start')
  const fromSha = start?.sha
  if (!fromSha) return UNKNOWN_SCOPE
  const changed = changedPathsBetweenDetailed(cwd, fromSha, headSha)
  if (!changed.ok) return UNKNOWN_SCOPE
  const breakdown = deriveTaskKindDetailed(changed.paths)
  return { taskKind: breakdown.kind, breakdown, derivedFrom: 'paths' }
}

type RunPolicyInvalidation = 'RUN_START_MISSING' | 'POLICY_CONFIG_MUTATED' | null

/** 공개 원장에는 실제 정책 해시를 넣지 않는다. 포인터가 요구한 비추적 run-state와 현재만 대조한다. */
function runPolicyInvalidation(
  cwd: string,
  runId: string,
  start: ReturnType<typeof readAutonomyLog>[number] | undefined,
  current: PolicyConfigSnapshot,
): RunPolicyInvalidation {
  const privateState = readRunState(cwd)[runId]
  const recorded = privateState?.policyConfigHash
  const hasPrivateHash = typeof recorded === 'string'
  // 수동·legacy 종결은 기존대로 허용한다. 단 private 시작 해시가 남아 있는데 공개 start만
  // 사라졌다면 새 런의 무결성 증거가 유실된 것이므로 legacy로 낙관 해석하지 않는다.
  if (start === undefined) {
    if (privateState?.policySnapshotOrigin === 'terminal-v1') {
      return recorded === current.contentHash ? null : 'POLICY_CONFIG_MUTATED'
    }
    return hasPrivateHash ? 'RUN_START_MISSING' : null
  }

  const marker: unknown = start.policyConfigSnapshot
  if (marker === undefined) {
    if (privateState?.policySnapshotOrigin === 'terminal-v1') {
      return recorded === current.contentHash ? null : 'POLICY_CONFIG_MUTATED'
    }
    return hasPrivateHash ? 'RUN_START_MISSING' : null // 도입 전 legacy start
  }
  if (marker === 'absent') {
    return hasPrivateHash
      ? 'RUN_START_MISSING'
      : current.configPresent ? 'POLICY_CONFIG_MUTATED' : null
  }
  if (marker === 'run-state-v1') {
    return typeof recorded !== 'string'
      || recorded !== current.contentHash
      || privateState?.policySnapshotOrigin === 'terminal-v1'
      ? 'POLICY_CONFIG_MUTATED'
      : null
  }
  return 'POLICY_CONFIG_MUTATED' // 알 수 없는 포인터는 낙관 해석하지 않는다.
}

/** 판정 원장 기록 결과를 사람에게 보여준다. 게이트가 꺼져 있었으면 아무것도 찍지 않는다 — off 는 종전과 같아야 한다. */
function printPolicyRecord(rec: RunTerminationRecord): void {
  if (rec.recordingOff || !rec.level || !rec.risk) return
  const { level, risk } = rec
  if (level.written) {
    console.log(
      chalk.green(
        `  ✅ 권한 판정 기록 — 단계 ${level.from ?? '없음'} → ${level.to} (${level.transition} · ${level.reasonCode}) — ${ko.policy.levelReason(level.reasonCode)}`,
      ),
    )
  } else if (level.skipReason === 'CAS_CONFLICT') {
    console.log(chalk.yellow('  ⚠ 권한 단계 기록 보류 — 다른 세션이 먼저 썼습니다 (CAS_CONFLICT). 다음 종결에서 다시 판정합니다.'))
  } else {
    console.log(chalk.dim(`  권한 판정 기록 — 단계 ${level.to} 유지, 판정 대상 런이 늘지 않아 전이 라인 없음 (NO_NEW_JUDGED_RUN)`))
  }
  console.log(
    chalk.dim(
      `  위험도 기록: ${risk.riskClass === 'human' ? '사람 확인 필요' : '자동 허용 범위'} (${risk.reasonCode}) · 집행 없음 — 이력만 남깁니다${rec.gate.enforce ? ' (enforce 는 작업 단위 126 이후 동작)' : ''}`,
    ),
  )
}

function fsErrorCode(error: unknown): string {
  return error instanceof Error
    && 'code' in error
    && typeof (error as NodeJS.ErrnoException).code === 'string'
    ? (error as NodeJS.ErrnoException).code as string
    : 'UNKNOWN'
}

interface CleanupFailure {
  code: string
  hint: string
}

function cleanupRunState(cwd: string, runId: string): CleanupFailure | null {
  try {
    endRun(cwd, runId)
    return null
  } catch (error) {
    const code = fsErrorCode(error)
    return {
      code,
      hint: code === 'RUN_STATE_LOCK_TIMEOUT' && error instanceof Error
        ? ` ${error.message}`
        : '',
    }
  }
}

// 이슈 #373: vhk-auto SKILL.md 루프가 자율성완주율 분모/분자를 남기는 전용 커맨드.
// start 는 runId 를 새로 발급 — 나머지 3개(complete/hardstop/blocked) 는 그 runId 로 종결한다.
export async function autonomyLog(opts: AutonomyLogOptions): Promise<void> {
  console.log(chalk.bold(`\n${ko.agent.autonomyLogTitle}\n`))
  const goalId = opts.goal ?? activeGoalId()
  const cwd = process.cwd()
  // Goal 110-T1: SHA 는 CLI 가 직접 잰다. 에이전트 입력을 받지 않는 유일한 판정 재료라,
  // 자기 보고(complete·interventions)를 기계 증거(receipt-log)와 조인하는 축이 된다.
  const headSha = getCommitInfo(cwd)?.sha ?? null
  if (opts.event === 'start') {
    const snapshot = readPolicyConfigSnapshot(cwd)
    if (snapshot.configPresent) {
      try {
        // 손상 설정도 로컬 전용 경계에서는 예외가 아니다. 판정을 거부하기 전에 먼저
        // policy/baseline/run-state 묶음이 Git에 노출되지 않도록 보강한다.
        ensurePolicyFilesIgnored(cwd)
      } catch (error) {
        console.log(chalk.red(`  ❌ 정책 로컬 파일 제외 규칙을 보강하지 못했습니다 (${fsErrorCode(error)}). 런을 시작하지 않습니다.`))
        process.exitCode = 1
        return
      }
    }
    if (snapshot.config.failClosed) {
      console.log(chalk.red(`  ❌ ${ko.policy.configFailClosed(snapshot.config.reasonCode ?? 'UNKNOWN')}`))
      process.exitCode = 1
      return
    }
    const baseline = checkPolicyBaseline(cwd, snapshot)
    if (baseline.mutated) {
      console.log(chalk.red(`  ❌ ${ko.policy.baselineBlocked}`))
      process.exitCode = 1
      return
    }
    if (baseline.configPresent && baseline.baselineMissing) {
      console.log(chalk.yellow(`  ⚠ ${ko.policy.baselineMissing}`))
    }

    const runId = newAutonomyRunId()
    const nowIso = new Date().toISOString()
    const policyConfigSnapshot = snapshot.configPresent ? 'run-state-v1' : 'absent'
    if (snapshot.configPresent) {
      // contentHash=null은 읽기 실패인데 위 failClosed가 먼저 막는다. 타입 경계에서도 다시 닫는다.
      if (snapshot.contentHash === null) {
        console.log(chalk.red(`  ❌ ${ko.policy.configFailClosed('POLICY_CONFIG_UNREADABLE')}`))
        process.exitCode = 1
        return
      }
      try {
        startRun(cwd, runId, nowIso, snapshot.contentHash)
      } catch (error) {
        const rollback = cleanupRunState(cwd, runId)
        const detail = rollback === null ? '' : `; 부분 상태 되돌리기도 실패(${rollback.code})${rollback.hint}`
        const hint = fsErrorCode(error) === 'RUN_STATE_LOCK_TIMEOUT' && error instanceof Error
          ? ` ${error.message}`
          : ''
        console.log(chalk.red(`  ❌ 정책 런 시작 상태를 기록하지 못했습니다 (${fsErrorCode(error)}${detail}). 런을 시작하지 않습니다.${hint}`))
        process.exitCode = 1
        return
      }
    }
    try {
      appendAutonomyEntry(cwd, {
        ts: nowIso,
        runId,
        goal: goalId,
        event: 'start',
        schemaVersion: AUTONOMY_SCHEMA_VERSION,
        sha: headSha,
        policyConfigSnapshot,
      })
    } catch (error) {
      const rollback = snapshot.configPresent ? cleanupRunState(cwd, runId) : null
      const detail = rollback === null ? '' : `; 런 상태 되돌리기도 실패(${rollback.code})${rollback.hint}`
      console.log(chalk.red(`  ❌ 런 시작 원장을 기록하지 못했습니다 (${fsErrorCode(error)}${detail}). 런을 시작하지 않습니다.`))
      process.exitCode = 1
      return
    }
    console.log(chalk.green(`  ✅ 런 시작 기록 — runId: ${runId}`))
    if (!headSha) {
      console.log(chalk.yellow('  ⚠ HEAD SHA 미측정(git 레포 아님·커밋 0) — 이 런은 완주 판정 대상이 아닙니다.'))
    }
    console.log(chalk.dim('  이 runId 를 종결 이벤트(--run-id)에 그대로 넘기세요.'))
    return
  }
  // 종결 이벤트(complete/hardstop/blocked) 는 run-id 없이는 어느 런인지 알 수 없어 기록하지
  // 않는다 — blocker() 의 "빈 설명이면 기록 안 함" 방어 패턴과 동일 계약.
  if (!opts.runId || !opts.runId.trim()) {
    console.log(chalk.red('  ❌ --run-id 없이는 종결 이벤트를 기록할 수 없습니다.'))
    console.log(chalk.dim('  예: vhk autonomy-log --event complete --run-id <id>'))
    process.exitCode = 1
    return
  }
  const terminalRunId = opts.runId

  const synchronizeTermination = (): { cleanup: boolean } => {
    // 시작 뒤 정책 설정이 달라졌다면 성공으로 남기지 않는다. 이미 실패인 종결 이벤트는 유지하되,
    // 어떤 경우에도 바뀐 설정으로 판정 원장을 쓰지 않는다. 기준선 갱신은 사람 명령만 가능하다.
    const entries = readAutonomyLog(cwd)
    const startEntry = entries.find((entry) => entry.runId === terminalRunId && entry.event === 'start')
    const snapshot = readPolicyConfigSnapshot(cwd)
    // 설정 존재 여부를 잠금 밖에서 미리 읽지 않는다. 잠금을 기다리는 동안 policy.json이 생기거나
    // 사라져도 이 임계구역이 실제로 판정한 스냅샷과 ignore 보강 여부가 같아야 한다.
    if (snapshot.configPresent) ensurePolicyFilesIgnored(cwd)
    const baseline = checkPolicyBaseline(cwd, snapshot)
    const configInvalidated = snapshot.config.failClosed
    const existingTerminal = entries.find(
      entry => entry.runId === terminalRunId && entry.event !== 'start',
    )
    const terminalPolicyMarkersAbsent = existingTerminal !== undefined
      && existingTerminal.policyRecordExpected === undefined
      && existingTerminal.policyRecordSnapshot === undefined
    const preserveExistingTerminalExitCode = (): void => {
      if (existingTerminal?.event === 'blocked' && existingTerminal.failureKind === 'product') {
        process.exitCode = 1
      }
    }
    const policyRecordGate = snapshot.config.record || snapshot.config.enforce
    const privateInspection = inspectRunRecord(cwd, terminalRunId)
    const publicPolicyObligation =
      existingTerminal?.policyRecordExpected === true
      || existingTerminal?.policyRecordSnapshot !== undefined
    const privateEvidenceRequired =
      (privateInspection.kind === 'corrupt' && privateInspection.scope === 'record')
      || startEntry?.policyConfigSnapshot === 'run-state-v1'
      || publicPolicyObligation
      || policyRecordGate
    if (privateInspection.kind === 'corrupt' && privateEvidenceRequired) {
      console.log(chalk.red('  ❌ 이 runId의 비공개 런 상태가 손상됐습니다.'))
      console.log(chalk.dim('  손상 상태를 새 종료 요청으로 재생성하지 않습니다. 원본을 확인한 뒤 복구하세요.'))
      process.exitCode = 1
      return { cleanup: false }
    }
    const privateRecord = privateInspection.kind === 'valid'
      ? privateInspection.record
      : undefined
    const terminalSha = existingTerminal ? (existingTerminal.sha ?? null) : headSha
    const scope = deriveRunScope(cwd, terminalRunId, terminalSha)
    const taskKind = scope.taskKind
    const currentRiskExpectation = expectedRiskDecision({
      sha: terminalSha,
      breakdown: scope.breakdown,
      derivedFrom: scope.derivedFrom,
    })
    let policyRiskExpectation = currentRiskExpectation
    const runInvalidation = runPolicyInvalidation(cwd, terminalRunId, startEntry, snapshot)
    const policyInvalidated = baseline.mutated || configInvalidated || runInvalidation !== null
    const currentTerminalRequest = terminalRequestFromOptions(
      opts,
      goalId,
      new Date().toISOString(),
      policyInvalidated,
    )
    let terminalRequestExpectation = currentTerminalRequest
    const effectiveTerminal = (request: ExpectedTerminalRequest): {
      event: Exclude<AutonomyEvent, 'start'>
      failureKind: 'infra' | 'product' | undefined
      reviewRejected: boolean | undefined
    } => {
      const event = request.policyInvalidated && request.event === 'complete' ? 'blocked' : request.event
      return {
        event,
        failureKind: request.policyInvalidated
          ? 'product'
          : event === 'complete'
            ? undefined
            : request.failureKind,
        reviewRejected: event === 'hardstop' ? request.reviewRejected : undefined,
      }
    }
    let terminalPolicySnapshot: 'run-state-v1' | 'terminal-v1' | undefined
    if (existingTerminal) {
      const pinnedRetryRequest = privateRecord?.terminalRequestExpected
      // public blocked/product 만으로 "원래 complete였다"고 추정하지 않는다. 그 특수 전환은
      // private request가 invalidated complete를 직접 증명할 때만 아래 프로젝션 검증에서 허용한다.
      const sameRequestedEvent = pinnedRetryRequest !== undefined
        ? pinnedRetryRequest.event === opts.event
        : existingTerminal.event === opts.event
      if (!sameRequestedEvent) {
        console.log(chalk.red(`  ❌ 이미 ${existingTerminal.event}로 종결된 runId는 ${opts.event}로 바꿀 수 없습니다.`))
        process.exitCode = 1
        return { cleanup: false }
      }

      const policyObligationMarked =
        existingTerminal.policyRecordExpected === true
        || existingTerminal.policyRecordSnapshot !== undefined
        || privateRecord?.policyRecordPending === true
      const hasTerminalShaField = Object.prototype.hasOwnProperty.call(existingTerminal, 'sha')
      const rawTerminalSha: unknown = existingTerminal.sha
      const terminalShaValid =
        hasTerminalShaField
        && (rawTerminalSha === null || (typeof rawTerminalSha === 'string' && rawTerminalSha.length > 0))
      const hasTerminalTaskKind = Object.prototype.hasOwnProperty.call(existingTerminal, 'taskKind')
      const rawTerminalTaskKind: unknown = existingTerminal.taskKind
      const terminalTaskKindValid =
        hasTerminalTaskKind
        && typeof rawTerminalTaskKind === 'string'
        && normalizeTaskKind(rawTerminalTaskKind) === rawTerminalTaskKind
      if (policyObligationMarked && (!terminalShaValid || !terminalTaskKindValid)) {
        console.log(chalk.red('  ❌ 정책 판정 의무가 있는 종결 기록의 SHA 또는 작업 유형이 손상됐습니다.'))
        console.log(chalk.dim('  비공개 런 상태를 보존합니다. 종결 증거를 복구하기 전에는 완료로 재사용하지 않습니다.'))
        process.exitCode = 1
        return { cleanup: false }
      }

      const pinnedRiskExpectation = privateRecord?.policyRiskExpected
      const pinnedTerminalRequest = privateRecord?.terminalRequestExpected
      if (
        policyObligationMarked
        && privateRecord !== undefined
        && (pinnedRiskExpectation === undefined || pinnedTerminalRequest === undefined)
      ) {
        console.log(chalk.red('  ❌ 비공개 런 상태에 최초 위험도 판정 또는 종료 요청 스냅샷이 없습니다.'))
        console.log(chalk.dim('  재시도에서 판정·종료 종류를 다시 추정하지 않습니다. 런 상태를 보존합니다.'))
        process.exitCode = 1
        return { cleanup: false }
      }
      if (
        pinnedRiskExpectation !== undefined
        && (
          pinnedRiskExpectation.sha !== terminalSha
          || pinnedRiskExpectation.taskKind !== existingTerminal.taskKind
        )
      ) {
        console.log(chalk.red('  ❌ 비공개 위험도 판정과 공개 종결 기록이 일치하지 않습니다.'))
        process.exitCode = 1
        return { cleanup: false }
      }
      if (pinnedRiskExpectation !== undefined) {
        policyRiskExpectation = pinnedRiskExpectation
      }
      if (pinnedTerminalRequest !== undefined) {
        const preparedTerminalMatches =
          existingTerminal.event === pinnedTerminalRequest.event
          || (
            pinnedTerminalRequest.event === 'complete'
            && pinnedTerminalRequest.policyInvalidated
            && existingTerminal.event === 'blocked'
            && existingTerminal.failureKind === 'product'
          )
        if (!preparedTerminalMatches) {
          console.log(chalk.red('  ❌ 비공개 최초 종료 요청과 공개 종결 기록이 일치하지 않습니다.'))
          process.exitCode = 1
          return { cleanup: false }
        }
        terminalRequestExpectation = pinnedTerminalRequest
      }

      const unmarkedPolicyRetryCandidate =
        terminalPolicyMarkersAbsent
        && !policyObligationMarked
        && policyRecordGate
        && !policyInvalidated
      const hasStartSha = typeof startEntry?.sha === 'string' && startEntry.sha.length > 0
      const hasTerminalSha = typeof terminalSha === 'string' && terminalSha.length > 0
      const scopeReproductionFailed =
        pinnedRiskExpectation === undefined
        && hasStartSha
        && hasTerminalSha
        && scope.derivedFrom === 'none'
      const terminalKindChanged =
        pinnedRiskExpectation === undefined
        &&
        existingTerminal.taskKind !== undefined
        && existingTerminal.taskKind !== taskKind
      if (scopeReproductionFailed || terminalKindChanged) {
        if (!policyObligationMarked && !unmarkedPolicyRetryCandidate) {
          console.log(chalk.dim(`  런 종결 기록 재사용 — event: ${existingTerminal.event}, runId: ${terminalRunId}`))
          preserveExistingTerminalExitCode()
          return { cleanup: privateRecord !== undefined }
        }

        let terminalBoundRiskRecorded = false
        try {
          terminalBoundRiskRecorded = readPolicyLog(cwd).some(line => (
            isCompleteRiskDecisionForRun(line, terminalRunId)
            && line.sha === terminalSha
            && (
              existingTerminal.taskKind === undefined
              || line.taskKind === existingTerminal.taskKind
            )
          ))
        } catch {
          // 아래 fail-closed 분기에서 private 상태를 보존한다.
        }
        if (terminalBoundRiskRecorded && privateRecord === undefined) {
          console.log(chalk.dim(`  런 종결 기록 재사용 — event: ${existingTerminal.event}, runId: ${terminalRunId}`))
          preserveExistingTerminalExitCode()
          return { cleanup: false }
        }

        console.log(chalk.red('  ❌ 기존 종결 기록의 작업 범위를 안전하게 재현할 수 없습니다.'))
        console.log(chalk.dim('  정책 판정 의무와 비공개 런 상태를 보존합니다. Git 범위를 복구한 뒤 다시 시도하세요.'))
        process.exitCode = 1
        return { cleanup: false }
      }

      let riskRecorded = false
      let policyLines: ReturnType<typeof readPolicyLog> = []
      try {
        policyLines = readPolicyLog(cwd)
        riskRecorded = policyLines.some(
          line => isCompleteRiskDecisionForRun(line, terminalRunId, policyRiskExpectation),
        )
      } catch {
        // 원장 경로 장애는 아래 공식 기록 경로에서 같은 오류 코드로 드러낸다.
      }
      if (
        !riskRecorded
        && privateRecord === undefined
        && policyLines.some(line => (
          isCompleteRiskDecisionForRun(line, terminalRunId)
          && line.sha === terminalSha
          && line.taskKind === existingTerminal.taskKind
        ))
      ) {
        console.log(chalk.dim(`  런 종결 기록 재사용 — event: ${existingTerminal.event}, runId: ${terminalRunId}`))
        preserveExistingTerminalExitCode()
        return { cleanup: false }
      }
      const pendingPolicyRecord = !riskRecorded && (
        existingTerminal.policyRecordExpected === true
        || existingTerminal.policyRecordSnapshot !== undefined
        || privateRecord?.policyRecordPending === true
      )
      if (pendingPolicyRecord) {
        const legacyBackfill = privateRecord?.policyRecordLegacyBackfill === true
        const expectedOrigin = legacyBackfill
          ? privateRecord?.policySnapshotOrigin ?? null
          : existingTerminal.policyRecordSnapshot === 'run-state-v1'
            ? 'start-v1'
            : existingTerminal.policyRecordSnapshot === 'terminal-v1'
              ? 'terminal-v1'
              : null
        const startEvidenceValid = expectedOrigin === 'start-v1'
          ? startEntry?.policyConfigSnapshot === 'run-state-v1'
          : expectedOrigin === 'terminal-v1'
            ? startEntry === undefined || startEntry.policyConfigSnapshot === undefined
            : false
        const privateEvidenceValid =
          expectedOrigin !== null
          && privateRecord?.policySnapshotOrigin === expectedOrigin
          && privateRecord.policyConfigHash === snapshot.contentHash
        const publicEvidenceValid = legacyBackfill
          ? terminalPolicyMarkersAbsent
          : existingTerminal.policyRecordExpected === true && expectedOrigin !== null
        if (
          snapshot.config.failClosed
          || baseline.mutated
          || !policyRecordGate
          || !startEvidenceValid
          || !privateEvidenceValid
          || !publicEvidenceValid
        ) {
          console.log(chalk.red('  ❌ 정책 판정 원장이 누락됐지만 최초 정책 증거를 안전하게 재사용할 수 없습니다.'))
          console.log(chalk.dim('  해당 runId는 성공으로 재사용하지 않습니다. 정책 설정과 비공개 런 상태를 먼저 확인하세요.'))
          process.exitCode = 1
          return { cleanup: false }
        }
      }
      if (privateRecord?.terminalRequestExpected !== undefined) {
        const expectedTerminal = effectiveTerminal(privateRecord.terminalRequestExpected)
        const terminalEvidenceValid =
          existingTerminal.schemaVersion === AUTONOMY_SCHEMA_VERSION
          && existingTerminal.ts === privateRecord.terminalRequestExpected.ts
          && existingTerminal.event === expectedTerminal.event
          && existingTerminal.goal === privateRecord.terminalRequestExpected.goal
          && existingTerminal.ticks === privateRecord.terminalRequestExpected.ticks
          && existingTerminal.interventions === privateRecord.terminalRequestExpected.interventions
          && existingTerminal.reviewRejected === expectedTerminal.reviewRejected
          && existingTerminal.failureKind === expectedTerminal.failureKind
        if (!terminalEvidenceValid) {
          console.log(chalk.red('  ❌ 공개 종결 기록이 비공개 최초 종료 요청과 일치하지 않습니다.'))
          console.log(chalk.dim('  정책 판정 원장을 보충하거나 비공개 런 상태를 정리하지 않습니다.'))
          process.exitCode = 1
          return { cleanup: false }
        }
      }
      if (pinnedTerminalRequest?.policyInvalidated === true) {
        console.log(chalk.red('  ❌ 최초 종료 요청이 이미 정책 무효화 상태에서 blocked 처리됐습니다.'))
        console.log(chalk.dim('  이후 정책을 신규 승인처럼 사용해 원장을 보충하지 않습니다.'))
        process.exitCode = 1
        return { cleanup: false }
      }
      const legacyNeedsPolicyRetry =
        !riskRecorded
        && (pendingPolicyRecord || (
          existingTerminal.policyRecordExpected !== true
          && existingTerminal.policyRecordSnapshot === undefined
          && privateRecord?.policyRecordPending !== true
          && unmarkedPolicyRetryCandidate
        ))
      if (!legacyNeedsPolicyRetry) {
        console.log(chalk.dim(`  런 종결 기록 재사용 — event: ${existingTerminal.event}, runId: ${terminalRunId}`))
        preserveExistingTerminalExitCode()
        return { cleanup: privateRecord !== undefined }
      }

      if (unmarkedPolicyRetryCandidate) {
        const legacyTerminalRequest = terminalRequestFromEntry(existingTerminal)
        if (legacyTerminalRequest === null || snapshot.contentHash === null) {
          console.log(chalk.red('  ❌ 기존 종결 기록에서 최초 종료 요청과 정책 증거를 안전하게 고정할 수 없습니다.'))
          process.exitCode = 1
          return { cleanup: false }
        }
        const origin = startEntry?.policyConfigSnapshot === 'run-state-v1'
          ? 'start-v1'
          : 'terminal-v1'
        const prepared = ensureTerminationPolicySnapshotLocked(
          cwd,
          terminalRunId,
          currentTerminalRequest.ts,
          snapshot.contentHash,
          origin,
          currentRiskExpectation,
          legacyTerminalRequest,
          origin !== 'start-v1',
          true,
        )
        const preparedRisk = prepared?.policyRiskExpected
        const preparedRequest = prepared?.terminalRequestExpected
        if (
          prepared?.policyRecordPending !== true
          || prepared.policyRecordLegacyBackfill !== true
          || preparedRisk === undefined
          || preparedRequest === undefined
        ) {
          console.log(chalk.red('  ❌ 기존 종결의 정책 원장 보충 의무를 비공개 상태에 고정하지 못했습니다.'))
          process.exitCode = 1
          return { cleanup: false }
        }
        const preparedTerminal = effectiveTerminal(preparedRequest)
        const preparedEvidenceValid =
          preparedRisk.sha === terminalSha
          && (
            existingTerminal.taskKind === undefined
            || preparedRisk.taskKind === existingTerminal.taskKind
          )
          && existingTerminal.ts === preparedRequest.ts
          && existingTerminal.event === preparedTerminal.event
          && existingTerminal.goal === preparedRequest.goal
          && existingTerminal.ticks === preparedRequest.ticks
          && existingTerminal.interventions === preparedRequest.interventions
          && existingTerminal.reviewRejected === preparedTerminal.reviewRejected
          && existingTerminal.failureKind === preparedTerminal.failureKind
        if (!preparedEvidenceValid) {
          console.log(chalk.red('  ❌ 기존 종결 기록이 비공개 최초 종료 요청과 일치하지 않습니다.'))
          process.exitCode = 1
          return { cleanup: false }
        }
        policyRiskExpectation = preparedRisk
        terminalRequestExpectation = preparedRequest
        terminalPolicySnapshot = origin === 'start-v1' ? 'run-state-v1' : 'terminal-v1'
      }
    }

    if (
      !existingTerminal
      && privateRecord?.policyRecordPending === true
      && (
        privateRecord.policyRiskExpected === undefined
        || privateRecord.terminalRequestExpected === undefined
      )
    ) {
      console.log(chalk.red('  ❌ 비공개 런 상태의 최초 종결 준비 정보가 불완전합니다.'))
      process.exitCode = 1
      return { cleanup: false }
    }

    const existingPreparedRequest = !existingTerminal
      ? privateRecord?.terminalRequestExpected
      : undefined
    if (existingPreparedRequest !== undefined) {
      if (existingPreparedRequest.event !== currentTerminalRequest.event) {
        console.log(chalk.red('  ❌ 최초 종결 시도와 현재 종료 종류가 달라 종결 기록을 중단합니다.'))
        process.exitCode = 1
        return { cleanup: false }
      }
      // 최초 시도 뒤 정책이 새로 무효화됐으면 과거 complete를 성공으로 쓰지도, blocked로 다시
      // 계산해 바꾸지도 않는다. 최초 request를 보존한 채 사람이 정책 상태를 복구하게 한다.
      if (policyInvalidated && !existingPreparedRequest.policyInvalidated) {
        console.log(chalk.red('  ❌ 최초 종결 준비 뒤 정책 상태가 무효화되어 종결 기록을 중단합니다.'))
        process.exitCode = 1
        return { cleanup: false }
      }
      terminalRequestExpectation = existingPreparedRequest
    }

    if (
      !existingTerminal
      && !policyInvalidated
      && policyRecordGate
      && snapshot.contentHash !== null
      && !terminalRequestExpectation.policyInvalidated
    ) {
      const origin = startEntry?.policyConfigSnapshot === 'run-state-v1'
        ? 'start-v1'
        : 'terminal-v1'
      // 새 start의 private hash가 사라졌다면 현재 설정으로 재생성하지 않는다. 그것이 바로
      // 탐지해야 할 손상이다. 시작 상태가 없던 manual/legacy만 종결 시 최초 snapshot을 만든다.
      const privateSnapshot = ensureTerminationPolicySnapshotLocked(
        cwd,
        terminalRunId,
        currentTerminalRequest.ts,
        snapshot.contentHash,
        origin,
        currentRiskExpectation,
        terminalRequestExpectation,
        origin !== 'start-v1',
      )
      const pinnedRisk = privateSnapshot?.policyRiskExpected
      const pinnedTerminalRequest = privateSnapshot?.terminalRequestExpected
      if (
        privateSnapshot?.policyRecordPending === true
        && (pinnedRisk === undefined || pinnedTerminalRequest === undefined)
      ) {
        console.log(chalk.red('  ❌ 비공개 런 상태의 최초 종결 준비 정보가 불완전합니다.'))
        process.exitCode = 1
        return { cleanup: false }
      }
      if (pinnedRisk !== undefined && pinnedTerminalRequest !== undefined) {
        // terminal append 직전에 프로세스가 죽으면 공개 종결은 없고 이 pin만 남는다. 같은 SHA의
        // 재시도에서는 현재 분류 결과와 종료 입력이 아니라 최초 준비값을 권위값으로 이어 쓴다.
        // SHA 또는 종료 종류가 달라진 경우는 다른 결과일 수 있으므로 fail-closed한다.
        if (pinnedRisk.sha !== terminalSha) {
          console.log(chalk.red('  ❌ 최초 종결 시도와 현재 작업 SHA가 달라 종결 기록을 중단합니다.'))
          process.exitCode = 1
          return { cleanup: false }
        }
        if (pinnedTerminalRequest.event !== currentTerminalRequest.event) {
          console.log(chalk.red('  ❌ 최초 종결 시도와 현재 종료 종류가 달라 종결 기록을 중단합니다.'))
          process.exitCode = 1
          return { cleanup: false }
        }
        policyRiskExpectation = pinnedRisk
        terminalRequestExpectation = pinnedTerminalRequest
      }
      terminalPolicySnapshot = privateSnapshot?.policySnapshotOrigin === 'start-v1'
        ? 'run-state-v1'
        : privateSnapshot?.policySnapshotOrigin === 'terminal-v1'
          ? 'terminal-v1'
          : undefined
    } else if (
      !existingTerminal
      && (
        privateRecord !== undefined
        || (policyInvalidated && startEntry === undefined)
      )
    ) {
      const createInvalidManualRequest = privateRecord === undefined
        && policyInvalidated
        && startEntry === undefined
      const prepared = ensureTerminalRequestSnapshotLocked(
        cwd,
        terminalRunId,
        terminalRequestExpectation,
        createInvalidManualRequest,
      )
      const pinnedTerminalRequest = prepared?.terminalRequestExpected
      if (pinnedTerminalRequest === undefined) {
        console.log(chalk.red('  ❌ 비공개 런 상태에 최초 종료 요청을 기록하지 못했습니다.'))
        process.exitCode = 1
        return { cleanup: false }
      }
      if (pinnedTerminalRequest.event !== currentTerminalRequest.event) {
        console.log(chalk.red('  ❌ 최초 종결 시도와 현재 종료 종류가 달라 종결 기록을 중단합니다.'))
        process.exitCode = 1
        return { cleanup: false }
      }
      if (policyInvalidated && !pinnedTerminalRequest.policyInvalidated) {
        console.log(chalk.red('  ❌ 최초 종결 준비 뒤 정책 상태가 무효화되어 종결 기록을 중단합니다.'))
        process.exitCode = 1
        return { cleanup: false }
      }
      terminalRequestExpectation = pinnedTerminalRequest
    }
    // start-less invalidation은 이 request pin이 "새 정책으로 승인된 legacy terminal"이 아니라는
    // 유일한 증거다. terminal append 재시도에 성공했더라도 지우면 이후 baseline 복구 뒤 같은
    // blocked 라인을 legacy 후보로 재해석할 수 있으므로 영구 보존한다.
    const retainInvalidStartlessRequest =
      startEntry === undefined && terminalRequestExpectation.policyInvalidated
    const shouldCleanupPrivate =
      !retainInvalidStartlessRequest
      && (privateRecord !== undefined || terminalPolicySnapshot !== undefined)
    const expectedTerminal = effectiveTerminal(terminalRequestExpectation)
    const terminalEvent: AutonomyEvent = expectedTerminal.event
    if (baseline.configPresent && baseline.baselineMissing) {
      console.log(chalk.yellow(`  ⚠ ${ko.policy.baselineMissing}`))
    }

    // 재시도는 같은 runId의 첫 terminal을 권위값으로 쓴다. 다른 종결 이벤트로 바꾸거나
    // 현재 HEAD로 범위를 다시 계산하면 append 실패 재시도가 과거 결과를 재작성하게 된다.
    if (existingTerminal && existingTerminal.event !== terminalEvent) {
      console.log(chalk.red(`  ❌ 이미 ${existingTerminal.event}로 종결된 runId는 ${terminalEvent}로 바꿀 수 없습니다.`))
      process.exitCode = 1
      return { cleanup: false }
    }
    // failureKind 는 종결 실패(hardstop/blocked)에서만 의미가 있다. complete 에 붙어 오면 버린다
    // — 성공 런을 인프라 예외로 분류해 분모에서 빼는 경로를 만들지 않기 위해서다.
    const failureKind = expectedTerminal.failureKind

    if (!existingTerminal) {
      appendAutonomyEntry(cwd, {
        ts: terminalRequestExpectation.ts,
        runId: terminalRunId,
        goal: terminalRequestExpectation.goal,
        event: terminalEvent,
        ticks: terminalRequestExpectation.ticks,
        interventions: terminalRequestExpectation.interventions,
        reviewRejected: expectedTerminal.reviewRejected,
        schemaVersion: AUTONOMY_SCHEMA_VERSION,
        sha: terminalSha,
        taskKind: policyRiskExpectation.taskKind,
        failureKind,
        ...(!terminalRequestExpectation.policyInvalidated
          && !policyInvalidated
          && policyRecordGate
          && terminalPolicySnapshot !== undefined
          ? {
              policyRecordExpected: true,
              policyRecordSnapshot: terminalPolicySnapshot,
            }
          : {}),
      })
      console.log(chalk.green(`  ✅ 런 종결 기록 — event: ${terminalEvent}, runId: ${terminalRunId}`))
    } else {
      console.log(chalk.dim(`  런 종결 기록 재사용 — event: ${terminalEvent}, runId: ${terminalRunId}`))
    }
    const terminalTaskKind = existingTerminal?.taskKind ?? policyRiskExpectation.taskKind
    console.log(chalk.dim(`  작업 유형(경로 유도): ${terminalTaskKind}${terminalTaskKind === 'unknown' ? ' — 범위 미확인' : ''}`))
    if (terminalEvent === 'complete') {
      console.log(
        chalk.dim('  완주 인정 여부는 이 기록이 아니라 같은 SHA 의 receipt 기계 판정이 정합니다 → vhk stats'),
      )
    }

    if (terminalRequestExpectation.policyInvalidated || policyInvalidated) {
      if (configInvalidated) {
        console.log(chalk.red(`  ❌ ${ko.policy.configFailClosed(snapshot.config.reasonCode ?? 'UNKNOWN')}`))
      }
      console.log(chalk.red(`  ❌ ${runInvalidation === 'RUN_START_MISSING' ? ko.policy.runStartMissing : ko.policy.baselineInvalidated}`))
      process.exitCode = 1
      return { cleanup: shouldCleanupPrivate }
    }

    // 124-T3·T4 (RFC 0066 §4.3 · ADR-019): 판정 원장은 **종결 기록 직후에만** 쓴다. 기록 게이트
    // (record | enforce)가 꺼져 있으면 이 호출은 파일을 열지도 쓰지도 않아 위 결과와 stdout 이
    // 종전과 같다. 켜져 있어도 집행은 없다 — 판정이 무엇이든 위의 종결 기록은 이미 남았고 바뀌지 않는다.
    try {
      const pinnedTotal =
        policyRiskExpectation.derivedFrom === 'none'
        || policyRiskExpectation.reasonCode === 'RISK_SCOPE_UNKNOWN'
          ? 0
          : Math.max(1, policyRiskExpectation.unclassifiedPaths)
      const rec = recordRunTermination(cwd, {
        runId: terminalRunId,
        sha: policyRiskExpectation.sha,
        breakdown: {
          kind: policyRiskExpectation.taskKind,
          total: pinnedTotal,
          unclassified: policyRiskExpectation.unclassifiedPaths,
        },
        derivedFrom: policyRiskExpectation.derivedFrom,
        nowIso: new Date().toISOString(),
      }, snapshot.config, policyRiskExpectation)
      printPolicyRecord(rec)
    } catch (err) {
      // 원장 append 실패를 삼키면 "기록했다" 는 거짓 성공이 된다. 재시도가 같은 시작 해시를
      // 검증하고 누락 기록을 보충할 수 있도록 private run-state는 성공 전까지 보존한다.
      console.log(chalk.red(`  ❌ 권한 판정 원장 기록 실패(${fsErrorCode(err)}) — 런 상태를 보존해 재시도할 수 있습니다.`))
      process.exitCode = 1
      return { cleanup: false }
    }
    preserveExistingTerminalExitCode()
    return { cleanup: shouldCleanupPrivate }
  }

  let result: { cleanup: boolean }
  try {
    // 설정이 없는 런도 read→append를 직렬화한다. 그렇지 않으면 두 프로세스가 같은 runId의
    // terminal 부재를 동시에 보고 중복 종결 라인을 남길 수 있다.
    result = withRunStateLock(cwd, synchronizeTermination, {
      ensureIgnored: false,
    })
  } catch (error) {
    const hint = fsErrorCode(error) === 'RUN_STATE_LOCK_TIMEOUT' && error instanceof Error
      ? ` ${error.message}`
      : ''
    console.log(chalk.red(`  ❌ 런 종결 동기화 실패(${fsErrorCode(error)}) — 런 상태를 보존해 재시도할 수 있습니다.${hint}`))
    process.exitCode = 1
    return
  }

  // 종결 원장과 선택적 정책 판정이 모두 내구화된 뒤, 잠금을 놓은 다음 private 시작 해시를 버린다.
  if (result.cleanup) {
    const cleanup = cleanupRunState(cwd, terminalRunId)
    if (cleanup !== null) {
      console.log(chalk.red(`  ❌ 정책 런 상태 정리 실패(${cleanup.code}) — 종결·판정 기록은 남았습니다.${cleanup.hint}`))
      process.exitCode = 1
    }
  }
}

export interface ResumeOptions {
  confirm?: boolean
}

export async function resume(opts: ResumeOptions = {}): Promise<void> {
  console.log(chalk.bold(`\n${ko.agent.resumeTitle}\n`))
  if (!isHardStopActive()) {
    console.log(chalk.dim('  HARD_STOP 활성 아님 — 할 일 없음.'))
    return
  }
  const reason = readHardStopReason()
  if (reason) {
    console.log(chalk.yellow('  📋 HARD_STOP 사유:'))
    console.log(chalk.dim(`     ${reason.split('\n').join('\n     ')}`))
    console.log('')
  }
  if (!opts.confirm) {
    // 자동 호출 금지 (Forbidden). 사람이 의도적으로 --confirm 붙여야 해제.
    console.log(
      chalk.red(
        '  ❌ --confirm 플래그 없이는 해제할 수 없습니다 (자동 호출 금지).'
      )
    )
    console.log(chalk.yellow('     사유를 확인한 후 다시: vhk resume --confirm'))
    process.exitCode = 1
    return
  }
  const removed = clearHardStop()
  if (removed) {
    console.log(chalk.green('  ✅ HARD_STOP 해제. 자동화 재개 가능.'))
  } else {
    console.log(chalk.dim('  파일이 이미 없음 — no-op.'))
  }
}
