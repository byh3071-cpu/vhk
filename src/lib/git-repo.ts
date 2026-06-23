import { safeExecFile } from './exec.js'
import { parsePorcelainLines } from './git-porcelain.js'
import { filterSelfTrackedLines } from './self-tracked.js'

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
    // Goal 85 (#315) 자기참조 봉인: vhk verify 가 종료 시 스스로 append 하는 자기 산출
    // 추적파일(.vhk/ledger.jsonl·.vhk/events/*.jsonl)은 dirty 판정에서 제외한다. 안 그러면
    // verify 직후 늘 dirty → freshness/receipt 가 자기 ledger 한 줄 때문에 영원히 block(자기모순).
    // ★한계(정직): 이 제외로 vhk 가 자기 ledger 를 위조해도 dirty 로 못 잡는다 → self-tracked.ts 주석 참조.
    // 그 외 모든 변경(진짜 소스 미커밋·다른 .vhk 파일)은 그대로 dirty 로 잡힌다(과확장 0).
    // --untracked-files=all: 기본 porcelain 은 미추적 디렉터리를 "?? .vhk/" 로 접어(collapse) 개별
    //   파일 경로를 안 준다. 그러면 자기파일만 골라낼 수 없고(접힌 .vhk/ 안에 config.json 등이 섞일 수 있어
    //   통째 제외하면 과확장) → -uall 로 개별 파일을 펴서 정확히 자기파일만 필터한다(testmap.ts 동일 이유).
    const lines = parsePorcelainLines(gitOut(['status', '--porcelain', '--untracked-files=all'], cwd))
    const dirty = filterSelfTrackedLines(lines).length > 0
    return { sha, shortSha: sha.slice(0, 7), dirty }
  } catch {
    return null
  }
}
