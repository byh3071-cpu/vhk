---
vhk_format: 1
type: goal
id: 43
title: goal 상태↔코드 현실 드리프트 게이트 — shipped인데 NOT_STARTED 차단 — P1
status: DONE
priority: P1
created: 2026-06-07
completed: 2026-06-08
leads_to: goal 상태 신뢰성 (Goal 19 정정 포함)
---

# Goal 43: goal 상태↔코드 현실 드리프트 게이트

> 출처: VHK 핸드오프(2026-06-07, 실측) Task D. v2.4.0 CHANGELOG 빈칸과 같은 병
> (사람이 수동 갱신하다 깜빡, 아무도 안 막음).

## 근거 (실측)
- Goal 19(pattern) frontmatter `status: NOT_STARTED`인데 `src/commands/pattern.ts`는 이미 풀구현 + v2.1.0 출시.
- 드리프트가 산 증거로 살아있음.

## 동작
- goal frontmatter `status`가 코드 현실과 어긋나는지 점검하는 게이트(`vhk goal check`/preflight 확장).
- 최소: 구현이 shipped됐는데 status가 NOT_STARTED인 goal을 fail/경고.
- **먼저 Goal 19 status부터 실제(DONE + version)로 정정.**

## 수용 기준
- 코드 shipped인데 goal 상태 NOT_STARTED로 남으면 CI/preflight가 잡는다.

## Completion Check
- [x] Goal 19 status를 DONE(+version)으로 정정
- [x] goal status↔코드 드리프트 점검 게이트 구현
- [x] shipped인데 NOT_STARTED면 fail/경고
- [x] 회귀 테스트
- [x] check-goal-43.mjs 통과
- [x] 공통 게이트(typecheck+test+build) 통과, 회귀 0

## Mandatory Reading
- src/commands/goal.ts
- src/lib/goal-frontmatter.ts
- goals/19-pattern.md
