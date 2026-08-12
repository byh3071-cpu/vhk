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
} from '../lib/autonomy-log.js'
import { changedPathsBetween, deriveTaskKind, type TaskKind } from '../lib/task-kind.js'
import { getCommitInfo } from '../lib/git-repo.js'
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

/**
 * Goal 110-T3: 이 런이 건드린 작업 유형을 경로에서 유도한다.
 * 같은 runId 의 start 라인이 남긴 sha 가 시작점 — 그 라인이 없거나(구스키마) sha 가 없으면
 * 범위를 알 수 없으므로 'unknown'. 안전한 유형으로 낙관 추정하지 않는다.
 */
function deriveRunTaskKind(cwd: string, runId: string, headSha: string | null): TaskKind {
  if (!headSha) return 'unknown'
  const start = readAutonomyLog(cwd).find((e) => e.runId === runId && e.event === 'start')
  const fromSha = start?.sha
  if (!fromSha) return 'unknown'
  return deriveTaskKind(changedPathsBetween(cwd, fromSha, headSha))
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
    const runId = newAutonomyRunId()
    appendAutonomyEntry(cwd, {
      ts: new Date().toISOString(),
      runId,
      goal: goalId,
      event: 'start',
      schemaVersion: AUTONOMY_SCHEMA_VERSION,
      sha: headSha,
    })
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
  const taskKind = deriveRunTaskKind(cwd, opts.runId, headSha)
  // failureKind 는 종결 실패(hardstop/blocked)에서만 의미가 있다. complete 에 붙어 오면 버린다
  // — 성공 런을 인프라 예외로 분류해 분모에서 빼는 경로를 만들지 않기 위해서다.
  const failureKind =
    opts.event === 'complete' ? undefined : normalizeFailureKind(opts.failureKind)
  appendAutonomyEntry(cwd, {
    ts: new Date().toISOString(),
    runId: opts.runId,
    goal: goalId,
    event: opts.event,
    ticks: opts.ticks,
    interventions: opts.interventions,
    reviewRejected: opts.event === 'hardstop' ? opts.reviewRejected : undefined,
    schemaVersion: AUTONOMY_SCHEMA_VERSION,
    sha: headSha,
    taskKind,
    failureKind,
  })
  console.log(chalk.green(`  ✅ 런 종결 기록 — event: ${opts.event}, runId: ${opts.runId}`))
  console.log(chalk.dim(`  작업 유형(경로 유도): ${taskKind}${taskKind === 'unknown' ? ' — 범위 미확인' : ''}`))
  if (opts.event === 'complete') {
    console.log(
      chalk.dim('  완주 인정 여부는 이 기록이 아니라 같은 SHA 의 receipt 기계 판정이 정합니다 → vhk stats'),
    )
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
