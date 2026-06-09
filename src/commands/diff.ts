import chalk from 'chalk'
import { safeExecFile } from '../lib/exec.js'
// Goal 48: diff 의 git 질문(stat/ls-files/numstat)은 git-session 공유 SoT 를 쓴다(MCP 와 동일 함수).
import { okOut, unstagedStat, stagedStat, untrackedFiles, numstatHead } from '../lib/git-session.js'
import { t } from '../i18n/ko.js'

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

  if (!safeExecFile('git', ['rev-parse', '--is-inside-work-tree']).ok) {
    console.log(chalk.red(`❌ ${t('diff.notGitRepo')}`))
    return
  }

  const unstaged = okOut(unstagedStat())
  const staged = okOut(stagedStat())
  const untracked = okOut(untrackedFiles())

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

  const numstat = okOut(numstatHead())
  if (numstat) {
    const { fileCount, totalAdd, totalDel } = summarizeNumstat(numstat)
    console.log(chalk.cyan(`\n${t('diff.summaryHeader')}`))
    console.log(`   ${t('diff.filesLine', fileCount)}`)
    console.log(`   추가: ${chalk.green(`+${totalAdd}`)}줄`)
    console.log(`   삭제: ${chalk.red(`-${totalDel}`)}줄`)
  }

  console.log('')
}
