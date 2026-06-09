---
vhk_format: 1
type: goal
id: 57
title: 위험 정책 글롭 확장·통합(risk-policy-glob) — P1
status: NOT_STARTED
priority: P1
created: 2026-06-09
leads_to: 60
---

# Goal 57: 위험 정책 글롭 확장 + 결정점 통합 (risk-policy-glob)

> 출처: 전수검사 — 권한 게이트는 "부재"가 아니라 "액션 문자열 기반 + 결정점 분산"이 진짜 문제.

## 근거 (실측 — 기존 초안 모순 정정)
- 단일 chokepoint 이미 존재: `src/lib/safety-guard.ts` `runGuarded` + 정책 SoT `src/lib/risk-policy.ts`(`resolveGuard`, `HIGH_RISK_ACTIONS` 9종, `NL_GUARDED_ACTIONS`). → 기존 "전용 레이어 없음" 주장 폐기.
- 한계 1: risk-policy는 액션 문자열(9종) 기반, 파일·경로 글롭 차원 없음.
- 한계 2: 위험 결정이 `runGuarded`와 별개 메커니즘으로 분산 — HARD_STOP(`src/lib/hard-stop-guard.ts` 트립와이어), publish preflight(`src/commands/preflight.ts` + `src/lib/preflight.ts` + `publish.ts`), secure scan(`src/commands/secure.ts` + verify `runSecureGate`), mission forbidden(`src/commands/mission.ts`).

## 동작
- 신규 레이어 생성 금지(기존 chokepoint 유지).
- (1) risk-policy에 path/glob 위험 차원 추가 — 예: `RULES.md`/`AGENTS.md` 자동수정, `rm -rf` 경로, `.env` 경로. `resolveGuard`가 action + target 평가.
- (2) 분산 결정점(HARD_STOP/preflight/secure)이 risk-policy를 참조하도록 일원화 — 중복 정책 상수 제거.
- (3) 완전성 가드 테스트(현 `NL_GUARDED_ACTIONS` ↔ dispatch 교차검증 패턴)를 글롭 정책으로 확장.

## 수용 기준
- 새 위험 경로(예: `AGENTS.md` 자동수정 시도)가 CLI=confirm / MCP=preview로 차단됨(테스트).
- HARD_STOP/preflight/secure의 중복 정책 상수 0건(grep), risk-policy 단일 참조.
- 기존 9종 액션 가드 회귀 0(기존 테스트 green 유지).

## Completion Check
- [ ] risk-policy에 path/glob 위험 차원 추가, `resolveGuard`가 action+target 평가
- [ ] HARD_STOP/preflight/secure 중복 정책 상수 0건, risk-policy 단일 참조
- [ ] 글롭 차단 테스트(CLI confirm / MCP preview)
- [ ] 기존 9종 액션 회귀 0
- [ ] `node scripts/check-goal-57.mjs` 통과

## Mandatory Reading
- `src/lib/risk-policy.ts` · `src/lib/safety-guard.ts` · `src/lib/hard-stop-guard.ts` · `src/commands/preflight.ts` · `src/commands/secure.ts` · `src/commands/mission.ts`
