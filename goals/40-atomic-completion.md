---
vhk_format: 1
type: goal
id: 40
title: 원자적 쓰기 완성 — goal.ts (next-task/scaffold/frontmatter) — P2
status: DONE
priority: P2
created: 2026-06-07
completed: 2026-06-07
---

# Goal 40: 원자적 쓰기 완성 — goal.ts 영속 쓰기

> 출처: 발행 전 적대검증(2026-06-07, atomic-completeness). Goal 37/38 이 ref/review/verify/sync/
> mission/state-files 를 atomic 화했으나, goal.ts 의 영속 쓰기가 남았다(자동재생성이라 저위험이나 완성).

## 배경
쓰기 도중 kill 시 부분 기록 → 다음 read/parse 실패. goal.ts 의 영속 쓰기를 atomicWriteFile(Goal 37 헬퍼)로 마저 적용.
- `goalNext` → docs/state/next-task.md
- `goalInit` → goals/_meta.md · docs/state/{next-task,blockers,learnings}.md (scaffold 첫 생성)
- `goalDone` → goal 파일 frontmatter status 갱신(updateFrontmatterStatus 후 쓰기)

## 동작 (atomicWriteFile 교체 — 동작/출력 불변)
- 위 3개 함수의 writeFileSync → atomicWriteFile.
- **제외**: goalSync 의 check-goal-*.mjs 생성 = 재생성 가능(idempotent backfill)이라 손상돼도 vhk goal sync 재실행 복구 → 저위험, 보류.

## Completion Check
- [x] goalNext/goalInit/goalDone 의 영속 쓰기가 atomicWriteFile 사용
- [x] 동작 회귀 0(기존 goal 테스트 + goal-hardstop 통과). 결과 파일 내용 동일
- [x] 회귀 가드 테스트(goal-atomic.test.ts: next/init/done 내용 + temp 잔여 0)
- [x] check-goal-40.mjs (import + 호출>=3 + 테스트존재) 통과
- [x] 공통 게이트 통과

## Mandatory Reading
- src/lib/atomic-write.ts (Goal 37 헬퍼)
- src/commands/goal.ts (goalNext/goalInit/goalDone)
- goals/37-atomic-writes.md (선행 패턴 + 제외 근거)
