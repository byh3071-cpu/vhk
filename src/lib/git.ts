import path from 'node:path'
import simpleGit, { type SimpleGit } from 'simple-git'
import { filterTrackedPaths } from './check-secure.js'

const git: SimpleGit = simpleGit()

/** 터미널/OOM 등으로 생긴 쓰레기 untracked 파일 제외 */
export function isNoiseRecapPath(filePath: string): boolean {
  const base = path.basename(filePath)
  if (base.includes('${') || base.includes('`')) return true
  if (/^\d+(\.\d+)?$/.test(base)) return true
  if (/^(pnpm|vhk|npm|node|yarn)$/i.test(base)) return true
  if (!filePath.includes('/') && !filePath.includes('\\') && !base.includes('.')) {
    if (!/^(README|LICENSE|Makefile|Dockerfile|CHANGELOG)$/i.test(base)) return true
  }
  return false
}

export function filterRecapFiles(files: SessionDiff['files']): SessionDiff['files'] {
  const paths = files.map(f => f.file)
  const tracked = new Set(filterTrackedPaths(paths))
  return files.filter(f => tracked.has(f.file) && !isNoiseRecapPath(f.file))
}

export interface SessionDiff {
  filesChanged: number
  insertions: number
  deletions: number
  files: Array<{
    file: string
    insertions: number
    deletions: number
    status: 'new' | 'modified' | 'deleted' | 'renamed'
  }>
}

export interface RecentCommit {
  hash: string
  message: string
  date: string
  author: string
}

function fileStatus(workingDir: string): SessionDiff['files'][number]['status'] {
  if (workingDir === '?') return 'new'
  if (workingDir === 'D') return 'deleted'
  if (workingDir === 'R') return 'renamed'
  return 'modified'
}

/**
 * 마지막 세션 로그 이후의 diff를 가져온다.
 * --since 옵션이 없으면 오늘 커밋만 분석.
 */
export async function getSessionDiff(since?: string): Promise<SessionDiff> {
  const sinceDate = since || new Date().toISOString().split('T')[0]

  const diffSummary = await git.diffSummary([`--since=${sinceDate}`])
  const statusResult = await git.status()

  const statByFile = new Map(
    diffSummary.files.map(f => [f.file, f])
  )

  const files = filterRecapFiles(
    statusResult.files.map(f => {
      const stat = statByFile.get(f.path)
      return {
        file: f.path,
        insertions: stat?.insertions ?? 0,
        deletions: stat?.deletions ?? 0,
        status: fileStatus(f.working_dir),
      }
    })
  )

  return {
    filesChanged: files.length,
    insertions: diffSummary.insertions,
    deletions: diffSummary.deletions,
    files,
  }
}

/**
 * 최근 커밋 N개를 가져온다.
 */
export async function getRecentCommits(
  count: number = 10,
  since?: string
): Promise<RecentCommit[]> {
  const options: Record<string, unknown> = { maxCount: count }
  if (since) options['--since'] = since

  const log = await git.log(options)

  return log.all.map(entry => ({
    hash: entry.hash,
    message: entry.message,
    date: entry.date,
    author: entry.author_name,
  }))
}

/**
 * Git 레포인지 확인
 */
export async function isGitRepo(): Promise<boolean> {
  try {
    await git.revparse(['--is-inside-work-tree'])
    return true
  } catch {
    return false
  }
}
