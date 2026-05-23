import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'
import { normalizePorcelain } from '../lib/git-porcelain.js'
import { getGitRoot, gitOut } from '../lib/git-repo.js'
import { t } from '../i18n/ko.js'

export interface FileChangeCounts {
  staged: number
  unstaged: number
  untracked: number
}

/** git status --porcelain 기준 staged / unstaged / untracked 개수 */
export function countFileChanges(porcelain: string): FileChangeCounts {
  const lines = porcelain.split('\n').filter(Boolean)
  let staged = 0
  let unstaged = 0
  let untracked = 0

  for (const line of lines) {
    const x = line[0]
    const y = line[1]
    if (x === '?' && y === '?') {
      untracked++
      continue
    }
    if (x !== ' ') staged++
    if (y !== ' ') unstaged++
  }

  return { staged, unstaged, untracked }
}

export interface SyncCounts {
  ahead: number
  behind: number
  hasUpstream: boolean
}

/** git rev-list --left-right --count HEAD...@{u} 출력 파싱 */
export function parseSyncCounts(revListOutput: string): SyncCounts {
  const parts = revListOutput.trim().split(/\s+/)
  return {
    ahead: parseInt(parts[0] ?? '0', 10) || 0,
    behind: parseInt(parts[1] ?? '0', 10) || 0,
    hasUpstream: true,
  }
}

export function formatSyncLabel(sync: SyncCounts): string {
  if (!sync.hasUpstream) return t('status.noUpstream')

  if (sync.ahead === 0 && sync.behind === 0) return t('status.inSync')
  const parts: string[] = []
  if (sync.ahead > 0) parts.push(t('status.ahead', sync.ahead))
  if (sync.behind > 0) parts.push(t('status.behind', sync.behind))
  return parts.join(' · ')
}

export function parseRecentCommitLines(logOutput: string): string[] {
  return logOutput.split('\n').map(l => l.trim()).filter(Boolean)
}

export interface ProjectPackage {
  name: string
  version: string
}

export function readProjectPackage(cwd = process.cwd()): ProjectPackage | null {
  const pkgPath = path.join(cwd, 'package.json')
  if (!fs.existsSync(pkgPath)) return null

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
      name?: string
      version?: string
    }
    if (!pkg.name && !pkg.version) return null
    return {
      name: pkg.name ?? '(no name)',
      version: pkg.version ?? '(no version)',
    }
  } catch {
    return null
  }
}

function getSyncCounts(gitRoot: string): SyncCounts {
  try {
    const out = gitOut(['rev-list', '--left-right', '--count', 'HEAD...@{u}'], gitRoot)
    return parseSyncCounts(out)
  } catch {
    return { ahead: 0, behind: 0, hasUpstream: false }
  }
}

export async function status(): Promise<void> {
  console.log(chalk.bold(`\n📊 ${t('status.title')}`))
  console.log(chalk.gray('─'.repeat(40)))

  let gitRoot: string
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'pipe' })
    gitRoot = getGitRoot()
  } catch {
    console.log(chalk.red(`❌ ${t('status.notGitRepo')}`))
    return
  }

  let branch: string
  try {
    branch = gitOut(['branch', '--show-current'], gitRoot).trim() || t('status.detached')
  } catch {
    branch = t('status.unknownBranch')
  }

  const porcelain = normalizePorcelain(gitOut(['status', '--porcelain'], gitRoot))
  const counts = countFileChanges(porcelain)
  const sync = getSyncCounts(gitRoot)

  let commits: string[] = []
  try {
    commits = parseRecentCommitLines(gitOut(['log', '--oneline', '-3'], gitRoot).trim())
  } catch {
    commits = []
  }

  const pkg = readProjectPackage()

  console.log(chalk.cyan(`\n🌿 ${t('status.branch')}`) + chalk.white(` ${branch}`))
  console.log(
    chalk.cyan(`📁 ${t('status.changes')}`) +
      chalk.white(
        ` staged ${counts.staged} · unstaged ${counts.unstaged} · untracked ${counts.untracked}`,
      ),
  )

  console.log(chalk.cyan(`\n📋 ${t('status.recentCommits')}`))
  if (commits.length === 0) {
    console.log(chalk.dim(`   ${t('status.noCommits')}`))
  } else {
    commits.forEach(c => console.log(`   ${chalk.dim('•')} ${c}`))
  }

  console.log(
    chalk.cyan(`\n🔄 ${t('status.remote')}`) + chalk.white(` ${formatSyncLabel(sync)}`),
  )

  console.log(chalk.gray('\n' + '─'.repeat(40)))
  if (pkg) {
    console.log(chalk.cyan(`📦 ${t('status.package')}`) + chalk.white(` ${pkg.name} v${pkg.version}`))
  } else {
    console.log(chalk.dim(`📦 ${t('status.noPackage')}`))
  }

  console.log('')
}
