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

export function inferFileStatusFromDiff(
  insertions: number,
  deletions: number,
): SessionDiff['files'][number]['status'] {
  if (deletions > 0 && insertions === 0) return 'deleted'
  if (insertions > 0 && deletions === 0) return 'new'
  return 'modified'
}

export function buildSessionDiffFromSummary(diffSummary: {
  insertions: number
  deletions: number
  files: Array<{ file: string; insertions: number; deletions: number }>
}): SessionDiff {
  const files = filterRecapFiles(
    diffSummary.files.map(f => ({
      file: f.file,
      insertions: f.insertions,
      deletions: f.deletions,
      status: inferFileStatusFromDiff(f.insertions, f.deletions),
    })),
  )

  return {
    filesChanged: files.length,
    insertions: diffSummary.insertions,
    deletions: diffSummary.deletions,
    files,
  }
}

/**
 * --since 이후 커밋 diff만 사용 (작업 트리 status와 섞지 않음).
 * 커밋이 0개인 신규 레포에서는 빈 결과 반환 (simple-git이 throw하는 GitError 흡수).
 */
export async function getSessionDiff(since?: string): Promise<SessionDiff> {
  const sinceDate = since || new Date().toISOString().split('T')[0]
  try {
    const diffSummary = await git.diffSummary([`--since=${sinceDate}`])
    return buildSessionDiffFromSummary(diffSummary)
  } catch {
    return { filesChanged: 0, insertions: 0, deletions: 0, files: [] }
  }
}

/**
 * 최근 커밋 N개를 가져온다.
 * 신규 레포(HEAD 없음)에서는 빈 배열 반환.
 */
export async function getRecentCommits(
  count: number = 10,
  since?: string
): Promise<RecentCommit[]> {
  const options: Record<string, unknown> = { maxCount: count }
  if (since) options['--since'] = since

  try {
    const log = await git.log(options)
    return log.all.map(entry => ({
      hash: entry.hash,
      message: entry.message,
      date: entry.date,
      author: entry.author_name,
    }))
  } catch {
    return []
  }
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

/**
 * HEAD 커밋 존재 여부. `git init` 직후 커밋 0개면 false.
 */
export async function hasAnyCommits(): Promise<boolean> {
  try {
    await git.revparse(['HEAD'])
    return true
  } catch {
    return false
  }
}
