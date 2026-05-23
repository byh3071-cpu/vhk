import { execFileSync, execSync } from 'node:child_process'
import chalk from 'chalk'
import ora from 'ora'
import inquirer from 'inquirer'
import { t } from '../i18n/ko.js'

function gitOut(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
}

function gitRun(args: string[]) {
  execFileSync('git', args, { stdio: 'pipe' })
}

export function formatDefaultCommitMessage(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `✨ vhk save: ${y}-${m}-${d} ${h}:${min}`
}

function statusIcon(code: string): string {
  if (code.includes('M')) return '✏️'
  if (code.includes('A') || code.includes('?')) return '➕'
  if (code.includes('D')) return '🗑️'
  return '📄'
}

export async function save(): Promise<void> {
  console.log(chalk.bold(`\n💾 ${t('save.title')}`))
  console.log(chalk.gray('─'.repeat(40)))

  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'pipe' })
  } catch {
    console.log(chalk.red(`❌ ${t('save.notGitRepo')}`))
    return
  }

  const status = gitOut(['status', '--porcelain']).trim()
  if (!status) {
    console.log(chalk.yellow(`📭 ${t('save.noChanges')}`))
    return
  }

  const files = status.split('\n').filter(Boolean)
  console.log(chalk.cyan(`\n📋 ${t('save.filesHeader', files.length)}`))
  files.forEach(line => {
    const code = line.substring(0, 2)
    const name = line.substring(3)
    console.log(`   ${statusIcon(code)} ${name}`)
  })

  const { message } = await inquirer.prompt<{ message: string }>([{
    type: 'input',
    name: 'message',
    message: t('save.commitMessage'),
    default: formatDefaultCommitMessage(),
  }])

  const spinner = ora(t('save.saving')).start()
  try {
    gitRun(['add', '.'])
    gitRun(['commit', '-m', message])
    spinner.text = t('save.pushing')

    try {
      gitRun(['push'])
      spinner.succeed(t('save.successWithPush'))
    } catch {
      spinner.succeed(t('save.successLocal'))
      console.log(chalk.yellow(`   💡 ${t('save.noRemote')}`))
    }

    console.log(chalk.green(`\n✅ ${t('save.done', files.length)}`))
  } catch (err) {
    spinner.fail(t('save.failed'))
    const msg = err instanceof Error ? err.message : String(err)
    console.log(chalk.red(msg))
    process.exitCode = 1
  }
}
