import chalk from 'chalk'
import { ko } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { runStandup } from '../daily/standup.js'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function withWeekday(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ymd
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return `${ymd} (${WEEKDAYS[d.getDay()]})`
}

// vhk standup — 아침 브리핑(읽기 전용: git log + goal 읽어 출력).
// 읽기전용이라 HARD_STOP 가드 없음(가드 docstring: 읽기전용 제외 — doctor 와 동일).
export async function standup(): Promise<void> {
  const r = await runStandup()
  console.log(chalk.bold(`\n${ko.standup.title(withWeekday(r.asOf))}\n`))

  // 📌 어제 한 일
  console.log(chalk.bold(`  ${ko.standup.yesterday}`))
  if (r.lastActiveDay === null) {
    console.log(chalk.dim(`    ${ko.standup.noHistory}`))
  } else {
    console.log(chalk.dim(`    (마지막 활동일: ${r.lastActiveDay})`))
    const top = r.yesterday.commits.slice(0, 5)
    for (const c of top) console.log(`    • ${c.message}`)
    if (r.yesterday.commits.length > top.length) {
      console.log(chalk.dim(`    • … 외 ${r.yesterday.commits.length - top.length}개`))
    }
    console.log(chalk.dim(`    • ${ko.standup.commitsLine(r.yesterday.commits.length)}`))
    for (const dg of r.yesterday.doneGoals) console.log(`    ✅ Goal ${dg.id} (${dg.slug}) 완료`)
    for (const dl of r.yesterday.devlogs) console.log(`    📝 ${dl.title}`)
  }

  // 🎯 오늘 추천
  console.log('')
  console.log(chalk.bold(`  ${ko.standup.todayRecommend}`))
  if (r.todayRecommend.length === 0) {
    console.log(chalk.green('    🎉 모든 goal 완료!'))
  } else {
    for (const g of r.todayRecommend) {
      const icon = g.status === 'IN_PROGRESS' ? '🟡' : '⚪'
      console.log(`    ${icon} Goal ${g.id} (${g.slug}) — ${g.status}`)
    }
  }

  // ⚠️ 미해결
  if (r.unresolved.length > 0) {
    console.log('')
    console.log(chalk.bold(`  ${ko.standup.unresolved}`))
    for (const u of r.unresolved) console.log(chalk.yellow(`    • ${u}`))
  }

  printNextStep({
    message: '오늘 작업 시작:',
    command: 'vhk work',
    cursorHint: '작업 시작할게',
  })
}
