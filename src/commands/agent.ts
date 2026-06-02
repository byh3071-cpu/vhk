import chalk from 'chalk'
import { ko } from '../i18n/ko.js'
import { listGoals } from '../lib/goal-frontmatter.js'
import {
  appendBlocker,
  clearHardStop,
  isHardStopActive,
  readHardStopReason,
} from '../lib/state-files.js'
import { recordLesson } from './memory.js'
import { selectActiveId } from './goal.js'

function activeGoalId(): number | undefined {
  const goals = listGoals('goals')
  const id = selectActiveId(goals)
  return id ?? undefined
}

export async function blocker(description: string): Promise<void> {
  console.log(chalk.bold(`\n${ko.agent.blockerTitle}\n`))
  if (!description || !description.trim()) {
    console.log(chalk.red('  ❌ 블로커 설명을 입력해 주세요.'))
    console.log(chalk.dim('  예: vhk blocker "tsc 에러 — simple-git 타입 호환"'))
    process.exitCode = 1
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
  console.log(chalk.green(`  ✅ 교훈 기록 → memory failures.lesson (${entry.id})`))
  console.log(chalk.dim('  교훈·결정·실패·성공 모두 vhk memory (단일 SoT). vhk memory list 로 확인.'))
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
