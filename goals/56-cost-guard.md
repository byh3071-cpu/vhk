---
vhk_format: 1
type: goal
id: 56
title: 비용·예산 가드(cost-guard) — P0
status: DONE
priority: P0
created: 2026-06-09
leads_to: 61 (stats 집계 소스)
---

# Goal 56: 비용·예산 가드 (cost-guard)

> 출처: 전수검사 — 5대 자기개선 루프 중 비용 루프만 전무(최우선 공백).

## 근거 (실측)
- `src/commands/` 디렉터리 실측: `cost.ts`/`budget.ts` 없음. `src/lib/`에도 없음.
- 나머지 4루프는 존재: 맥락(`context.ts`/`memory.ts`), 위험(`risk-policy.ts`/`safety-guard.ts`), 학습(`evolve.ts`/`pattern.ts`), 증거(`verify.ts`/`evidence-ledger.ts`). 비용만 0.
- 모드 연동 자원: `src/lib/config.ts`(`.vhk/config.json`), `src/commands/mode.ts`(safety mode).

## 동작
- token/$ 예산 가드. `cost-policy.ts`(예산·요율 SoT) + 호출부로 결정/집행 분리(`risk-policy`와 동형).
- pricing table은 `.vhk/config.json` 주입값 사용 — 코드 하드코딩 금지.
- 임계 초과 시 safety mode 연동: warn → confirm → block(비대화형 + 미승인은 block).
- 사용량 누적은 `cost.jsonl`(G55 패턴 재사용) append.

## 수용 기준
- 예산 80%에서 warn, 100%에서 block, 비대화형 + 미승인은 block.
- pricing 코드 상수 0건(grep 검증) — 전부 config 주입.
- 사용량 append 시 과거 줄 변경 0.

## Completion Check
- [x] `cost-policy.ts`(예산·요율·판정 SoT, 순수) + 호출부(cost.ts) 분리
- [x] pricing은 `.vhk/config.json` 주입, 코드 상수 0건(grep 검증)
- [x] 80% warn / 100% block / 비대화형 미승인 block(exit 1) — 도그푸딩 확인
- [x] `cost.jsonl` append-only(atomicWriteFile), 과거 줄 변경 0
- [x] `node scripts/check-goal-56.mjs` 통과

## 구현 메모

- **자문형 + 양방향 입력**(사용자 확정): vhk 는 Claude API 직접 호출 안 함 → 비용 자동추적 불가. 사용량은 수동 `vhk cost add`(--usd | --in/--out/--model) + 환경변수 `VHK_COST_*` 둘 다로 먹임. `check` 는 신호(exit code)로 CI/agent 가 멈추게 함.
- **결정/집행 분리**: `cost-policy.ts`(evaluateBudget·costToGuard·usdOf, 순수) / `cost.ts`(집행). `runGuarded` 는 action 기반 resolveGuard 로 guard 를 자체 계산 → 임계 기반 비용 level 을 못 먹이므로 **직접 호출 대신 동형 의미**(비-TTY+미승인 block·TTY confirm·--yes 승인)를 cost level 로 구동(risk-policy 중복 아님 = 별도 정책 차원, 단일 chokepoint 원칙 위배 아님).
- 신규: cost-policy.ts·cost-ledger.ts(.vhk/cost.jsonl, evidence-ledger append 패턴)·src/commands/cost.ts·check-goal-56.mjs + 테스트 3종(cost-policy 8·cost-ledger 7·cost 7). config.ts 에 budget/pricing 주입 필드. 명령 3지점 등록(index/registry/cli-args).
- **preflight 편입은 보류**(카드 "[선택]" — release-gate 핫파일 리스크 회피). 후속 가벼운 advisory 로 가능.

## Mandatory Reading
- `src/lib/config.ts` · `src/lib/risk-policy.ts` · `src/lib/safety-guard.ts` · `src/commands/mode.ts` · `src/lib/evidence-ledger.ts`
