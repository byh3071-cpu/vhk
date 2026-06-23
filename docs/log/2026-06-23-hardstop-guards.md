# 2026-06-23 — HARD_STOP 가드 누락 묶음 (#334/#335/#336)

> 6-22 도그푸딩 high 후속. undo(#338)와 같은 패턴(`ensureNotHardStopped` 누락) 3건 일괄.

## 수정
- **#334 goal sync**: goalSync 가 HARD_STOP 활성 시 게이트 스크립트(check-goal-N.mjs) 생성 → 함수 시작에 가드(`GoalSyncResult` 기본 반환).
- **#335 seo init**: seoInit 가 config(`.vhk/seo/config.json`) 기록 → 가드 + import 추가.
- **#336 seo submit**: seoSubmit 가 IndexNow 키 생성·제출 → 가드 + import 추가.

## 검증
- typecheck·build ✓
- E2E: HARD_STOP 활성 tmp 에서 `goal sync`·`seo init`·`seo submit` 전부 `🛑 HARD STOP 활성` 차단 확인(실행경로 미진입).
- 회귀 테스트: goal-hardstop.test.ts(+goalSync 케이스) · 신규 seo-hardstop.test.ts(seoInit/seoSubmit).
- ⚠️ 로컬 vitest forks 는 chdir 패턴 + 환경 불안정(TS-004)으로 worker crash → **CI 가 진실원**(기존 goal-hardstop 이 동일 chdir 패턴으로 CI green).

## 연관
- undo #337/#338 → #352 머지. resume exit 127 → #353 등록(별개 기존 버그).
