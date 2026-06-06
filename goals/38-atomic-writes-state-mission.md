---
vhk_format: 1
type: goal
id: 38
title: 원자적 쓰기 확대 — mission.json + state-files (HARD_STOP/blockers) — P2
status: NOT_STARTED
priority: P2
created: 2026-06-07
---

# Goal 38: 원자적 쓰기 확대 — 나머지 영속 상태 파일

> 출처: Goal 37 머지 전 적대 검증(2026-06-07). Goal 37 이 ref/review/verify/sync(.synced)만 atomic 화 →
> 동일 손상 위험인 나머지 영속 상태 쓰기(mission/HARD_STOP/blockers)를 작은 단위로 분리해 마저 처리.
> (스킵이 아니라 명시적 후속 계획 — 적대검증 지적 반영.)

## 배경
쓰기 도중 프로세스 kill 시 부분 기록(손상) → 다음 read/parse 실패. Goal 37 의 `atomicWriteFile` 헬퍼를
나머지 영속 상태 파일 쓰기에도 적용한다.

## 대상 (전체 덮어쓰기만 — append 는 제외)
- `src/commands/mission.ts` — `.vhk/mission.json` 쓰기(missionSet). 손상 시 mission check 실패.
- `src/lib/state-files.ts` — `writeHardStop`(.vhk/HARD_STOP 전체 쓰기) + blockers.md **첫 생성** writeFileSync.
  - 주의: blockers 의 `appendFileSync`(이어쓰기)는 끝에 추가라 손상 위험 낮음 + atomic 부적합 → 제외.
- (검토) memory.json/next-task.md 는 별도 — 이미 백업(.bak)·재생성 메커니즘 있어 후속 판단.

## Completion Check
- [ ] mission.json·HARD_STOP·blockers 첫 생성이 atomicWriteFile 사용(append 는 그대로)
- [ ] 동작 회귀 0(기존 테스트 통과). state-files/mission 테스트 mock 정합(atomic-write mock)
- [ ] vhk goal sync → check-goal-38.mjs → check --id 38 통과
- [ ] 공통 게이트 통과

## Mandatory Reading
- src/lib/atomic-write.ts (Goal 37 헬퍼)
- src/lib/state-files.ts · src/commands/mission.ts (대상)
- goals/37-atomic-writes.md (선행 — 적용 패턴 + 제외 근거)
