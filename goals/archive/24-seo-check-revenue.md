---
vhk_format: 1
type: goal
id: 24
title: vhk seo check 수익+빙 (AdSense v2 + Bing) — P2
status: DONE
completed: 2026-06-20
priority: P2
version: v2.4.3
---

# Goal 24: vhk seo check (수익 + 빙)

> 출처: vhk seo 풀 대시보드 설계문서 Phase 4. 전제: Goal 23(latest.json) 완료.
> 수집 계층 2 — 애드센스 수익과 빙 통계(AI 인용 포함)를 latest.json에 병합한다.

## 배경
`vhk seo check`의 두 번째 반: AdSense Management API v2로 수익·성과·결제를 읽고(읽기전용),
Bing Webmaster API로 순위·트래픽·크롤 통계와 AI Performance Report(2026 신규 — AI 인용 측정)를
latest.json에 병합한다. AdSense v1.4는 2021년 종료 — 절대 사용 금지.

## 철학
① AdSense는 읽기전용 — 광고 조작 불가, 딥링크로 우회 ② Bing AI Performance Report 베스트에포트(API 안 되면 딥링크 플래그) ③ latest.json 병합 SoT 유지 ④ v1.4 사용 금지(가드).

## 동작 (파일·계약)
- AdSense Management API v2: 수익·성과·결제 조회 (읽기전용). v1.4 사용 금지.
- Bing Webmaster API: 순위·트래픽·크롤 통계(GetQueryStats) + AI Performance Report(베스트에포트: API로 안 빠지면 딥링크 플래그).
- latest.json에 revenue·bing 섹션 병합. readJsonFile 사용.
- 비대화형/MCP/CI 동작.

## Completion Check
- [ ] AdSense v2 수익·성과·결제 수집 → latest.json (v1.4 미사용)
- [ ] Bing 순위·트래픽·크롤 통계 수집
- [ ] AI Performance Report 베스트에포트 (되면 수집, 안 되면 deepLink 플래그)
- [ ] latest.json 병합 스키마 일관, secret 0
- [ ] 비대화형/MCP/CI 동작
- [ ] vhk goal sync → check-goal-24.mjs → vhk goal check --id 24 통과
- [ ] 공통 게이트 통과 (typecheck + test + build), 기존 회귀 0

## 완료 처리 정정 (2026-07-03, 실전재검증 감사 중 발견)

Completion Check 7개가 전부 `[ ]` 미체크인 채로 `status: DONE`이었다 — RFC 0054(2026-06-20)가 이 goal의 완료 범위를 재정의했는데 근거가 이 파일에 안 적혀 있었다. 실측 재확인 결과:

- **실제로 된 것**: `ADSENSE_V14_FORBIDDEN` 상수 가드, `SeoRevenueBlock`/`SeoBingBlock` 타입 스키마, `aiCitationsDeepLink` 베스트에포트 폴백 필드.
- **아직 안 된 것(RFC 0054 §7, D2 실행력 단계로 이관)**: AdSense Management API v2 실호출, Bing `GetQueryStats`/AI Performance Report 실호출 — goal 23과 **동일 파일**(`check.ts`)이라 latest.json 미생성 문제도 그대로 공유.
- 위 Completion Check 박스는 다시 안 고친다(과거 이력 append-only) — 이 섹션이 정확한 현재 상태.

## 제외 범위
- HTML 시각화(Goal 25) / 애드센스 광고조작(읽기전용 — 딥링크로)
- AdSense API v1.4 — 사망, 사용 금지

## Mandatory Reading
- Goal 23 latest.json 스키마 (revenue/bing 섹션 추가 위치)
- AdSense Management API v2 reference (developers.google.com/adsense/management)
- Bing Webmaster API + AI Performance Report (learn.microsoft.com/en-us/bingwebmaster)
- 설계문서 "못하는 것 = 딥링크" 원칙
