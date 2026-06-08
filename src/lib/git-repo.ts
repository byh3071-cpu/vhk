import { safeExecFile } from './exec.js'

// Goal 46: git 접근 단일 통로화 — 직접 execFileSync 대신 safeExecFile 경유.
// 얻는 것: timeout 백스톱 + 일관된 에러(실제 git stderr) + cwd 지원. 기존 throw 계약은 보존.

/** safeExecFile('git') 래퍼. 실패 시 실제 git stderr 로 throw(기존 execFileSync throw 계약 유지). */
function gitExec(args: string[], cwd: string, trimOutput = true): string {
  const r = safeExecFile('git', args, { cwd, trimOutput })
  if (!r.ok) throw new Error(r.stderr || r.err || `git ${args.join(' ')} 실패`)
  return r.out
}

export function getGitRoot(cwd = process.cwd()): string {
  return gitExec(['rev-parse', '--show-toplevel'], cwd)
}

// gitOut 은 raw 출력 보존(trimOutput:false) — `git status --porcelain` 선행 공백(" M file") 등
// 의미있는 공백을 깎으면 파싱이 깨진다. 호출부가 필요 시 .trim()/normalize 한다.
export function gitOut(args: string[], cwd: string): string {
  return gitExec(args, cwd, false)
}

export function gitRun(args: string[], cwd: string): void {
  gitExec(args, cwd)
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

/**
 * Goal 46: 레포 감지 단일 SoT(sync). getGitRoot 성공 = git 레포.
 * git.ts 의 async isGitRepo 가 이 함수로 위임(같은 질문 = 함수 하나).
 */
export function isGitRepo(cwd: string = process.cwd()): boolean {
  try {
    return getGitRoot(cwd).length > 0
  } catch {
    return false
  }
}

/**
 * Goal 46: 커밋 존재 단일 SoT(sync). git.ts 의 async hasAnyCommits 가 이 함수로 위임.
 */
export function hasCommits(cwd: string = process.cwd()): boolean {
  return countLocalCommits(cwd) > 0
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
