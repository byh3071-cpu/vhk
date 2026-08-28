import { defineConfig } from 'vitest/config'
import os from 'node:os'
// @ts-expect-error — 게이트 스크립트는 .mjs 라 타입 선언이 없다(빌드 산출물 아님).
import { asciiTempEnv } from './scripts/ascii-temp-dir.mjs'

export default defineConfig({
  test: {
    // TS-005: 워커의 os.tmpdir() 이 참조하는 환경변수. 비ASCII 임시 경로에서만 개입하고,
    // 쓸 수 있는 대체 경로가 없으면 아무것도 바꾸지 않는다 — 여기서 던지면 vitest 가 아예 안 뜬다.
    env: asciiTempEnv(os.tmpdir(), process.cwd()),
    // spawnSync 기반 e2e 테스트가 Windows CI 병렬 부하에서 5s 기본 타임아웃을 간헐 초과 → 머지 차단 flaky.
    // (실측: 30s 면 전건 green. CLI 콜드스타트+spawn 지연이지 코드 결함 아님 — 매 머지 재실행 세금 제거.)
    testTimeout: 30_000,
    hookTimeout: 30_000,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.claude/**',
      // 릴리스 검증용 중첩 worktree를 포함한 로컬 VHK 상태는 현재 저장소의 테스트 대상이 아니다.
      '**/.vhk/**',
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
