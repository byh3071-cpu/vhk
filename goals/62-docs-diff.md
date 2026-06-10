---
vhk_format: 1
type: goal
id: 62
title: docs-first 작업 의례 — 문서 선행 갱신 + docs-diff 산출물 (자문형) — P2
status: NOT_STARTED
priority: P2
created: 2026-06-11
leads_to: 스펙-코드 드리프트 사전 차단 · RFC 0051(사후 감지)의 사전 보완
---

# Goal 62: docs-first + docs-diff

> 출처: 하네스 엔지니어링 사례 연구(2026-06-11) — mafia-codereview-harness 구조 분석 + 바이브마피아 영상. "모든 작업의 1단계 = 문서 갱신, 변경된 줄만 발췌한 docs-diff 산출물을 후속 단계가 참조."

## 근거
- vhk의 문서 환류는 전부 **사후형**: RFC 0051(doc-capture-wiring)은 handoff 시 미기록 ADR/TS 후보를 감지(작업이 끝난 뒤), dev log도 세션 종료 시 기록 — 작업 **도중** 스펙 앵커가 없음.
- 스펙(goals/RFC/README)이 안 바뀐 채 코드부터 변경되면 에이전트가 계획을 제멋대로 해석해 스펙과 어긋나게 구현할 위험 — 외부 사례는 이를 "1단계 문서 강제 + 변경 줄 발췌 참조"로 차단.
- 발췌(docs-diff)의 효용: 문서가 커질수록 "이 문서들 바뀌었어" 수준 언급은 불충분 — 추가/삭제된 줄만 강조해야 후속 구현·리뷰가 정확히 참조함.

## 동작 (기안 — 구현 착수 시 ADR로 포맷·트리거 확정)
- 작업 시작 의례(`vhk mission set` 또는 `vhk work`)에 "이 작업으로 바뀌어야 할 문서" 질문 단계 추가 — **자문형, 차단 0** (measure-first).
- 문서 변경분을 `.vhk/docs-diff/{branch}.md`로 발췌 기록(파일·줄 번호·추가/삭제 내용) → 이후 구현·리뷰 단계가 이 파일을 참조.
- RFC 0051 사후 감지와 짝: 사전(docs-diff 작성 여부) + 사후(미기록 ADR/TS 후보) 양방향 대조.

## 수용 기준
- 실제 작업 1건에서 docs-diff 산출물이 생성되고, 후속 리뷰가 이를 근거로 인용 (도그푸딩 1회 필수).
- 차단 게이트 아님(자문형) — 강제 전환은 실측 누적이 정당화한 뒤 별도 결정.

## Completion Check
- [ ] 동작 설계 ADR 작성 (.vhk/docs-diff 포맷 · 트리거 시점 · RFC 0051 연계)
- [ ] 구현 (커맨드 신설 시 한국어 별칭 + ko.ts + nlp-router 키워드 필수)
- [ ] 도그푸딩 1회 — 실제 작업에서 산출물 생성·참조 확인
- [ ] 공통 게이트 통과 (goals/_meta.md)

## Mandatory Reading
- docs/rfc/0051-doc-capture-wiring.md · src/commands/work.ts · src/commands/mission.ts · goals/_meta.md
