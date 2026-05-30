---
vhk_format: 1
type: goal
id: 6
title: 배치4 — Safety Mode + 위험 작업 가드 (lite/standard/strict)
status: DONE
priority: P1
version: v2.0
completed: 2026-05-30
---

# [배치 4] Safety Mode + 위험 작업 가드 (goal 6)

위험 작업을 "그냥 실행"하지 못하게 막는 안전 레이어. PRD 프레임: **"검증 루프 강제"지 "전문 개발자 대체"가 아니다** — 항상 기계 게이트 위에 얹는다.

## 공통 가드 (반드시 준수)
- Windows PowerShell. bash heredoc/sh 금지. 게이트는 pnpm.cmd.
- 한국어 UX/문서 톤. 사용자-facing 한국어를 영어로 바꾸지 마라.
- 직렬 goal. 게이트 통과 전 done/머지 금지. sync/undo/MCP 자동 실행 금지.
- blockers.md·learnings.md append-only. 사용자 변경 revert 금지. 최소 범위 패치.
- 모든 신규 동작 TDD(실패테스트 → 최소구현 → green). 신규 의존성 금지.

## Mandatory Reading Order (먼저 읽을 것)
1. AGENTS.md / docs/context/agent-compact.md (작동 규약)
2. src/lib/read-json.ts (JSON 읽기 헬퍼 + stripBom)
3. src/commands/undo.ts (기존 high-risk confirm 패턴)
4. src/lib/cli-args.ts (COMMAND_SUBCOMMANDS / isRealSubcommandPath — R1)
5. scripts/check-goal-5.mjs (R1 게이트 — 교체 대상)
6. src/i18n/ko.ts / src/index.ts (커맨드 등록 + 별칭 + 자연어 키워드)

## 신규/수정 파일
- src/lib/config.ts — .vhk/config.json 읽기/쓰기 (없으면 기본값)
- src/lib/safety-mode.ts — 모드 정의: lite / standard / strict
- src/lib/risk-policy.ts — high-risk 액션 판정 + 모드·채널별 정책
- src/commands/mode.ts — `vhk mode [lite|standard|strict]` 조회/변경
- src/commands/verify.ts — 저장/위험 작업 전 검증 묶음(메타러너 자리만, lite)
- .vhk/config.json — 기본 {"safetyMode":"standard"}
- scripts/check-goal-6.mjs — 게이트

## high-risk 액션 (정책 적용 대상)
undo / deploy / publish / migrate / cloud pull / resume / env write / delete
- CLI 경로 → confirm 강제 (사용자 y/N)
- MCP·자연어 → preview / dry-run (실제 실행 전 무엇을 할지 출력)
- standard 기본. strict = 더 많은 작업에 confirm, lite = 경고만.

## R1 2건 (roadmap §6 — 이 배치 포함)
1. COMMAND_SUBCOMMANDS(cli-args.ts)가 commander 정의의 하드코딩 복제 → 새 서브커맨드 누락 시
   자연어 라우터가 명령을 가로채는 R1 재발. 단일 소스화하거나, 최소한 둘의 드리프트를 잡는
   스냅샷/가드 테스트를 추가하라. (테스트 없이 끝내지 마라)
2. scripts/check-goal-5.mjs 의 R1 게이트가 주석 grep만 함 → 가드 코드가 삭제돼도 통과.
   `isRealSubcommandPath` 코드 구조를 실제로 검증하도록 게이트를 교체하라.

## 게이트 (전부 통과해야 done)
- pnpm.cmd exec tsc --noEmit / pnpm.cmd run test:run / pnpm.cmd run build
- pnpm.cmd run scan / pnpm.cmd audit --audit-level moderate
- node scripts/check-meta.mjs / node scripts/check-goal-0..6.mjs
