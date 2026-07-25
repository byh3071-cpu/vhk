---
vhk_format: 1
type: goal
id: 104
title: autonomy-log → vhk stats 완주율 섹션 — P1
status: DONE
priority: P1
created: 2026-07-25
completed: 2026-07-25
leads_to: #373 분석의 최소 조각(표본 0 정직 표기) · Wave C 임계 N≥5
---

# Goal 104: autonomy stats

## 근거
goal 99가 스키마만 DONE. stats에 읽기전용 완주율 섹션이 없으면 표본을 매일 볼 수 없다.
표본 0을 0%로 위장하면 안 된다.

## 동작
- `calcAutonomyStats(readAutonomyLog(...))`
- `vhk stats` / `--trend` 에 자율 완주율 섹션

## Completion Check
- [x] calcAutonomyStats + 테스트
- [x] stats / `--trend` 렌더 (receipt 0이어도 자율 섹션)
- [x] check-goal-104 통과
- [x] 공통 게이트

## Mandatory Reading
- `src/lib/autonomy-log.ts` · `src/commands/stats.ts` · roadmap Wave C
