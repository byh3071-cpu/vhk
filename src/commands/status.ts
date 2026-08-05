import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'
import { normalizePorcelain } from '../lib/git-porcelain.js'
import { getGitRoot, gitOut } from '../lib/git-repo.js'
// Goal 48: branch/status/log 의 git 질문은 git-session 공유 SoT(MCP 와 동일 함수). sync(rev-list)는 status 전용이라 gitOut 유지.
import { okOut, currentBranch, statusPorcelain, recentCommits } from '../lib/git-session.js'
import { readJsonFile } from '../lib/read-json.js'
import { printNextStep, printContextResumeHint } from '../lib/next-step.js'
import { t } from '../i18n/ko.js'
import { projectMaturity } from '../lib/project-maturity.js'
import { listGoals } from '../lib/goal-frontmatter.js'

export interface UnstartedGoalSummary {
  count: number
  oldestDays: number
  oldestGoal?: {
    id: number
    title: string
  }
}

type GoalAgeInput = {
  frontmatter: {
    id?: string | number
    title?: string | number
    status?: string | number
    created?: string | number
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

function localDayNumber(value: string | number | Date): number | null {
  if (typeof value === 'string') {
    const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (dateOnly) {
      const year = Number(dateOnly[1])
      const month = Number(dateOnly[2]) - 1
      const day = Number(dateOnly[3])
      const local = new Date(year, month, day)
      if (local.getFullYear() !== year || local.getMonth() !== month || local.getDate() !== day) return null
      return Date.UTC(year, month, day)
    }
  }
  const parsed = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(parsed.getTime())) return null
  return Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
}

// 아직 시작하지 않은 goal의 수와 등록 후 경과일. 날짜가 없는 카드도 개수에는 포함한다.
export function summarizeUnstartedGoals(
  goals: GoalAgeInput[],
  now: Date = new Date(),
): UnstartedGoalSummary {
  const unstarted = goals.filter((goal) => {
    const status = goal.frontmatter.status
    return status === undefined || status === 'NOT_STARTED'
  })
  const nowDay = localDayNumber(now)
  const datedGoals = unstarted.flatMap((goal) => {
    const rawCreated = goal.frontmatter.created
    if (rawCreated === undefined) return []
    const createdDay = localDayNumber(rawCreated)
    return createdDay !== null && nowDay !== null
      ? [{ goal, days: Math.max(0, Math.floor((nowDay - createdDay) / DAY_MS)) }]
      : []
  })
  const oldest = datedGoals.reduce<(typeof datedGoals)[number] | undefined>(
    (current, candidate) => current === undefined || candidate.days > current.days ? candidate : current,
    undefined,
  )
  const id = oldest?.goal.frontmatter.id
  const title = oldest?.goal.frontmatter.title
  const oldestGoal = typeof id === 'number' && typeof title === 'string' && title.trim().length > 0
    ? { id, title: title.trim() }
    : undefined
  return {
    count: unstarted.length,
    oldestDays: oldest?.days ?? 0,
    oldestGoal,
  }
}

export function formatUnstartedGoalLines(summary: UnstartedGoalSummary): string[] {
  const lines = [t('status.unstarted', summary.count)]
  if (summary.oldestGoal !== undefined) {
    lines.push(t(
      'status.oldestUnstarted',
      summary.oldestGoal.id,
      summary.oldestGoal.title,
      summary.oldestDays,
    ))
  }
  return lines
}

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
    const pkg = readJsonFile<{
      name?: string
      version?: string
    }>(pkgPath)
    if (!pkg.name && !pkg.version) return null
    return {
      name: pkg.name ?? '(no name)',
      version: pkg.version ?? '(no version)',
    }
  } catch {
    return null
  }
}

export interface StatusNextStep {
  message: string
  command: string
  cursorHint: string
  alternative?: string
}

/**
 * status 다음 액션 — 변경사항이 있어도 곧장 `vhk save` 를 권하지 않는다(데이터 안전).
 * 먼저 `vhk diff`("뭐 바뀌었어")로 확인 → 저장은 그 다음(alternative)으로 안내. (배치3 §2)
 */
export function selectStatusNextStep(
  hasChanges: boolean,
  maturity: 'new' | 'established' = 'established'
): StatusNextStep {
  if (hasChanges) {
    return {
      message: t('status.nextWithChangesMessage'),
      command: 'vhk diff',
      cursorHint: t('status.nextWithChangesCursor'),
      alternative: t('status.nextWithChangesAlt'),
    }
  }
  // Goal 84: 신규(초기) 레포는 온보딩, 기존(활성) 레포는 다음 미션(vhk goal next) — 맥락 분기.
  if (maturity === 'new') {
    return {
      message: t('status.nextNewRepoMessage'),
      command: 'vhk 시작',
      cursorHint: t('status.nextNewRepoCursor'),
    }
  }
  return {
    message: t('status.nextCleanMessage'),
    command: 'vhk goal next',
    cursorHint: t('status.nextCleanCursor'),
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

  const branchRes = currentBranch(gitRoot)
  const branch = branchRes.ok
    ? branchRes.out.trim() || t('status.detached')
    : t('status.unknownBranch')

  const porcelain = normalizePorcelain(okOut(statusPorcelain(gitRoot)))
  const counts = countFileChanges(porcelain)
  const sync = getSyncCounts(gitRoot)

  const logRes = recentCommits(3, gitRoot)
  const commits = logRes.ok ? parseRecentCommitLines(logRes.out.trim()) : []

  const pkg = readProjectPackage()

  console.log(chalk.cyan(`\n🌿 ${t('status.branch')}`) + chalk.white(` ${branch}`))
  console.log(
    chalk.cyan(`📁 ${t('status.changes')}`) +
      chalk.white(
        ` staged ${counts.staged} · unstaged ${counts.unstaged} · untracked ${counts.untracked}`,
      ),
  )

  // VHK-013: 헤더 숫자를 하드코딩(3)이 아닌 실제 나열 개수로 — 표시/실제 불일치 제거.
  console.log(chalk.cyan(`\n📋 ${t('status.recentCommits', commits.length)}`))
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

  const goalsDir = path.join(process.cwd(), 'goals')
  if (fs.existsSync(goalsDir)) {
    const unstarted = summarizeUnstartedGoals(listGoals(goalsDir))
    const lines = formatUnstartedGoalLines(unstarted)
    console.log(chalk.yellow(`🕰️ ${lines[0]}`))
    for (const line of lines.slice(1)) console.log(chalk.yellow(`   ${line}`))
  }

  const hasChanges = counts.staged + counts.unstaged + counts.untracked > 0
  // Goal 84: maturity 앵커는 cwd — .vhk/context.md 가 cwd 기준으로 쓰이므로(doctor 와 동일 앵커로 통일,
  //          gitRoot 사용 시 서브디렉터리에서 doctor 와 분류 불일치). commitCount 는 git 이 루트 해석.
  printNextStep(selectStatusNextStep(hasChanges, projectMaturity(process.cwd())))
  // Goal 10: 세션 진입 명령에서 `vhk context` 발견성 노출 (복원/생성/갱신 안내).
  // context 는 cwd 기준 .vhk/context.md 에 쓰므로 cwd(인자 생략)로 점검 — gitRoot 와 앵커 불일치 방지.
  printContextResumeHint()
}
