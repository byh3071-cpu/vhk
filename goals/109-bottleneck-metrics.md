---
vhk_format: 1
type: goal
id: 109
title: 병목 계측 3종 — 사람 대기·기계적 승인 비율·추적 시간 (B3)
status: NOT_STARTED
priority: P1
created: 2026-07-27
leads_to: D2 조건(b) "수동 병목 입증"의 4주 실측 재료 — 딥리서치 결정 2
---

# Goal 109: 병목 계측 3종 (B3)

## 근거
딥리서치 결정 2: 병목의 실체 = 생성이 아니라 리뷰·판단("Review is the ceiling" — 에이전트 PR 79%를 한 사람이 처리). 단 병목이 리뷰가 아니라 '추적'일 수 있음 — 셋 다 재야 오진 방지. 폐기 런 비용 계측은 업계 사각(공개 사례 0) = 차별 데이터.

## 동작
- autonomy-log에 3필드: ①사람 대기시간(PR ready→오너 첫 액션) ②기계적 승인 여부(내용 안 보고 승인) ③추적 시간(PR 찾고 상태 파악)
- +폐기 런 비용(토큰) 기록 — overnight 계약과 연동
- 판정식(제안값, 오너 조정 가능): 4주 롤링 중앙값 대기 > 48h AND 아침 큐 이월 ≥3건 반복 = 병목 입증
- 기계적 승인 비율이 과반이면 그 레인만 자동화 후보 — 전면 자동화 근거로 확대 해석 금지

## Completion Check
- [ ] 스키마 3+1필드 + 아침 3문답에 추적 시간 1문항
- [ ] stats에 병목 섹션(표본 0 정직 표기)
- [ ] check-goal-109 (스캐폴드)
- [ ] 공통 게이트

## Mandatory Reading
- docs/adr/ADR-008 · goals/108 · docs/runbooks/MORNING_AUTONOMY_MERGE.md · yohan-brain research 2026-07-27 결정 2
