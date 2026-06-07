import chalk from 'chalk'
import { ko } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { formatYmdWeekday, localDate } from '../lib/date.js'
import { runStandup } from '../daily/standup.js'
import { shouldShow, readDailyShown, recordDailyShown } from '../daily/shown-state.js'
import { buildAnchorLines } from '../daily/anchor.js'

export interface StandupOptions {
  ifStale?: boolean // 오늘 아직 안 봤을 때만 출력 (터미널 자동실행 앵커용)
  installAnchor?: boolean // 앵커 줄 안내만 출력 (rc 자동수정 X)
}

// vhk standup — 아침 브리핑(읽기 전용: git log + goal + dev log 읽어 출력).
// 읽기전용이라 HARD_STOP 가드 없음(가드 docstring: 읽기전용 제외 — doctor 와 동일).
// --if-stale 의 ~/.vhk/daily-shown.json 쓰기는 version-check 글로벌 캐시와 동급(상태변경 아님 → 가드 제외).
export async function standup(opts: StandupOptions = {}): Promise<void> {
  // --install-anchor: 붙여넣을 앵커 줄 + 안내만 출력. rc 파일은 절대 자동 수정하지 않는다.
  if (opts.installAnchor) {
    printAnchorHelp()
    return
  }

  // --if-stale: 오늘 아직 standup 을 안 봤을 때만 출력(KST 자정 기준). 이미 봤으면 조용히 종료.
  if (opts.ifStale) {
    const today = localDate()
    const state = readDailyShown()
    if (!shouldShow(state.standup ?? null, today)) return // fresh → 무출력
    await printStandup()
    recordDailyShown('standup', today) // 실제로 보여준 뒤에만 기록
    return
  }

  await printStandup()
}

async function printStandup(): Promise<void> {
  const r = await runStandup()
  console.log(chalk.bold(`\n${ko.standup.title(formatYmdWeekday(r.asOf))}\n`))

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

// 터미널 자동실행 앵커 안내(출력 전용). rc 파일은 사람이 직접 붙여넣는다.
function printAnchorHelp(): void {
  const lines = buildAnchorLines()
  console.log(chalk.bold('\n🔗 터미널 자동실행 앵커 — 하루 1회 아침 브리핑\n'))
  console.log('  아래 한 줄을 셸 설정 파일에 직접 붙여넣으세요.')
  console.log(chalk.dim('  (vhk 는 rc 파일을 자동 수정하지 않습니다 — 안전 원칙)\n'))
  console.log(chalk.dim('  • bash/zsh — ~/.bashrc 또는 ~/.zshrc:'))
  console.log(`    ${chalk.cyan(lines.bash)}\n`)
  console.log(chalk.dim('  • PowerShell — $PROFILE:'))
  console.log(`    ${chalk.cyan(lines.powershell)}\n`)
  console.log(chalk.dim('  적용 후 새 터미널을 열면 그날 첫 실행에만 standup 이 표시됩니다.'))
}
