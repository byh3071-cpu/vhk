import chalk from 'chalk'
import { ko } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { formatYmdWeekday } from '../lib/date.js'
import { runToday, MESSAGES, pickMessage } from '../daily/today.js'

// vhk today — 저녁 자축/회고(읽기 전용: 오늘 git 커밋 + 완료 goal 카운트 + 격려).
// 읽기전용이라 HARD_STOP 가드 없음(가드 docstring: 읽기전용 제외 — standup/doctor 와 동일).
export async function today(): Promise<void> {
  const r = await runToday()
  console.log(chalk.bold(`\n${ko.today.title(formatYmdWeekday(r.date))}\n`))

  const nothing = r.commitCount === 0 && r.doneGoalCount === 0 && r.devlogCount === 0

  console.log(chalk.bold(`  ${ko.today.done}`))
  if (nothing) {
    console.log(chalk.dim(`    ${ko.today.restDay}`))
  } else {
    console.log(`    • ${ko.today.commits(r.commitCount)}`)
    if (r.doneGoalCount > 0) {
      console.log(`    • ${ko.today.doneGoals(r.doneGoalCount)}`)
      for (const g of r.doneGoals) console.log(chalk.dim(`        ✅ Goal ${g.id} (${g.slug})`))
    }
    if (r.devlogCount > 0) console.log(`    • ${ko.today.devlogs(r.devlogCount, r.lessons.length)}`)
  }

  // 담백한 격려 — 한 일 없으면 rest 메시지, 있으면 풀에서 랜덤.
  console.log('')
  const msg = nothing
    ? ko.today.restEncourage
    : pickMessage(MESSAGES, Math.floor(Math.random() * MESSAGES.length))
  console.log(chalk.cyan(`  💬 "${msg}"`))

  printNextStep({
    message: '하루 마무리 — 기록 남기기:',
    command: 'vhk recap',
    cursorHint: '오늘 정리해줘',
  })
}
