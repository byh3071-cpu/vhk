---
vhk_format: 1
type: goal
id: 60
title: 빈 스텁·누락 게이트 채움(stub-gate-fill) — P1
status: DONE
priority: P1
created: 2026-06-09
completed: 2026-06-10
leads_to: 61
---

# Goal 60: 빈 스텁·누락 게이트 채움 + 메타게이트 (stub-gate-fill)

> 출처: 전수검사 — "check-goal 통과"가 빈 스텁 또는 파일 부재로 무의미한 goal 다수.

## 근거 (실측 scripts/ ref 9e7681b)
- 동일 3167B 빈 스텁 10개: `check-goal-34,35,36,37,38,50,51,52,53,54.mjs`(goal 번호만 다른 템플릿, 고유 검증 0).
- 게이트 파일 아예 없음 5개: `check-goal-22,23,24,25,26.mjs`(21 다음 27로 점프).
- 대조군 실 게이트: `check-goal-20.mjs`(5816B), `check-goal-48.mjs`(5056B, 최근 채움), `check-goal-13.mjs`(3836B).
- 모순: `check-goal-34`-`38`은 status DONE인데 게이트가 스텁 → 헛통과 DONE.

> 범위 정정(2026-06-10): 감사 시점(ref 9e7681b)의 "스텁 10 + 누락 5 = 15" 중 **진짜 위험은 DONE-스텁
> 34-38(5건)뿐** — 나머지(50-54 NOT_STARTED-스텁, 22-26 미싱)는 미구현 미래 goal이라 빈 게이트가 정상.
> NOT_STARTED 게이트를 미리 채우면 ①미구현 코드 검증이라 게이트가 실패하고 ②goal 43 드리프트(NOT_STARTED+
> custom must()=구현흔적)를 오탐시킨다. 그래서 **위험만 정조준(범위 A)**: DONE-스텁만 채우고, 메타게이트가
> "완료 goal은 비스텁 필수"를 강제해 재발 차단. (55-61 카드는 감사 후 f50b2b9에서 생성 → 당시 15에 미포함.)

## 동작 (범위 A)
- (1) DONE-스텁 게이트 34-38(5건)을 각 goal 수용기준 검증으로 채움(번호만 다른 템플릿 금지, 구현 실재 검증).
- (2) `scripts/check-meta.mjs`에 M.4 "완료(DONE/IN_PROGRESS) goal은 비스텁 게이트 필수" 메타 규칙 추가 →
  미싱/스텁 자동 검출 FAIL. 검출기 `findCompletedStubGates`(`scripts/_lib.mjs`) — 스캐폴드 마커 기반이라
  goal 0/1/2 같은 must()-미사용 구버전 진짜 게이트는 오탐 안 함.
- (3) 34-38 DONE-스텁 해소: 구현은 모두 실재(grep 확인) → real 게이트 채움, DONE 유지(재오픈 불필요).
- (NOT_STARTED 50-54·22-26 등은 구현 시점에 게이트 작성 — 메타룰이 DONE 전이 시 강제.)

## 수용 기준
- `check-meta` M.4 가 현재 DONE-스텁 정확히 5건(34-38)을 검출, 채운 뒤 0건(GREEN).
- 채운 게이트 34-38 은 각 goal 수용기준과 1:1 매핑이고 통과(구현 실재).
- 검출기가 NOT_STARTED-스텁(50-54)·구버전 진짜 게이트(0/1/2)를 오탐하지 않음(meta-gate.test 봉쇄).

## Completion Check
- [x] DONE-스텁 게이트 34-38 을 goal 고유 검증으로 채움(템플릿 금지)
- [x] `check-meta.mjs` M.4 비스텁 필수 메타 규칙 추가(`findCompletedStubGates`), 34-38 검출→채운 뒤 0건
- [x] 34-38 DONE-스텁 해소(real 게이트, DONE 유지)
- [x] `tests/meta-gate.test.ts` 검출기 행동 봉쇄(DONE-스텁 검출 / NOT_STARTED·0/1/2 무시)
- [x] `node scripts/check-goal-60.mjs` 통과
- [x] `node scripts/check-meta.mjs` 확장 규칙(M.4) 통과

## Mandatory Reading
- `scripts/check-meta.mjs` · `scripts/check-goal-48.mjs`(채움 모범) · `scripts/check-goal-9.mjs`(정적단언) · `scripts/_lib.mjs` · `src/lib/goal-drift.ts`(goal 43 역방향 짝)
