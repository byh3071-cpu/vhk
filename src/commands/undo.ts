import { execFileSync } from 'node:child_process'
import chalk from 'chalk'
import inquirer from 'inquirer'
import {
  countLocalCommits,
  getGitRoot,
  gitOut,
  gitRun,
  hasGitRemote,
} from '../lib/git-repo.js'
import { t } from '../i18n/ko.js'

export function parseRecentCommits(logOutput: string): string[] {
  return logOutput.split('\n').map(l => l.trim()).filter(Boolean)
}

/** 원격에 아직 안 올라간 커밋 개수. upstream 없으면 -1 */
export function countUnpushedCommits(gitRoot?: string): number {
  const cwd = gitRoot ?? process.cwd()
  try {
    const out = gitOut(['rev-list', '--count', '@{u}..HEAD'], cwd).trim()
    return parseInt(out, 10) || 0
  } catch {
    return -1
  }
}

export function willUndoPushedCommits(undoCount: number, unpushedCount: number): boolean {
  if (unpushedCount < 0) return false
  return undoCount > unpushedCount
}

/** upstream 없는데 remote가 있거나, push된 커밋을 되돌릴 때 */
export function isUndoRisky(
  undoCount: number,
  unpushedCount: number,
  hasRemote: boolean,
): boolean {
  if (willUndoPushedCommits(undoCount, unpushedCount)) return true
  if (unpushedCount < 0 && hasRemote) return true
  return false
}

export async function undo(): Promise<void> {
  console.log(chalk.bold(`\n⏪ ${t('undo.title')}`))
  console.log(chalk.gray('─'.repeat(40)))

  let gitRoot: string
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'pipe' })
    gitRoot = getGitRoot()
  } catch {
    console.log(chalk.red(`❌ ${t('undo.notGitRepo')}`))
    return
  }

  let logOutput: string
  try {
    logOutput = gitOut(['log', '--oneline', '-5'], gitRoot).trim()
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
  const headCount = countLocalCommits(gitRoot)

  if (undoCount >= headCount) {
    console.log(chalk.yellow(`\n📭 ${t('undo.rootCommit')}`))
    return
  }

  const unpushed = countUnpushedCommits(gitRoot)
  const remote = hasGitRemote(gitRoot)
  const risky = isUndoRisky(undoCount, unpushed, remote)

  if (risky) {
    if (unpushed < 0) {
      console.log(chalk.red(`\n⚠️  ${t('undo.noUpstreamWarning')}`))
    } else {
      console.log(chalk.red(`\n⚠️  ${t('undo.alreadyPushed')}`))
    }
  }

  const { confirm } = await inquirer.prompt<{ confirm: boolean }>([{
    type: 'confirm',
    name: 'confirm',
    message: risky ? t('undo.confirmRisky', undoCount) : t('undo.confirmMessage'),
    default: false,
  }])

  if (!confirm) {
    console.log(chalk.gray(t('undo.cancelled')))
    return
  }

  try {
    gitRun(['reset', '--soft', `HEAD~${undoCount}`], gitRoot)
    console.log(chalk.green(`\n✅ ${t('undo.success')}`))
    console.log(chalk.gray(`   💡 ${t('undo.stagedHint')}`))
    if (risky) {
      console.log(chalk.yellow(`\n💡 ${t('undo.forcePushHint')}`))
    }
  } catch (err) {
    console.log(chalk.red(`❌ ${t('undo.failed')}`))
    const msg = err instanceof Error ? err.message : String(err)
    console.log(chalk.red(msg))
    process.exitCode = 1
  }
}
