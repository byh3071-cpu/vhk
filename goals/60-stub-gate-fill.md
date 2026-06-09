---
vhk_format: 1
type: goal
id: 60
title: 빈 스텁·누락 게이트 채움(stub-gate-fill) — P1
status: NOT_STARTED
priority: P1
created: 2026-06-09
leads_to: 61
---

# Goal 60: 빈 스텁·누락 게이트 채움 + 메타게이트 (stub-gate-fill)

> 출처: 전수검사 — "check-goal 통과"가 빈 스텁 또는 파일 부재로 무의미한 goal 다수.

## 근거 (실측 scripts/ ref 9e7681b)
- 동일 3167B 빈 스텁 10개: `check-goal-34,35,36,37,38,50,51,52,53,54.mjs`(goal 번호만 다른 템플릿, 고유 검증 0).
- 게이트 파일 아예 없음 5개: `check-goal-22,23,24,25,26.mjs`(21 다음 27로 점프).
- 대조군 실 게이트: `check-goal-20.mjs`(5816B), `check-goal-48.mjs`(5056B, 최근 채움), `check-goal-13.mjs`(3836B).
- 모순: `check-goal-34`-`38`은 status DONE인데 게이트가 스텁 → 헛통과 DONE.

## 동작
- (1) 스텁 10 + 누락 5 게이트를 각 goal 고유 수용기준 검증으로 채움(번호만 다른 템플릿 금지).
- (2) `scripts/check-meta.mjs`에 "활성 goal은 비스텁 게이트 필수" 메타 규칙 추가 → 스텁/누락 자동 검출 FAIL.
- (3) DONE이면서 스텁인 goal(34-38)은 해소 또는 정직 재오픈.

## 수용 기준
- `check-meta`가 현재 스텁 10 + 누락 5 = 15건을 정확히 검출(FAIL 리스트 일치).
- 채운 게이트는 각 goal 수용기준과 1:1 매핑.
- 34-38 DONE-스텁 전수 해소 또는 재오픈.

## Completion Check
- [ ] 스텁 10 + 누락 5 게이트를 goal 고유 검증으로 채움(템플릿 금지)
- [ ] `check-meta.mjs`에 비스텁 필수 메타 규칙 추가, 15건 검출
- [ ] 34-38 DONE-스텁 해소 또는 재오픈
- [ ] `node scripts/check-goal-60.mjs` 통과
- [ ] `node scripts/check-meta.mjs` 확장 규칙 통과

## Mandatory Reading
- `scripts/check-meta.mjs` · `scripts/check-goal-20.mjs`(실 게이트 모범) · `scripts/check-goal-48.mjs` · `scripts/_lib.mjs`
