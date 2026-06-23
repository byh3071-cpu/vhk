---
vhk_format: 1
type: goal
id: 26
title: vhk seo 자동화 (Notion 적재 + 스케줄러 + 확장슬롯) — P2
status: DONE
completed: 2026-06-20
priority: P2
version: v2.5.1
---

# Goal 26: vhk seo 자동화

> 출처: vhk seo 풀 대시보드 설계문서 Phase 6. 전제: Goal 25(report) 완료.
> 자동화 계층 — report 결과를 Notion에 적재하고 스케줄러로 주기 실행, 확장 슬롯 자리를 둔다.

## 배경
`vhk seo report`가 HTML을 만들어도 주기적으로 실행되지 않으면 수동 도구와 다를 게 없다.
report 요약을 Notion Dev Log에 적재해 히스토리를 남기고,
Windows 작업 스케줄러로 submit+check+report 체인을 자동화한다.
확장 슬롯(다음/카카오·GBP)은 어댑터 인터페이스 자리만 비워둔다. 얀덱스는 IndexNow에 이미 포함.

## 철학
① SoT Key 멱등 동기화 — 재실행해도 중복 없음 ② 스케줄러는 비대화형으로(프롬프트 없이) ③ 확장 슬롯은 자리만, 구현은 후속 ④ secret은 vhk secure로만.

## 동작 (파일·계약)
- `vhk seo report`(또는 별도 subcommand) 결과 요약을 Notion Dev Log에 적재 (SoT Key 멱등 동기화).
- Windows 작업 스케줄러 등록 도우미/문서 (submit+check+report 체인).
- 확장 슬롯 어댑터 인터페이스 정의:
  - 얀덱스: IndexNow에 이미 포함(자동), 별도 코드 X
  - 다음/카카오·GBP: 인터페이스 자리만 (구현은 후속)
- 비대화형/CI 동작.

## Completion Check
- [ ] report 결과 Notion Dev Log 적재, SoT Key로 재실행 시 중복 0(멱등)
- [ ] 스케줄러 도우미/문서로 submit+check+report 체인 자동화
- [ ] 확장 슬롯 인터페이스 정의(얀덱스 자동 커버 확인, 나머지 자리만)
- [ ] Notion 적재 내용·로그에 secret 0
- [ ] 비대화형/CI 동작(스케줄러는 프롬프트 없이)
- [ ] vhk goal sync → check-goal-26.mjs → vhk goal check --id 26 통과
- [ ] 공통 게이트 통과 (typecheck + test + build), 기존 회귀 0

## 제외 범위
- 다음/카카오·GBP 실제 구현(v2 슬롯) / 양방향 동기화
- Notion 실시간 watch 모드

## Mandatory Reading
- src/notion/ 적재 어댑터 + SoT Key 멱등 패턴 (기존 Notion 연동 코드)
- vhk cloud 또는 스케줄러 관련 선례
- 설계문서 "확장 슬롯" 섹션
