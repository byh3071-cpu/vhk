import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { sanitizeBranchToDir } from './add.js'

export type WorktreeMutation = 'dry-run' | 'need-yes' | 'mutate'

export function resolveWorktreeTarget(input: {
  repoRoot: string
  branch: string
  pathOpt?: string
  worktreeRoot?: string | null
}): string {
  const repoRoot = resolve(input.repoRoot)
  const pathOpt = input.pathOpt?.trim()
  if (pathOpt) {
    return isAbsolute(pathOpt) ? resolve(pathOpt) : resolve(repoRoot, pathOpt)
  }
  const worktreeRoot = input.worktreeRoot?.trim()
  if (worktreeRoot) {
    const base = isAbsolute(worktreeRoot) ? resolve(worktreeRoot) : resolve(repoRoot, worktreeRoot)
    return join(base, sanitizeBranchToDir(basename(repoRoot), input.branch))
  }
  return join(dirname(repoRoot), sanitizeBranchToDir(basename(repoRoot), input.branch))
}

/** 가드 confirm 축과 같게 stdin TTY 만 본다. VHK_FORCE_INTERACTIVE 는 승인을 대신하지 못한다. */
export function decideWorktreeMutation(opts: {
  dryRun?: boolean
  yes?: boolean
  stdinTty: boolean
}): WorktreeMutation {
  if (opts.dryRun) return 'dry-run'
  if (opts.yes) return 'mutate'
  if (opts.stdinTty) return 'mutate'
  return 'need-yes'
}

export function copyPreviewNames(names: string[]): string {
  return names.length === 0 ? '(none)' : names.join(', ')
}
