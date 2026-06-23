import { defineConfig } from 'vitest/config'

// vitest 기본 exclude 에 .claude/** 추가.
// EnterWorktree 가 .claude/worktrees/<name>/ 에 동일 레포 복사본을 만들면서
// 해당 트리의 tests/ 가 부모 워크트리에서 호출한 vitest 에 중복 수집될 위험 차단.
// node_modules / dist 는 vitest 기본 exclude 이지만 명시.
export default defineConfig({
  test: {
    // spawnSync 기반 e2e 테스트가 Windows CI 병렬 부하에서 5s 기본 타임아웃을 간헐 초과 → 머지 차단 flaky.
    // (실측: 30s 면 전건 green. CLI 콜드스타트+spawn 지연이지 코드 결함 아님 — 매 머지 재실행 세금 제거.)
    testTimeout: 30_000,
    hookTimeout: 30_000,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.claude/**',
    ],
    // Goal 50 / RFC 0050: coverage 측정(차단 아님 — 리포트 + vhk diff-cover 입력용).
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: ['dist/**', '.claude/**', 'tests/**', '**/*.config.*', 'src/**/*.d.ts', 'src/index.ts'],
    },
  },
})
