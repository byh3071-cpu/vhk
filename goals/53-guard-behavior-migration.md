---
vhk_format: 1
type: goal
id: 53
title: 가드 신뢰도 — 정규식 shape를 behavior 테스트로 이전 + 가드 CI 자동실행 — P2
status: NOT_STARTED
priority: P2
created: 2026-06-08
leads_to: 거버넌스 4→4.5 · 거짓양성/음성 가드 제거
---

# Goal 53: 가드 신뢰도 — behavior 이전

> 출처: RFC 0048 §2 원리6 · 13-에이전트 감사(2026-06-08) 거버넌스 차원 high 2건.

## 근거 (실측)
- check-goal `must()` 381개 중 350개(92%)가 `/.../.test(src)` 소스형태 정규식. 함수명만 바꿔도 깨지고(거짓음성), import만 해두면 통과(거짓양성). 리팩터링 세금 크고 보호 신뢰도 낮음.
- 44개 check-goal 가드가 CI·package.json 어디서도 자동 실행 안 됨 → 릴리즈 전 수동 `vhk goal check` 의존.
- 단 `tests/goal-drift.test.ts`·`git-repo.test.ts`·`version-sync.test.ts`는 이미 behavior 테스트 존재(중복 grep 어서션 제거 후보).

## 동작
- shape 가드(`.test(src)`)를 behavior 테스트(`tests/*.test.ts`)로 이전, 가드는 "테스트 파일 존재 + 핵심 export 시그니처"만 얇게 남김.
- 이미 behavior 테스트가 있는 항목의 중복 grep 어서션 제거.
- 변경된 goal만 도는 단일 CI 스텝(git diff로 touched goal id 추출) 추가 — 또는 봉인 가드는 `archive/`로 격리.

## 수용 기준
- 소스 정규식 어서션 비율 대폭 감소, 가드 자동실행 경로 존재. 회귀 0.

## Completion Check
- [ ] shape 가드 → behavior 테스트 이전(중복 grep 제거)
- [ ] 가드를 "테스트 존재+export 시그니처"로 슬림화
- [ ] 변경 goal만 도는 CI 스텝 또는 archive 격리
- [ ] 공통 게이트 통과, 회귀 0
- [ ] check-goal-53.mjs 통과

## Mandatory Reading
- scripts/check-goal-46.mjs · scripts/_lib.mjs · tests/goal-drift.test.ts · .github/workflows/ci.yml · goals/_meta-self-improve.md
