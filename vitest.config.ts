import { defineConfig } from 'vitest/config'

// vitest 기본 exclude 에 .claude/** 추가.
// EnterWorktree 가 .claude/worktrees/<name>/ 에 동일 레포 복사본을 만들면서
// 해당 트리의 tests/ 가 부모 워크트리에서 호출한 vitest 에 중복 수집될 위험 차단.
// node_modules / dist 는 vitest 기본 exclude 이지만 명시.
export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.claude/**',
    ],
  },
})
