---
id: TS-006
date: 2026-08-28
category: testing
---

# TS-006 — 중첩 worktree의 테스트가 현재 저장소 검사에 섞인다

## 증상

현재 브랜치의 전체 테스트를 실행했는데 `.vhk` 아래에 보관한 릴리스 검증용 worktree의
과거 테스트도 함께 실행됐다. 두 버전의 기대값이 달라 현재 코드와 무관한 실패가 발생했다.

## 원인

Vitest는 점으로 시작하는 디렉터리도 검색한다. 기존 제외 목록에는 `node_modules`, `dist`,
`.claude`만 있었고, VHK의 로컬 상태 디렉터리인 `.vhk`는 없었다. 그 아래에 중첩 저장소를
두면 해당 저장소의 `tests/**/*.test.ts`까지 현재 스위트로 수집됐다.

## 해결

- `vitest.config.ts`의 테스트 제외 목록에 `**/.vhk/**`를 추가했다.
- 설정 회귀 테스트에서 이 경계를 고정했다.
- 중첩 worktree를 그대로 둔 상태에서 Goal 전용 게이트와 `vhk verify`를 다시 통과시켰다.

## 관련 변경

- `vitest.config.ts`
- `tests/vitest-config.test.ts`
