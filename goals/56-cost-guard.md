---
vhk_format: 1
type: goal
id: 56
title: 비용·예산 가드(cost-guard) — P0
status: NOT_STARTED
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
- [ ] `cost-policy.ts`(예산·요율 SoT) + 호출부 분리
- [ ] pricing은 `.vhk/config.json` 주입, 코드 상수 0건
- [ ] 80% warn / 100% block / 비대화형 미승인 block
- [ ] `cost.jsonl` append, 과거 줄 변경 0
- [ ] `node scripts/check-goal-56.mjs` 통과

## Mandatory Reading
- `src/lib/config.ts` · `src/lib/risk-policy.ts` · `src/lib/safety-guard.ts` · `src/commands/mode.ts` · `src/lib/evidence-ledger.ts`
