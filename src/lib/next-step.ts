import chalk from 'chalk'

export interface NextStep {
  message: string
  command?: string
  alternative?: string
  cursorHint?: string
}

export function printNextStep(step: NextStep) {
  console.log('')
  console.log(chalk.cyan.bold('━━━ 다음에 이것만 하세요 ━━━'))
  console.log('')
  console.log(`  ${step.message}`)

  if (step.command) {
    console.log('')
    console.log(chalk.white.bgGray(' 터미널에 복붙 '))
    console.log(chalk.green(`  ${step.command}`))
  }

  if (step.cursorHint) {
    console.log('')
    console.log(chalk.white.bgBlue(' Cursor에게 말하기 '))
    console.log(chalk.blue(`  "${step.cursorHint}"`))
  }

  if (step.alternative) {
    console.log('')
    console.log(chalk.dim(`  또는: ${step.alternative}`))
  }

  console.log('')
  console.log(chalk.cyan.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━'))
  console.log('')
}
