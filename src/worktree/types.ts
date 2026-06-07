// Goal 30 — vhk worktree 가드 타입.

export interface WorktreeOptions {
  install?: boolean // --install: worktree 생성 후 pnpm install 실행
}

export type CopyKind = 'env' | 'config'

export interface CopyItem {
  source: string
  target: string
  kind: CopyKind
}

export type CopyStatus = 'copied' | 'missing-source' | 'error'

export interface CopyResult {
  item: CopyItem
  status: CopyStatus
  keyCount?: number // env 파일일 때 키 개수(값은 절대 노출 안 함)
  detail: string
}
