---
vhk_format: 1
type: goal
id: 35
title: HARD_STOP 가드 — memory 명령군 (add/remove/archive/resolve/unarchive) — P1
status: DONE
priority: P1
created: 2026-06-07
completed: 2026-06-07
leads_to: goal-36-hardstop-evolve-pattern-mission
---

# Goal 35: HARD_STOP 가드 — memory 명령군

> 출처: 적대 스윕(2026-06-07). Goal 34 와 동일 결함의 memory.ts 판 — 기억(.vhk/memory.json)을
> 바꾸는 명령들이 HARD_STOP 활성 시에도 실행됨.

## 배경
`memoryAdd`/`memoryRemove`/`memoryArchive`/`memoryResolve`/`memoryUnarchive` 가 가드 없이
memory.json 을 변경. HARD_STOP 중에도 기억이 쓰이거나 삭제됨.

## 동작 (최소 변경 — 가드만)
- 위 5개 함수 첫 줄에 `if (!ensureNotHardStopped('memory add'|...)) return`.
- `memoryList`/`memoryMigrate` 는 제외(list=읽기 / migrate=복구성 — 별도 판단).
- import ensureNotHardStopped (기존 헬퍼).

## Completion Check
- [ ] 5개 mutate 명령 모두 HARD_STOP 활성 시 즉시 중단(memory.json 미변경)
- [ ] HARD_STOP 없으면 기존 동일(회귀 0)
- [ ] 회귀 가드 테스트: HARD_STOP 존재 시 memoryAdd 가 memory.json 안 씀
- [ ] vhk goal sync → check-goal-35.mjs → check --id 35 통과
- [ ] 공통 게이트 통과

## Mandatory Reading
- src/lib/hard-stop-guard.ts
- src/commands/memory.ts (mutate 함수들 + loadForMutation 위치)
- goals/34-hardstop-goal-cmds.md (동일 패턴 선행 goal)
