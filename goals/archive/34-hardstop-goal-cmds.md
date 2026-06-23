---
vhk_format: 1
type: goal
id: 34
title: HARD_STOP 가드 — goal 명령군 (next/done/init) — P1
status: DONE
priority: P1
created: 2026-06-07
completed: 2026-06-07
leads_to: goal-35-hardstop-memory
---

# Goal 34: HARD_STOP 가드 — goal 명령군

> 출처: 적대 스윕(2026-06-07, state-append 각도). recap 은 `ensureNotHardStopped` 가드가 있는데(VHK-020)
> goal 명령군엔 누락 — HARD_STOP(모든 자동화 중단) 활성 시에도 상태파일을 변경하는 일관성 결함.

## 배경
HARD_STOP = 블로커 3건 누적/토큰초과 시 "모든 자동화 즉시 중단" 신호(.vhk/HARD_STOP). 그런데
`goalNext`(next-task.md 갱신)·`goalDone`(goal status 전이)·`goalInit`(scaffold)은 가드 없이 실행돼
HARD_STOP 을 무력화한다. vhk work 가 진입 게이트지만, 개별 명령 직접 실행 경로는 무방비.

## 동작 (최소 변경 — 가드만, 출력/로직 불변)
- `goalNext`/`goalDone`/`goalInit` 각 함수 첫 줄에 `if (!ensureNotHardStopped('goal next'|'goal done'|'goal init')) return`.
- `import { ensureNotHardStopped } from '../lib/hard-stop-guard.js'` (기존 헬퍼 재사용 — recap 선례).
- `goalList`/`goalCheck`(읽기·검증)는 가드 제외 — 상태 변경 아님.

## Completion Check
- [ ] goalNext/goalDone/goalInit 셋 다 HARD_STOP 활성 시 즉시 중단(상태파일 미변경)
- [ ] HARD_STOP 없으면 기존과 동일 동작(회귀 0)
- [ ] 회귀 가드 테스트: `.vhk/HARD_STOP` 존재 시 goalNext 가 next-task.md 안 씀 검증
- [ ] vhk goal sync → check-goal-34.mjs → vhk goal check --id 34 통과
- [ ] 공통 게이트(typecheck+test+build) 통과, 기존 회귀 0

## Mandatory Reading
- src/lib/hard-stop-guard.ts (ensureNotHardStopped 계약)
- src/commands/recap.ts:19 (가드 선례 — VHK-020)
- src/commands/goal.ts (goalNext/goalDone/goalInit)
