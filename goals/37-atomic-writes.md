---
vhk_format: 1
type: goal
id: 37
title: 원자적 쓰기 헬퍼 — 상태/리포트 파일 (ref/sync/review) — P2
status: DONE
priority: P2
created: 2026-06-07
completed: 2026-06-07
---

# Goal 37: 원자적 쓰기 헬퍼

> 출처: 적대 스윕(2026-06-07, exec-fs 각도). 상태/리포트 파일을 writeFileSync 로 바로 덮어써,
> 쓰기 도중 프로세스 kill 시 파일이 부분 기록(손상)될 수 있다. 트리거는 희박하나 데이터 손실 방지.

## 배경
- `src/commands/ref.ts` (refs.json) · `src/commands/sync.ts` (.synced 마커) · `src/commands/review.ts`
  (latest.json merge-write) 가 비원자 writeFileSync. 중간 kill → 다음 readCache/parse 가 손상 파일에 실패.

## 동작 (공유 헬퍼 + 적용)
- `src/lib/atomic-write.ts` 신규: `atomicWriteFile(path, data)` = 같은 디렉터리 temp 파일에 쓰고 `fs.renameSync`
  로 교체(rename 은 원자적). 실패 시 temp 정리.
- 영속 상태 쓰기를 atomicWriteFile 로 교체(동작/출력 불변): ref.ts(refs.json) · review.ts·verify.ts(latest.json — 같은 파일이라 둘 다 일관 적용 + verify HTML) · sync.ts(.synced 마커).
- sync 미러 파일(.cursorrules 등)은 재생성 가능이라 제외 — 코드에 근거 주석 명시.
- mission.json·HARD_STOP·blockers 등 나머지 영속 상태 쓰기는 Goal 38 로 분리(스킵 아님, 작은 단위 계획).
- atomicWriteFile temp 명에 process.pid + 단조 카운터 — 동일 파일 동시 호출 temp 충돌 방지(적대검증 반영).

## Completion Check
- [ ] atomicWriteFile 단위 테스트(정상 교체 + temp 정리 + 동일 내용)
- [ ] ref/sync/review 3곳 적용, 동작 회귀 0
- [ ] vhk goal sync → check-goal-37.mjs → check --id 37 통과
- [ ] 공통 게이트 통과

## Mandatory Reading
- src/commands/ref.ts · src/commands/sync.ts · src/commands/review.ts (대상 writeFileSync)
- src/lib/state-files.ts (기존 상태파일 쓰기 패턴 참고)
