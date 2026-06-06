---
vhk_format: 1
type: goal
id: 30
title: vhk worktree 가드 — worktree 생성 시 env 누락 방지(자동복사/차단) — P2
status: NOT_STARTED
priority: P2
created: 2026-06-06
depends_on: goal-29-preflight
---

# Goal 30: vhk worktree 가드

> 출처: Notion "D3 · worktree 가드 상세 설계 (env 누락 방지 훅)". 전제: Goal 29의 worktree-env 모듈.
> git worktree를 만들 때 env·설정 누락을 능동적으로 차단/자동복구하는 가드(훅 + 래퍼 명령).

## 배경 (왜)
preflight(Goal 29)가 '출고 직전 점검'이라면 이건 'worktree 생성 순간 방어'다. 시점이 다르다:
- preflight = publish/PR 직전(사후 점검, 수동) / worktree 가드 = worktree 생성 순간(사전 방어, 능동 차단·자동복구).
→ **핵심 점검 로직(worktree-env 모듈)은 Goal 29와 공유**하고, 이 goal은 "생성 시점 훅"으로 그 로직을 재사용. 독립 명령이되 코드 공유.

## 철학
① 핵심 = `worktree-env.ts` 모듈(Goal 29 공유) — 이중 구현 금지 ② 복사 방식 = 파일 복사(심볼릭 링크 X — Windows 항상 작동·worktree 독립) ③ 비밀값은 항상 마스킹, 내용 로그 출력 절대 금지 ④ git 훅 자동 설치 안 함(사람 모르게 git 설정 안 건드림 — `vhk worktree add` 쓸 때만 작동) ⑤ safeExecFile로 git 명령 래핑.

## 동작 (명령·훅)
- `vhk worktree add <branch>` — worktree 생성 + 필수 env/설정 자동 복사.
- `vhk worktree check` — 현재 worktree env 누락 점검.
- git post-checkout 훅 — worktree 진입 시 자동 점검(Phase 3, 자동 설치 안 함).
- 복사 대상 = `.env*` 전부 + VHK 설정에 등록한 추가 로컬 파일(예: `.vscode`). 비밀값 마스킹.
- 가드 항목: 필수 `.env`/`.env.local` 키 존재 / 로컬 설정 파일 복사 / node_modules·pnpm 설치 필요 안내 / 브랜치-goal 연결(한 PR 한 goal).

## Completion Check
- [ ] `vhk worktree add <branch>` → worktree 생성 + env 자동 복사, 누락 0건
- [ ] `vhk worktree check` → 현재 worktree env 누락 정확 탐지 + 복구 안내
- [ ] env 복사 로그에 비밀값 평문 0건(마스킹 검증)
- [ ] worktree-env 모듈을 Goal 29와 공유(중복 구현 0)
- [ ] env 누락/정상/부분누락 케이스 vitest(git worktree mock)
- [ ] vhk goal sync → check-goal-30.mjs → vhk goal check --id 30 통과
- [ ] 공통 게이트 통과 (typecheck + test + build), 기존 회귀 0

## 제외 범위 (v0)
- git 훅 자동 설치(Phase 3) / node_modules 자동 설치(안내만, 실행은 사람)

## Mandatory Reading
- goals/29-preflight.md (worktree-env 모듈 계약 — 먼저 구현 후 재사용)
- src/lib/exec.ts (safeExecFile — git worktree 래핑)
