---
vhk_format: 1
type: goal
id: 23
title: vhk seo check 색인+트래픽 (GSC + GA4) — P2
status: DONE
completed: 2026-06-20
priority: P2
version: v2.4.2
---

# Goal 23: vhk seo check (색인 + 트래픽)

> 출처: vhk seo 풀 대시보드 설계문서 Phase 3. 전제: Goal 21 완료.
> 수집 계층 1 — 구글 색인·검색성과와 GA4 트래픽을 latest.json으로 모은다.

## 배경
`vhk seo check`의 첫 번째 반: 구글 서치콘솔 API로 사이트맵 상태·검색성과(노출/클릭/순위)·URL 색인상태를 수집하고,
GA4 Data API runReport로 방문자·세션·페이지뷰·유입을 수집해 .vhk/seo/latest.json(SoT)에 기록한다.
URL Inspection은 2,000/일·600/분 한도가 있어 한도 가드가 필수.

## 철학
① latest.json 단일 진실원천 — verify 패턴 재사용 ② raw JSON.parse 금지 → readJsonFile ③ URL Inspection 한도 가드 필수 ④ 죽은 API 사용 금지(UA, Custom Search).

## 동작 (파일·계약)
- GSC API: 사이트맵 상태, 검색성과(노출·클릭·순위), URL 색인상태(URL Inspection). 한도 가드 2,000/일·600/분.
- GA4 Data API: runReport로 방문자·세션·페이지뷰·유입 (무샘플링).
- 수집 결과를 .vhk/seo/latest.json(SoT)에 기록. readJsonFile 사용.
- 크로스플랫폼: 고정 경로 path.join, 네트워크 실패 친절 에러.
- 비대화형/MCP/CI 동작.

## Completion Check
- [ ] GSC 사이트맵·검색성과·URL색인상태 수집 → latest.json
- [ ] URL Inspection 한도 가드(초과 전 중단/배치) 동작
- [ ] GA4 runReport 방문자·유입 수집, 무샘플링 확인
- [ ] latest.json 스키마 일관, raw JSON.parse 미사용(readJsonFile)
- [ ] 수집 결과·로그에 secret 0
- [ ] vhk goal sync → check-goal-23.mjs → vhk goal check --id 23 통과
- [ ] 공통 게이트 통과 (typecheck + test + build), 기존 회귀 0

## 제외 범위
- 수익·빙 수집(Goal 24) / HTML 렌더(Goal 25)
- Universal Analytics API, Custom Search JSON API — 사용 금지(사망)

## Mandatory Reading
- vhk verify의 latest.json 스키마 패턴 (src/commands/verify.ts — SoT 재사용)
- readJsonFile 유틸
- GSC Search Console API (searchanalytics.query, sitemaps, urlInspection)
- GA4 Data API runReport 규격
- 설계문서 API 생존상태 표 (2026-06 검증)
