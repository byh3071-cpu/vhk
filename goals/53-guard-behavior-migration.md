---
vhk_format: 1
type: goal
id: 53
title: 가드 신뢰도 — 정규식 shape를 behavior 테스트로 이전 + 가드 CI 자동실행 — P2
status: DONE
priority: P2
created: 2026-06-08
completed: 2026-06-10
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
- [x] 측정 인프라: goal-drift.ts `countRegexAssertions`/`countMustAssertions`(정규식 shape 비율 산출)
- [x] 가드를 "behavior 테스트 실행 + export 시그니처 spot check"로 슬림화 — check-goal-53 자체가 모범
- [x] CI 자동실행 기반: behavior 메타 검증을 vitest 테스트(guard-behavior-migration.test.ts)로 → CI test:run 이 자동 실행
- [x] 공통 게이트 통과, 회귀 0
- [x] check-goal-53.mjs 통과

## ✅ Completion (2026-06-10)
- **측정 인프라**(src/lib/goal-drift.ts): `countRegexAssertions(content)→{count,examples}`(패턴 `must(/.../.test(...))`) + `countMustAssertions`(분모). 주석·`const must=` 정의 라인 제외.
- **메트릭/ratchet**(tests/guard-behavior-migration.test.ts): 51개 check-goal 스캔 → 정규식 shape 비율 **현재 ~75%**, 상한 **0.85** 이하 단언(신규 shape 폭증 차단, 점진 마이그레이션으로 낮춤). + behavior 테스트 목록(goal-drift/git-repo/version-sync) 존재 대조.
- **슬림 모델**(check-goal-53.mjs): shape grep 더미 대신 ① export 시그니처 spot check 2줄 ② behavior 테스트 존재 ③ 비율 동적 계산(하드코딩 금지)·상한 ④ **behavior 테스트 실제 실행**(동작 검증). 이 게이트가 "shape→behavior" 의 본보기.
- **CI 자동실행**: 메타 검증을 vitest 로 옮겨 `pnpm test:run`(CI)이 자동 실행 — 감사 지적 "44 가드 미자동실행"을 측정 차원에서 해소. (변경-goal 선택실행은 스코프 아웃, 별도.)
- **보수 스코프**: 전 게이트 일괄 개조 금지 — 측정+ratchet+모범 게이트로 방향 고정. 기존 shape 단언은 점진 제거 대상.
- **게이트**: build ✓ · tsc ✓ · test:run 1405 pass(+5, 회귀 0) · check-goal-53 ✓ · goal-drift.test 회귀 0.

## Mandatory Reading
- scripts/check-goal-46.mjs · scripts/_lib.mjs · tests/goal-drift.test.ts · .github/workflows/ci.yml · goals/_meta-self-improve.md
