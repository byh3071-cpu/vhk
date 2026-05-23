import { execFileSync, execSync } from 'node:child_process'
import chalk from 'chalk'
import inquirer from 'inquirer'
import { t } from '../i18n/ko.js'

function gitOut(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
}

function gitRun(args: string[]) {
  execFileSync('git', args, { stdio: 'pipe' })
}

export function parseRecentCommits(logOutput: string): string[] {
  return logOutput.split('\n').map(l => l.trim()).filter(Boolean)
}

/** 원격에 아직 안 올라간 커밋 개수. upstream 없으면 -1 */
export function countUnpushedCommits(): number {
  try {
    const out = gitOut(['rev-list', '--count', '@{u}..HEAD']).trim()
    return parseInt(out, 10) || 0
  } catch {
    return -1
  }
}

export function willUndoPushedCommits(undoCount: number, unpushedCount: number): boolean {
  if (unpushedCount < 0) return false
  return undoCount > unpushedCount
}

export async function undo(): Promise<void> {
  console.log(chalk.bold(`\n⏪ ${t('undo.title')}`))
  console.log(chalk.gray('─'.repeat(40)))

  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'pipe' })
  } catch {
    console.log(chalk.red(`❌ ${t('undo.notGitRepo')}`))
    return
  }

  let logOutput: string
  try {
    logOutput = gitOut(['log', '--oneline', '-5']).trim()
  } catch {
    console.log(chalk.yellow(`📭 ${t('undo.noCommits')}`))
    return
  }

  const commits = parseRecentCommits(logOutput)
  if (commits.length === 0) {
    console.log(chalk.yellow(`📭 ${t('undo.noCommits')}`))
    return
  }

  console.log(chalk.cyan(`\n${t('undo.recentHeader')}`))
  commits.forEach((c, i) => {
    console.log(`   ${i === 0 ? '👉' : '  '} ${c}`)
  })

  const maxUndo = commits.length
  const { count } = await inquirer.prompt<{ count: number }>([{
    type: 'number',
    name: 'count',
    message: t('undo.howMany'),
    default: 1,
    min: 1,
    max: maxUndo,
  }])

  const undoCount = Math.min(Math.max(1, count || 1), maxUndo)
  const unpushed = countUnpushedCommits()

  if (willUndoPushedCommits(undoCount, unpushed)) {
    console.log(chalk.red(`\n⚠️  ${t('undo.alreadyPushed')}`))
  }

  const { confirm } = await inquirer.prompt<{ confirm: boolean }>([{
    type: 'confirm',
    name: 'confirm',
    message: t('undo.confirmMessage', undoCount),
    default: false,
  }])

  if (!confirm) {
    console.log(chalk.gray(t('undo.cancelled')))
    return
  }

  try {
    gitRun(['reset', '--soft', `HEAD~${undoCount}`])
    console.log(chalk.green(`\n✅ ${t('undo.success', undoCount)}`))
    console.log(chalk.gray(`   💡 ${t('undo.stagedHint')}`))
  } catch (err) {
    console.log(chalk.red(`❌ ${t('undo.failed')}`))
    const msg = err instanceof Error ? err.message : String(err)
    console.log(chalk.red(msg))
    process.exitCode = 1
  }
}
