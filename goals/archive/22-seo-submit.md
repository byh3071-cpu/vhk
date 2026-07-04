---
vhk_format: 1
type: goal
id: 22
title: vhk seo submit (사이트맵 + IndexNow) — P2
status: DONE
completed: 2026-06-20
priority: P2
version: v2.4.1
---

# Goal 22: vhk seo submit

> 출처: vhk seo 풀 대시보드 설계문서 Phase 2. 전제: Goal 21(init/config) 완료.
> 색인 촉진 — 사이트맵 제출과 IndexNow 핑을 한 방에.

## 배경
새 페이지를 올려도 구글·빙·네이버가 크롤하기까지 수일~수주 걸린다.
`vhk seo submit`은 사이트맵을 GSC·Bing에 제출하고 IndexNow 한 방 핑으로
빙·네이버·얀덱스에 동시에 색인 알림을 보내 이 대기시간을 최소화한다.
구글 Indexing API는 채용공고·라이브영상 전용이라 일반 페이지에 쓰면 페널티 — 사용 금지.

## 철학
① IndexNow 하나로 빙·네이버·얀덱스 동시 커버 — 코드 최소화 ② 구글 Indexing API 사용 금지(가드/주석 명시) ③ 실패시 exit≠0 + 친절 에러 ④ 비대화형 1급.

## 동작 (파일·계약)
- `vhk seo submit`: .vhk/seo/config.json의 사이트맵 URL을 GSC + Bing API에 제출.
- IndexNow 키파일 생성/검증 후 한 방 핑 → 빙·네이버·얀덱스 동시.
- 결과를 .vhk/seo/ 로그(제출 시각·응답코드).
- 구글 Indexing API 사용 금지(일반페이지 페널티) — 가드/주석 명시.
- 비대화형/MCP/CI 프롬프트 없이 동작.

## Completion Check
- [ ] `vhk seo submit` → 사이트맵 GSC+Bing 제출 성공
- [ ] IndexNow 키파일 생성/검증 + 핑 전송 (빙·네이버·얀덱스)
- [ ] 구글 Indexing API 미사용 (일반페이지 즉시색인 시도 0 — 가드)
- [ ] 실패시 exit≠0 + 친절한 에러, 키/응답 로그에 secret 0
- [ ] 비대화형/MCP/CI 프롬프트 없이 동작
- [ ] vhk goal sync → check-goal-22.mjs → vhk goal check --id 22 통과
- [ ] 공통 게이트 통과 (typecheck + test + build), 기존 회귀 0

## 완료 처리 정정 (2026-07-03, 실전재검증 감사 중 발견)

Completion Check 7개가 전부 `[ ]` 미체크인 채로 `status: DONE`이었다 — RFC 0054(2026-06-20, "VHK는 자문형 — 외부 실행 0, 사람이 최종 버튼")가 이 goal의 완료 범위를 재정의했는데 그 근거가 이 파일 자체엔 안 적혀 있었다. 실측 재확인 결과:

- **실제로 된 것**: IndexNow 키 생성/검증/로컬 저장(순수 파일 I/O), 페이로드 객체 빌드, 구글 Indexing API 미사용 가드(`tests/seo-submit.test.ts`가 소스에 `indexing.googleapis.com` 호출 없음을 정규식으로 실증), 비대화형 동작, HARD_STOP 가드(#336).
- **아직 안 된 것(RFC 0054 §7에 따라 D2 실행력 단계로 이관, 무인 배치 범위 밖)**: GSC/Bing 사이트맵 실제 HTTP 제출, IndexNow 실제 핑(HTTP POST) — `submit.ts`에 `fetch`/`axios` 호출 0줄. 자격증명이 있어도 "운영 단계에서 활성화됩니다"라고 안내만 하고 실행 안 함(의도된 설계).
- 위 Completion Check 박스는 이 재정의를 반영해 다시 안 고친다(과거 이력 append-only 원칙) — 이 섹션이 정확한 현재 상태.

## 제외 범위
- 색인 결과 조회(Goal 23) / 다음·카카오 제출(확장 슬롯)

## Mandatory Reading
- Goal 21 config/secure 계약
- IndexNow 프로토콜(키파일 방식) 공식 문서
- GSC Sitemaps API + Bing Webmaster API 사이트맵 제출
- 설계문서 "서비스별 할 수 있는 것" 표 (Indexing API 함정 주의)
