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
