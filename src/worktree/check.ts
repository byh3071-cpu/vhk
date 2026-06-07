import { checkWorktreeEnvDir } from '../lib/worktree-env.js'
import type { EnvCheckResult } from '../lib/worktree-env.js'

// 현재 worktree 의 필수 env 키 누락 점검(개수만).
// Goal 29 의 worktree-env 모듈을 그대로 재사용한다(이중 구현 금지).
export function runWorktreeCheck(cwd: string): EnvCheckResult {
  return checkWorktreeEnvDir(cwd)
}
