# 다음 작업 (next-task)

> "지금 무엇부터"의 상태 SoT. 버전·테스트 등 사실값은 package.json·CHANGELOG가 SoT.

**갱신:** 2026-06-07
**Phase:** v2.4.2 발행 완료 — HARD_STOP 가드 완성(Goal 34~36·39·41) + 원자적 쓰기 완성(Goal 37~38·40). main `09e4b88`, 테스트 1035 pass.

## 다음 할 일
- **Goal 33 (`vhk today`) 마무리** — 현재 IN_PROGRESS(Phase 1만 머지 #162). Phase 2+ 완료 후 DONE 전이.
- **2.4.3 발행** — Goal 30(#139, DONE)·Goal 33·chore #168 이 npm 2.4.2 미포함(발행 베이스 이후 머지) → CHANGELOG [Unreleased] 적재됨. Goal 33 끝내고(또는 goal 2~3개 더 모아) 묶어 발행.
- 나머지 미완 goal 14개 (goals/ 동적 계산 — `vhk goal next`).

## 블로커
- 없음

## 주의
- publish는 항상 main에서만 (가드 #119) · 사용자가 직접(2FA)
- 직접 main push 차단됨(분류기) → 변경은 PR 경유 + `gh pr merge --squash`
- active goal 은 goals/ 기준 동적 계산 (vhk work / vhk goal next)
- (cosmetic) tag `v2.4.2` → `131e3c3` (npm tarball 정확 일치, goals 30/33 미포함). main release 커밋은 `09e4b88` — 발행 tag 이동 금지라 둠(v2.4.0 동류).
