# Agent Compact — 짧은 작동 규약 (먼저 읽기)

> AGENTS.md 전체를 대체하지 않는 **빠른 시작 요약**. 매 iteration 먼저 읽고,
> 상세가 필요하면 AGENTS.md / CLAUDE.md / 해당 goal 문서를 그때 연다.

## 환경
- 언어: 한국어 (메시지·주석·응답). 사용자-facing 한국어를 영어로 바꾸지 않는다.
- OS: Windows 11 / PowerShell. bash heredoc·sh 문법 금지. 게이트는 `pnpm.cmd`.

## 안전 (HARD_STOP)
- 작업 시작 시 `.vhk/HARD_STOP` 존재 확인. 있으면 **모든 자동화 즉시 중단**하고 사람에게 보고.
- 해제는 `vhk resume --confirm` (사람만). 자동 호출 금지.
- 블로커 3건 누적 시 HARD_STOP 자동 생성.

## 세션 이어받기
- 시작/이어하기: `vhk work` (시작 프롬프트 생성·클립보드 복사). 중단 시: `vhk work handoff` (인수인계 프롬프트). CLI는 수집·프롬프트만, 커밋/done은 사람 승인.

## 작업 원칙
- **active goal 만 작업** (`vhk goal next` 가 고른 첫 NOT_STARTED / IN_PROGRESS).
- 사용자 변경 **revert 금지**. `git status --short` 먼저 확인, 기존 수정 보존, 최소 범위 패치.
- 추측으로 코드 바꾸지 않는다. 원인 모르면 멈추고 보고.

## 원본 지도 (Source of Truth)
- 규칙 원본: `RULES.md` (→ `vhk sync` 로 각 도구에 전파).
- 작업 정의·순서 원본: `docs/roadmap/2.x-roadmap.md`. 수용 기준 원본: `docs/PRD-2.x.md`.
- `goals/*.md`가 있으면 frontmatter를 로컬 실행 상태로만 읽는다.
- `.vhk/context.md`·`docs/state/next-task.md`는 파생 스냅샷이다. `docs/state/blockers.md`는 append-only 로컬 차단 기록이다.
- 교훈·결정·실패·성공의 운영 원본은 `vhk memory` 4버킷이다. `docs/til.md`는 검증된 범용 배움의 공개 승격본이며, 구 `docs/state/learnings.md`에는 새로 기록하지 않는다.

## 게이트
- 기본: `pnpm.cmd exec tsc --noEmit` / `pnpm.cmd run test:run` / `pnpm.cmd run build`.
- TDD: 실패 테스트 먼저 → 최소 구현 → green.
- **게이트 실패 시 `vhk goal done` 금지** — 통과해야만 done.
