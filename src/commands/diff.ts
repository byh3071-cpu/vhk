import { execFileSync, execSync } from 'node:child_process'
import chalk from 'chalk'
import { t } from '../i18n/ko.js'

function gitOut(args: string[]): string {
  try {
    return execFileSync('git', args, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch {
    return ''
  }
}

export interface DiffFile {
  name: string
  additions: number
  deletions: number
}

export function parseDiffStat(stat: string): DiffFile[] {
  const files: DiffFile[] = []
  const lines = stat.split('\n')

  for (const line of lines) {
    const match = line.match(/^\s*(.+?)\s*\|\s*(\d+)/)
    if (!match) continue

    const name = match[1].trim()
    if (name.includes('changed') || name.includes('file')) continue

    const plusMatch = line.match(/(\++)/)
    const minusMatch = line.match(/(\-+)/)
    files.push({
      name,
      additions: plusMatch ? plusMatch[1].length : 0,
      deletions: minusMatch ? minusMatch[1].length : 0,
    })
  }

  return files
}

export function summarizeNumstat(numstat: string): {
  fileCount: number
  totalAdd: number
  totalDel: number
} {
  let totalAdd = 0
  let totalDel = 0
  let fileCount = 0

  for (const line of numstat.split('\n').filter(Boolean)) {
    const [add, del] = line.split('\t')
    if (add === undefined || del === undefined) continue
    totalAdd += parseInt(add, 10) || 0
    totalDel += parseInt(del, 10) || 0
    fileCount++
  }

  return { fileCount, totalAdd, totalDel }
}

function printFile(f: DiffFile) {
  const adds = f.additions > 0 ? chalk.green(`+${f.additions}`) : ''
  const dels = f.deletions > 0 ? chalk.red(`-${f.deletions}`) : ''
  const change = [adds, dels].filter(Boolean).join(' ')
  console.log(`   ${f.name} ${change}`)
}

export async function diff(): Promise<void> {
  console.log(chalk.bold(`\n🔍 ${t('diff.title')}`))
  console.log(chalk.gray('─'.repeat(40)))

  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'pipe' })
  } catch {
    console.log(chalk.red(`❌ ${t('diff.notGitRepo')}`))
    return
  }

  const unstaged = gitOut(['diff', '--stat'])
  const staged = gitOut(['diff', '--cached', '--stat'])
  const untracked = gitOut(['ls-files', '--others', '--exclude-standard'])

  if (!unstaged && !staged && !untracked) {
    console.log(chalk.green(`\n✅ ${t('diff.noChanges')}`))
    return
  }

  if (staged) {
    console.log(chalk.cyan(`\n${t('diff.stagedHeader')}`))
    parseDiffStat(staged).forEach(f => printFile(f))
  }

  if (unstaged) {
    console.log(chalk.cyan(`\n${t('diff.unstagedHeader')}`))
    parseDiffStat(unstaged).forEach(f => printFile(f))
  }

  if (untracked) {
    const files = untracked.split('\n').filter(Boolean)
    console.log(chalk.cyan(`\n${t('diff.untrackedHeader', files.length)}`))
    files.forEach(f => console.log(`   ${chalk.green('+')} ${f}`))
  }

  const numstat = gitOut(['diff', '--numstat', 'HEAD'])
  if (numstat) {
    const { fileCount, totalAdd, totalDel } = summarizeNumstat(numstat)
    console.log(chalk.cyan(`\n${t('diff.summaryHeader')}`))
    console.log(`   ${t('diff.filesLine', fileCount)}`)
    console.log(`   추가: ${chalk.green(`+${totalAdd}`)}줄`)
    console.log(`   삭제: ${chalk.red(`-${totalDel}`)}줄`)
  }

  console.log('')
}
