---
vhk_format: 1
type: goal
id: 103
title: autonomy overnight morning report 생성기 — P1
status: DONE
priority: P1
created: 2026-07-25
completed: 2026-07-25
leads_to: 아침 머지 3문답 전 요약(PR URL · runId · counts)
---

# Goal 103: morning report

## 근거
밤새 런 결과를 사람이 아침 3문답으로 머지하려면 한 장 요약이 필요하다.

## 동작
- `docs/audits/autonomy-overnight-<date>.md` 템플릿 + 헬퍼
- 필드: PR URL, runId, complete/hardstop/blocked 카운트

## Completion Check
- [ ] 헬퍼/템플릿 존재
- [ ] check-goal-103 통과
- [ ] 공통 게이트

## Mandatory Reading
- `docs/runbooks/MORNING_AUTONOMY_MERGE.md` · autonomy-log
