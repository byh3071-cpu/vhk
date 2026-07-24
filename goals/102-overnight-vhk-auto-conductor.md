---
vhk_format: 1
type: goal
id: 102
title: overnight-vhk-auto conductor (스킬+런북 배선) — P1
status: DONE
priority: P1
created: 2026-07-25
completed: 2026-07-25
leads_to: 밤마다 goal 1장 → commit(vhk-auto) → push+PR(wrapper) · 머지 0
---

# Goal 102: overnight-vhk-auto conductor

## 근거
vhk-auto INV-7 은 commit만 허용. overnight 래퍼가 green+commit 후 `auto_pr_goal.ps1`로
PR만 연다. overnight-autoloop(결함루프)와 혼용 금지.

## 동작
- 스킬: 큐에서 goal 1장 IN_PROGRESS → vhk-auto 계약 → green+commit → auto_pr_goal
- autonomy-log 누락 시 HARD_STOP
- 런북과 교차 링크

## Completion Check
- [x] `.claude/skills/overnight-vhk-auto/SKILL.md` 존재 + BaseBranch main / 머지 금지 / HARD_STOP
- [x] 런북 교차 링크
- [x] check-goal-102 통과
- [x] 공통 게이트 (_meta)

## Mandatory Reading
- RFC 0063 · `docs/runbooks/overnight-vhk-auto.md` · vhk-auto SKILL
