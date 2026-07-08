---
vhk_format: 1
type: goal
id: 50
title: 커버리지 측정 + diff-coverage 게이트 — 미검증 경로 가시화 — P1
status: DEFERRED
priority: P1
created: 2026-06-08
leads_to: 테스트 4→5 · 1162 pass에 분모 부여
---

# Goal 50: 커버리지 측정 + diff-coverage

> 출처: RFC 0048 §2 원리4 · 13-에이전트 감사(2026-06-08) 테스트 차원 high.

## 근거 (실측)
- 커버리지 측정 전무 — `vitest.config.ts`에 coverage 키 없고 `@vitest/coverage-v8` dep 부재(package.json·node_modules 확인).
- 1162 pass는 분자뿐, line/branch 분모가 없어 "안 짠 경로"가 시스템에 안 보임.
- 회귀 앵커 중심이라 잡은 버그는 견고하나 미검증 표면은 영영 비가시.

## 동작
- `@vitest/coverage-v8` devDep 추가, `vitest.config.ts`에 coverage 블록(provider v8, reporter text-summary+json, exclude dist/.claude).
- **전체 100% 강제 금지**(솔로 부담) — 우선 리포트만 CI Summary 노출.
- 다음 단계: diff-coverage(신규 추가분 무커버리지만 차단)를 CI에 도입.

## 수용 기준
- `pnpm test:run --coverage`로 커버리지 리포트 생성, CI에 노출. 신규분 게이트 동작(임계 강제 아님).

## Completion Check
- [x] @vitest/coverage-v8 추가 + vitest.config coverage 블록 (PR1)
- [ ] 커버리지 리포트 CI Summary 노출 — **PR2/CI**
- [x] diff-coverage **측정** 도입 (`vhk diff-cover`, 자문형·차단 0, PR1) — **차단은 PR2**(RFC 0050 §5 승격 시)
- [x] 공통 게이트 통과, 회귀 0 (PR1)
- [ ] check-goal-50.mjs 통과 — **PR2**(게이트 스크립트는 차단 도입과 함께)

> **PR 분할(RFC 0050)**: PR1 = 측정(coverage 인프라 + 순수 3모듈 + `vhk diff-cover` 자문). 차단/review 통합/CI는 PR1 도그푸딩 실측이 정당화하면 PR2(measure-first). 카드의 "신규분 차단" 원문은 PR2로 미룸.

## Mandatory Reading
- vitest.config.ts · package.json(devDeps) · .github/workflows/ci.yml
