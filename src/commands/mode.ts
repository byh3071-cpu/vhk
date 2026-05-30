import chalk from 'chalk'
import { readConfig, writeConfig } from '../lib/config.js'
import { SAFETY_MODES, SAFETY_MODE_DESC, isSafetyMode } from '../lib/safety-mode.js'
import { printNextStep } from '../lib/next-step.js'

/**
 * `vhk mode [lite|standard|strict]` — Safety Mode 조회/변경.
 * 인자 없으면 현재 모드 + 세 모드 설명 출력. 인자 있으면 검증 후 .vhk/config.json 에 기록.
 */
export async function mode(target?: string): Promise<void> {
  console.log(chalk.bold('\n🛡️  Safety Mode'))
  console.log(chalk.gray('─'.repeat(40)))

  const current = readConfig().safetyMode

  if (!target) {
    console.log(chalk.cyan(`\n  현재 모드: ${chalk.bold(current)}`))
    console.log(chalk.dim(`  ${SAFETY_MODE_DESC[current]}`))
    console.log('')
    for (const m of SAFETY_MODES) {
      const mark = m === current ? '●' : '○'
      console.log(`  ${mark} ${m.padEnd(9)} ${chalk.dim(SAFETY_MODE_DESC[m])}`)
    }
    printNextStep({
      message: '모드를 바꾸려면:',
      command: 'vhk mode strict',
      cursorHint: '안전 모드 strict로 바꿔줘',
    })
    return
  }

  if (!isSafetyMode(target)) {
    console.log(chalk.red(`\n  ❌ 알 수 없는 모드: ${target}`))
    console.log(chalk.dim(`     가능: ${SAFETY_MODES.join(' | ')}`))
    process.exitCode = 1
    return
  }

  writeConfig({ ...readConfig(), safetyMode: target })
  console.log(chalk.green(`\n  ✅ Safety Mode → ${chalk.bold(target)}`))
  console.log(chalk.dim(`  ${SAFETY_MODE_DESC[target]}`))
}
