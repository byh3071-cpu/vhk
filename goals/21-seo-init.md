---
vhk_format: 1
type: goal
id: 21
title: vhk seo init (스캐폴드 + 사이트등록 + 키보관) — P2
status: NOT_STARTED
priority: P2
version: v2.4.0
---

# Goal 21: vhk seo init

> 출처: vhk seo 풀 대시보드 설계문서 Phase 0+1. 전제: vhk secure 동작.
> SEO 에픽의 진입점 — 스캐폴드하고 대상 사이트·서비스 자격증명을 안전하게 받아 보관한다.

## 배경
브라우저 즐겨찾기로 구글 서치콘솔·GA4·애드센스·빙·네이버를 일일이 돌아다니는 대신,
`vhk seo` 서브커맨드 하나로 API 자동화 + 딥링크 반자동화로 통합 관리한다.
이 goal은 그 진입점: commands/seo/ 골격을 세우고 5개 서비스 자격증명을 안전하게 받아 vhk secure에 보관한다.

## 철학
① 자격증명은 vhk secure로만 — 평문 커밋/로그 절대 금지 ② 골격 먼저, 기능은 후속 goal에서 ③ 비대화형 1급 (MCP/CI/스케줄러 안전) ④ src 구조 유지: commands/seo/ 신설.

## 동작 (파일·계약)
- src/commands/seo/ 디렉터리 + seo 커맨드 라우터 골격, i18n/ko.ts 키 추가.
- `vhk seo init`: 대상 사이트(도메인) 등록 → .vhk/seo/config.json.
- 5개 서비스(GSC, GA4, AdSense v2, Bing, IndexNow) 자격증명/API키를 vhk secure로 보관. 평문 커밋/로그 금지.
- 비대화형 플래그 지원(--yes 등), TTY 가드.
- 크로스플랫폼: 경로 path.join, 디렉터리 없으면 생성.

## Completion Check
- [ ] commands/seo/ 골격 + seo 라우터 + i18n/ko.ts 키
- [ ] `vhk seo init` → 사이트 등록 .vhk/seo/config.json 생성
- [ ] 5개 서비스 자격증명 vhk secure 보관, 평문 커밋/로그 0
- [ ] 비대화형/MCP/CI에서 프롬프트 없이 동작 (TTY 가드)
- [ ] secret 누출 0 (vhk secure scan)
- [ ] vhk goal sync → check-goal-21.mjs → vhk goal check --id 21 통과
- [ ] 공통 게이트 통과 (typecheck + test + build), 기존 회귀 0

## 제외 범위
- 실제 데이터 수집(Goal 23+) / HTML 리포트(Goal 25)
- OAuth 동의화면 자동화 → 필요시 후속

## Mandatory Reading
- src/commands/ (커맨드 라우팅 구조 파악 후 착수)
- vhk secure 구현 (키 보관 계약)
- src/i18n/ko.ts
- docs 또는 노션: vhk seo 풀 대시보드 설계문서
