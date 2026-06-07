import { execFileSync } from 'node:child_process'

export function getGitRoot(cwd = process.cwd()): string {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf-8',
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}

export function gitOut(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    encoding: 'utf-8',
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

export function gitRun(args: string[], cwd: string): void {
  execFileSync('git', args, { stdio: 'pipe', cwd })
}

export function getExecErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'stderr' in err) {
    const stderr = (err as { stderr?: Buffer | string }).stderr
    if (Buffer.isBuffer(stderr)) return stderr.toString('utf-8').trim()
    if (typeof stderr === 'string') return stderr.trim()
  }
  return err instanceof Error ? err.message : String(err)
}

export function hasGitRemote(cwd: string): boolean {
  try {
    return gitOut(['remote'], cwd).trim().length > 0
  } catch {
    return false
  }
}

export function countLocalCommits(cwd: string): number {
  try {
    const out = gitOut(['rev-list', '--count', 'HEAD'], cwd).trim()
    return parseInt(out, 10) || 0
  } catch {
    return 0
  }
}

/** Goal 44: 증거↔커밋 바인딩용 커밋 식별자. */
export interface CommitInfo {
  /** HEAD 전체 SHA */
  sha: string
  /** 사람용 짧은 SHA(7자) */
  shortSha: string
  /** working tree 에 미커밋/untracked 변경이 있으면 true */
  dirty: boolean
}

/**
 * Goal 44: 현재 HEAD SHA + working tree dirty 여부를 기존 git-access 통로(gitOut)로 수집.
 * 새 execSync 도입 없음(Goal 46 단일통로화와 맞물림). git 레포 아님/커밋 0개 → null(추측 금지).
 */
export function getCommitInfo(cwd: string = process.cwd()): CommitInfo | null {
  try {
    const sha = gitOut(['rev-parse', 'HEAD'], cwd).trim()
    if (!sha) return null
    // --porcelain: 추적/미추적 변경이 한 줄이라도 있으면 dirty.
    const dirty = gitOut(['status', '--porcelain'], cwd).trim().length > 0
    return { sha, shortSha: sha.slice(0, 7), dirty }
  } catch {
    return null
  }
}
