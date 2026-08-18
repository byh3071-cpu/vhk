import { defineConfig } from 'vitest/config'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/*
 * TS-005: Windows + Node v24 의 fs.rmSync 는 경로에 비ASCII 가 있으면 프로세스를 죽이거나(상위 경로)
 * 조용히 삭제를 건너뛴다(이름). 사용자명이 한글이면 os.tmpdir() 이 통째로 여기 해당해서 임시 디렉터리를
 * 쓰는 테스트가 로컬에서만 무더기로 깨진다 — "로컬만 빨강, CI 는 초록" 오진의 원인이었다(TS-004).
 *
 * 제품 코드는 삭제 헬퍼로 우회했지만 테스트에는 rmSync 가 아직 많이 남아 있다. 전부 치환하는 대신
 * 임시 경로 자체를 ASCII 로 고정한다 — 원인(경로)을 없애는 쪽이 호출부 553곳을 쫓는 것보다 확실하다.
 * 이미 ASCII 인 환경(CI·리눅스)에서는 아무것도 바꾸지 않는다.
 */
function asciiTempEnv(): Record<string, string> {
  if (!/[^ -~]/.test(os.tmpdir())) return {}
  const fallback = path.join(path.parse(process.cwd()).root, 'vhk-test-tmp')
  fs.mkdirSync(fallback, { recursive: true })
  return { TEMP: fallback, TMP: fallback, TMPDIR: fallback }
}

// vitest 기본 exclude 에 .claude/** 추가.
// EnterWorktree 가 .claude/worktrees/<name>/ 에 동일 레포 복사본을 만들면서
// 해당 트리의 tests/ 가 부모 워크트리에서 호출한 vitest 에 중복 수집될 위험 차단.
// node_modules / dist 는 vitest 기본 exclude 이지만 명시.
export default defineConfig({
  test: {
    // 워커 프로세스의 os.tmpdir() 이 참조하는 환경변수 — 메인이 아니라 워커에서 테스트가 돈다.
    env: asciiTempEnv(),
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
