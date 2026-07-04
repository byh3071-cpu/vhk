---
vhk_format: 1
type: goal
id: 25
title: vhk seo report (무빌드 HTML 대시보드) — P2
status: DONE
completed: 2026-06-20
priority: P2
version: v2.5.0
---

# Goal 25: vhk seo report

> 출처: vhk seo 풀 대시보드 설계문서 Phase 5. 전제: Goal 23·24(latest.json 완성) 완료.
> 보기 계층 — latest.json을 무빌드 HTML 대시보드로 렌더한다 (vhk verify --report 패턴 재사용).

## 배경
수집된 latest.json(색인·트래픽·수익·빙AI)을 사람이 한눈에 볼 수 있는 HTML 1장으로 렌더한다.
API로 안 되는 항목(광고조작·즉시색인·네이버수집 등)은 ⚠️ 배지 + 딥링크를 달아
클릭 한 번으로 해당 화면까지 가게 한다. vhk verify --report의 무빌드 패턴을 그대로 재사용.

## 철학
① latest.json만 읽어 렌더 — 새 증거 안 만듦 ② 무빌드·무의존 — 외부 CDN/번들러 없이 인라인 정적 HTML ③ 오프라인 동작 ④ 못하는 항목마다 ⚠️ 배지 + 딥링크 필수.

## 동작 (파일·계약)
- `vhk seo report`: latest.json → HTML 1장(인라인 CSS, 오프라인). 4블록:
  1. 색인 블록: 구글/빙/네이버 색인 수·사이트맵 상태·미색인 URL + URL검사 딥링크
  2. 트래픽 블록: GSC 검색성과 + GA4 방문자/유입 + 빙 AI 인용 미니섹션
  3. 수익 블록: 애드센스 수익·성과·결제(읽기전용) + 설정화면 딥링크
  4. AEO 점검 블록: schema.org·llms.txt·메타 체크리스트(수동 반자동)
- 못하는 항목마다 ⚠️ 배지 + "여기서 직접 하기" 딥링크 필수.
- `--open` 옵션: 생성 후 기본 브라우저로 열기 (비대화형/CI/MCP에서 자동 스킵).
- latest.json 없을 때: 안내(check 선실행) or 명확 종료.

## Completion Check
- [x] `vhk seo report` → 오프라인 HTML 4블록 생성 (외부 CDN 의존 0) — `tests/seo-report.test.ts` 9개(XSS 방어·손상 데이터 방어 포함)로 검증
- [x] 빙 AI 인용 미니섹션 렌더 (데이터 없으면 딥링크 폴백)
- [x] 못하는 항목 ⚠️ 배지 + '여기서 직접 하기' 딥링크 전수 표시
- [x] latest.json 없을 때 안내(check 선실행) or 명확 종료
- [x] --open 비대화형/CI/MCP에서 자동 스킵 (단, 대화형에서도 실제로 브라우저를 열진 않음 — 아래 정정 참조)
- [x] 리포트 HTML에 secret 0
- [x] vhk goal sync → check-goal-25.mjs → vhk goal check --id 25 통과
- [x] 공통 게이트 통과 (typecheck + test + build), 기존 회귀 0

## 완료 처리 정정 (2026-07-03, 실전재검증 감사 중 발견)

이 goal은 실제로 대부분 구현됨(렌더링 엔진 자체는 진짜 완성도 높음, RFC 0054 무인범위 밖 항목 없음) — 다만 감사 중 2건 발견:

1. **`--open` 문구 오해 소지**: "생성 후 기본 브라우저로 열기"라고 적혀 있지만, 실제로는 **대화형이어도** 브라우저를 안 연다("운영 단계에서 활성화됩니다" 메시지만 출력) — 비대화형 자동스킵이 아니라 모든 경우에 미구현.
2. **HARD_STOP 가드 누락 발견 → 즉시 수정**: `report.ts`에 `ensureNotHardStopped`가 없어 HARD_STOP 활성 중에도 `.vhk/seo/report.html`을 무조건 디스크에 썼다 — #335/#336(goal 21·22가 이미 겪은 것과 동일한 근본원인)의 3번째 재발 후보였음. TDD로 즉시 수정(`ensureNotHardStopped('seo report')` 추가, `tests/seo-hardstop.test.ts`에 회귀 가드 추가) — 이 goal의 실제 실전 신뢰성이 이번 감사로 한 단계 올라감.
3. 실전 사용 시 상위 파이프라인(goal 23/24)이 `latest.json`을 못 만들어서, 실전에서 report에 도달하면 거의 항상 "먼저 check 하라" 안내로 끝남 — report 자체 결함은 아니고 상류 문제.

## 제외 범위
- Notion 적재/스케줄러(Goal 26) / 인터랙티브 차트 라이브러리(무빌드 원칙 위반)
- 서버·웹 대시보드 (정적 파일만)

## Mandatory Reading
- src/commands/verify.ts (--report 무빌드 HTML 렌더링 패턴 — 그대로 재사용)
- Goal 23·24 latest.json 스키마 (색인/트래픽/revenue/bing 섹션)
- 설계문서 "대시보드 구성" 섹션 + "못하는 것 = 딥링크" 원칙
