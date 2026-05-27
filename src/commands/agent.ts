import chalk from 'chalk'
import { ko } from '../i18n/ko.js'
import { listGoals } from '../lib/goal-frontmatter.js'
import {
  appendBlocker,
  appendLearning,
  clearHardStop,
  isHardStopActive,
  readHardStopReason,
} from '../lib/state-files.js'
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
  const goalId = activeGoalId()
  appendLearning(lesson, goalId)
  console.log(chalk.green('  ✅ learnings.md append.'))
  console.log(
    chalk.dim('  결정사항(decision)은 `vhk memory add` 로 별도 기록 — SoT 분리.')
  )
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
