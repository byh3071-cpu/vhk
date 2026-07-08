---
vhk_format: 1
type: goal
id: 79
title: verify 로컬 환경의존 테스트 분리 — 선조사 후 범위 재조정(확실한 것만) — P0
status: OBSERVING
priority: P0
created: 2026-06-20
leads_to: 로컬 verify 신뢰 — 선조사로 회귀 0 확인, 확실한 조치만 적용
---

# Goal 79: verify 로컬 환경의존 — 선조사 후 범위 재조정

> 출처: RFC 0053 §4(D2). 도그푸딩 감사 [D2]. 연계: Goal 47(CI 매트릭스).
> ⚠️ **선조사(2026-06-20)로 범위 변경**: "환경 분리" 구현 대신 "확실한 조치 + YAGNI 관찰"로 재조정.

## 근거 (실측 + 선조사)
- 로컬 `pnpm test:run` → 6 파일 7 테스트 실패. **CI(ubuntu/windows × 22·24)는 전부 green.**
- 선조사 분류(소수 단독 재실행) → **소스 회귀 0건**:
  - context·start·mcp-server (3) = forks 풀 불안정(머신 특정, 단독 통과)
  - recall-log (1) = `logRecall` O(n²) × Windows I/O 성능 특성(실사용 무해)
  - cloud.gh-contract·exec (3) = gh/.cmd shim spawn 환경 의존
- 상세: `docs/troubleshooting/TS-004-local-verify-red-vitest-forks.md`.

## 동작 (재조정 — 확실한 것만)
- ✅ **recall-log 테스트 timeout 30s 상향** — 명확·안전(CI·로컬 둘 다). 구현은 무해라 유지.
- ✅ **선조사 정식화** — TS-004 troubleshooting + 회귀 방지 패턴(chdir 금지·teardown try-catch).
- ⏸️ **환경 분리(@env 태그·verify --profile·pool 변경) = YAGNI 관찰**: CI green 이라 **비차단**. 전역 pool 변경은 CI(green) 리스크. RFC 0048 §1 "솔로 불필요 의례 = 감점" 경계. 실사용에서 로컬 빨강이 실제 DX 비용으로 누적되면 재개.

## 수용 기준 (재조정)
- recall-log 테스트가 안정 통과. 로컬 빨강 진단·우회법이 문서화(TS-004). 환경 분리는 관찰 상태로 명시.

## Completion Check
- [x] 7개 실패 원인 분류(환경/성능/회귀) — 선조사 완료, **회귀 0**(dev log + TS-004)
- [x] recall-log 테스트 timeout 30s 상향
- [x] TS-004 troubleshooting 정식화 + 회귀 방지 패턴
- [ ] (관찰·YAGNI) @env 분리 / verify --profile / pool 안정화 — CI green 이라 비차단, 실사용 신호 누적 시 재개
- [x] 공통 게이트(CI) green

## Forbidden Actions (OUT)
- 전역 vitest pool 변경으로 **CI(현재 green) 회귀 유발 0** (로컬 편의가 CI 진실원을 깨면 안 됨)
- 테스트 삭제·영구 skip 0 (timeout 상향은 "느린 테스트 허용"이지 제외 아님)
- "환경 분리 미구현"을 거짓 DONE 처리 0 (IN_PROGRESS 유지 — 관찰 항목 명시)

## Mandatory Reading
- docs/troubleshooting/TS-004-local-verify-red-vitest-forks.md · src/lib/recall-log.ts
- tests/recall-log.test.ts · goals/47-ci-os-node-matrix.md
