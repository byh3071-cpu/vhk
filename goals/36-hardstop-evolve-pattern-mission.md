---
vhk_format: 1
type: goal
id: 36
title: HARD_STOP 가드 — evolve/pattern/mission mutate 명령 — P1
status: NOT_STARTED
priority: P1
created: 2026-06-07
leads_to: goal-37-atomic-writes
---

# Goal 36: HARD_STOP 가드 — evolve/pattern/mission

> 출처: 적대 스윕(2026-06-07). Goal 34/35 와 동일 결함의 나머지 mutate 명령(RULES.md·큐·미션 변경).

## 배경
- `evolveApply`(RULES.md append + sync)·`evolveReject`·`evolveUndo`(큐 변경) — 가장 위험(RULES.md 수정).
- `patternDismiss`(memory 패턴 상태 변경).
- `missionClear`(.vhk/mission.json 삭제).
모두 HARD_STOP 활성 시에도 실행됨.

## 동작 (최소 변경 — 가드만)
- 위 함수들 첫 줄에 `if (!ensureNotHardStopped('evolve apply'|...)) return`.
- `context` 명령은 이번 범위 제외 — 자동생성 + work/메뉴가 내부 호출(가드 시 work 흐름과 충돌). 별도 판단.
- 조회 명령(evolveList/patternList/missionShow)은 제외.

## Completion Check
- [ ] evolveApply/evolveReject/evolveUndo/patternDismiss/missionClear 모두 HARD_STOP 시 중단
- [ ] HARD_STOP 없으면 기존 동일(회귀 0). evolveApply 의 TTY 확인 흐름 무손상
- [ ] 회귀 가드 테스트(대표 1~2개: evolveApply·missionClear)
- [ ] vhk goal sync → check-goal-36.mjs → check --id 36 통과
- [ ] 공통 게이트 통과

## Mandatory Reading
- src/lib/hard-stop-guard.ts
- src/commands/evolve.ts · src/commands/pattern.ts · src/commands/mission.ts
- goals/34-hardstop-goal-cmds.md (선행 패턴)
