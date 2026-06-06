import type { Runner } from '../lib/preflight.js'
import type { CopyItem, CopyResult, WorktreeOptions } from './types.js'

// git worktree add 오케스트레이션 의존성(주입).
export interface AddDeps {
  sourceDir: string
  run: Runner // safeExecFile 래퍼
  exists: (p: string) => boolean
  resolveTargetPath: (branch: string) => string
  collectItems: (sourceDir: string, targetDir: string) => CopyItem[]
  copyAll: (items: CopyItem[]) => CopyResult[]
}

export type AddStatus = 'created' | 'aborted-exists' | 'git-failed'

export interface AddResult {
  status: AddStatus
  targetPath: string
  copies: CopyResult[]
  installed?: boolean
  detail: string
}

// 브랜치명 → worktree 디렉터리명. 슬래시/특수문자를 '-' 로(양끝 '-' 제거).
export function sanitizeBranchToDir(repoName: string, branch: string): string {
  const safe = branch.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return `${repoName}-${safe}`
}

// worktree 생성 + 필수 env/설정 복사(+ 선택 install).
// 대상 경로가 이미 있으면 절대 덮어쓰지 않고 안전 중단. git 실패 시 복사 안 함.
export function addWorktree(branch: string, opts: WorktreeOptions, deps: AddDeps): AddResult {
  const targetPath = deps.resolveTargetPath(branch)

  if (deps.exists(targetPath)) {
    return { status: 'aborted-exists', targetPath, copies: [], detail: `이미 존재 — 중단(덮어쓰기 안 함): ${targetPath}` }
  }

  // 새 브랜치로 worktree 생성. git 훅은 자동 설치/수정하지 않음(설계상 hooks 미접근).
  const git = deps.run('git', ['worktree', 'add', '-b', branch, targetPath])
  if (!git.ok) {
    const err = ('err' in git && git.err ? git.err : '').slice(0, 200)
    return { status: 'git-failed', targetPath, copies: [], detail: `git worktree add 실패: ${err}`.trim() }
  }

  const items = deps.collectItems(deps.sourceDir, targetPath)
  const copies = deps.copyAll(items)

  let installed: boolean | undefined
  if (opts.install) {
    // cwd 변경 없이 대상 디렉터리에서 설치(pnpm --dir <path> install).
    const r = deps.run('pnpm', ['--dir', targetPath, 'install'])
    installed = r.ok
  }

  return { status: 'created', targetPath, copies, installed, detail: `worktree 생성: ${targetPath}` }
}
