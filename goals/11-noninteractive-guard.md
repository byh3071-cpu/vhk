---
vhk_format: 1
type: goal
id: 11
title: 대화형/비대화형 통합 가드 (MCP·CI 안전) — P1
status: NOT_STARTED
priority: P1
---

# Goal 11: 대화형/비대화형 통합 가드 P1 (#14)

> 설계 전문: `docs/superpowers/specs/2026-06-01-mcp-noninteractive-guard-design.md`
> 출처: 이슈 #14 (MCP stdio inquirer stdin 점유) + MCP-first 미래 대비.

## 배경
inquirer 쓰는 명령(15개)이 비-TTY(CI·파이프·MCP stdio)서 멈춤/크래시/RPC파이프 훼손.
감지·동작이 명령마다 제각각(init=defaults / recap·design=refuse / high-risk=runGuarded /
gate·theme·ship·restore=무가드). 단일 계약 필요.

## 철학
① 절대 안 멈춤 ② 위험작업 무단실행 0 ③ 비-TTY면 stdin 미접근(MCP 불변식)
④ 기존 risk-policy/safety-guard 재사용(새 분류 금지).

## 동작 (3버킷 + 감지 SoT)
- `src/lib/interactive.ts`: `isInteractive(opts)` (stdin.isTTY + !yes + VHK_FORCE_INTERACTIVE 탈출구),
  `promptOrDefault(ask, fallback, opts)` (비대화형→fallback, 시도시 abort catch), `ensureInteractive` 재배선.
- `risk-policy.ts`: HIGH_RISK_ACTIONS 에 `restore` 추가.
- `safety-guard.ts`: lite 분기 — destructive+미승인+비대화형(stdin)이면 lite여도 중단.
- `index.ts`: restore → guardCli + `--yes`.
- `init.ts`: 로컬 isNonInteractive → SoT (stdout 축 제거).
- `gate.ts`: 진입부 ensureInteractive (essential).
- `save`: 비대화형 커밋메시지 기본값 = `"chore: vhk save"`.
- `scripts/check-goal-8.mjs`: init stdout 축 제거에 맞춰 assertion 갱신.

## Completion Check
- [ ] isInteractive/promptOrDefault/ensureInteractive 단일 SoT + 단위테스트
- [ ] restore HIGH_RISK + guardCli 래핑 + --yes
- [ ] lite여도 비대화형+미승인 destructive 중단 (runGuarded, stdin 축)
- [ ] gate 비-TTY 거부(essential), init 비대화형 SoT 통일
- [ ] HIGH_RISK 전 액션 guard 경유 완전성 가드 테스트 + MCP 불변식 테스트
- [ ] check-goal-8 assertion 갱신(회귀 없음)
- [ ] 4환경 실측 스파이크: PowerShell / Git Bash / `echo|` / MCP stdio
- [ ] 공통 게이트 통과 (typecheck + test + build)

## Mandatory Reading
- `docs/superpowers/specs/2026-06-01-mcp-noninteractive-guard-design.md` (설계 정본)
- `src/lib/interactive.ts`, `src/lib/safety-guard.ts`, `src/lib/risk-policy.ts`, `src/index.ts`(guardCli)

## When Stuck
환경 거동 불확실하면 선분석 말고 실측 스파이크 먼저. 우아한 degradation(never-hang)이 안전망.
