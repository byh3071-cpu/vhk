---
vhk_format: 1
type: goal
id: 49
title: 정적 린트 게이트 — eslint type-aware 결함룰 확대 + CI 블로킹 — P1
status: DONE
priority: P1
created: 2026-06-08
leads_to: 툴링 4→5 · 린트 고유 결함 자동 차단
---

# Goal 49: 정적 린트 게이트(Biome)

> 출처: RFC 0048 §2 원리1 · 13-에이전트 감사(2026-06-08) 툴링 차원 high.

## 근거 (실측 · 재스코프 2026-06-09)
- 카드 원안은 'Biome 신규 도입'이나 #216(tsc/eslint async 안전성 게이트) 머지로 **eslint(type-aware) + CI lint 블로킹 스텝이 이미 존재**. roadmap 도 'Goal 49 = 도입→확대'로 재조정됨.
- 기존 eslint 는 async 3룰(no-floating-promises·no-misused-promises·await-thenable)만 → switch 누락 케이스 등 일부 결함룰이 빔.
- Biome 병존은 noFloatingPromises(타입정보 필요, Biome 미흡)와 중복 → 채택 안 함. **eslint 확대**로 결정(사용자 확인).

## 동작 (실제)
- `eslint.config.js` 에 tsc(strict)가 못 잡는 type-aware **결함룰** 추가(스타일 아님): `switch-exhaustiveness-check`(union 누락 케이스) · `no-base-to-string` · `prefer-promise-reject-errors` · `no-unnecessary-type-assertion`.
- 미사용 변수·암묵 return·switch fallthrough 는 tsconfig(noUnusedLocals/Parameters·noImplicitReturns·noFallthroughCasesInSwitch)가 이미 담당 → eslint 중복 제외(노이즈 최소).
- 기존 위반 베이스라인 1회 정리: 불필요 `as` 8건 `--fix` 제거 + 고아 타입 import 2건 정리.
- CI 블로킹 lint 스텝은 #216에 이미 존재(`pnpm lint`, gate 필수체크 포함) → ci.yml 변경 불필요.

## 수용 기준
- eslint 결함룰 확대(7룰 활성), CI lint 위반 0 으로 green, 위반 시 머지 차단(기존 gate).

## Completion Check
- [x] eslint type-aware 결함룰 확대 (switch-exhaustiveness·no-base-to-string·prefer-promise-reject-errors·no-unnecessary-type-assertion)
- [x] 기존 위반 1회 베이스라인 정리 (불필요 `as` 8건 --fix + 고아 import 2건)
- [x] CI lint 블로킹 스텝 (#216에 이미 존재 — gate 필수체크)
- [x] 공통 게이트 통과, 회귀 0
- [x] check-goal-49.mjs 통과

## 구현 메모
- Biome→eslint 재스코프(2026-06-09, 사용자 확인). 툴 1개 유지, 노이즈 최소(솔로 유지비).
- 확대 4룰 중 3룰(switch/base-to-string/reject-errors)은 0 위반 = 미래 가드레일, 1룰(no-unnecessary-type-assertion)만 8건 베이스라인 정리.

## Mandatory Reading
- .github/workflows/ci.yml · package.json(devDeps) · src/mcp/server.ts(eslint-disable 1곳)
