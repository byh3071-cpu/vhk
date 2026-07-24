---
vhk_format: 1
type: goal
id: 101
title: 글로벌 vhk-auto ↔ 레포 SoT 동기화 (INV-9) — P1
status: DONE
priority: P1
created: 2026-07-25
completed: 2026-07-25
leads_to: overnight conductor(102)가 INV-9 누락 글로벌 스킬로 돌지 않게 함
---

# Goal 101: vhk-auto skill sync

## 근거
레포 `.claude/skills/vhk-auto/SKILL.md` 에 INV-9(autonomy-log)가 있으나 글로벌
`~/.claude/skills/vhk-auto/` 복제본은 INV-9 누락 → overnight/에이전트가 글로벌을
읽으면 완주율 계측이 빠진다.

## 동작
- 레포 SoT → 글로벌 경로로 복사
- 로드맵/런북에 "스킬 SoT=레포, 글로벌=복제본" 1줄 유지

## Completion Check
- [x] 글로벌 SKILL.md 가 레포 SoT 와 내용 동일(INV-9 포함)
- [x] check-goal-101 통과
- [x] 공통 게이트 (goals/_meta.md)

## Mandatory Reading
- `.claude/skills/vhk-auto/SKILL.md` · `docs/roadmap/autonomy-evolution.md`
