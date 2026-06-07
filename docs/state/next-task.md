# 다음 작업 (next-task)

> "지금 무엇부터"의 상태 SoT. 버전·테스트 등 사실값은 package.json·CHANGELOG가 SoT.

**갱신:** 2026-06-08
**Phase:** v2.4.2 발행 완료 + Goal 33(`vhk today`) v0 완료(#179). HARD_STOP 가드 완성(34~36·39·41) + 원자적 쓰기 완성(37~38·40) + today 회고. 테스트 1035+ pass. + 드리프트 교정(19/31/32 status→DONE).

## 다음 할 일
- **P0~P2 self-gate 백로그 순차 착수** — Goal 42(릴리즈 준비 게이트, P0) → 43(드리프트 게이트) → 44(SHA 바인딩) → 45(증거 원장) → 46/28/27 → SEO(21~26).
- **2.4.3 발행 (대기 — 더 모으는 중)** — Goal 30(#139)·Goal 33(#162/#179)·chore #168 이 npm 2.4.2 미포함(발행 베이스 이후 머지) → CHANGELOG [Unreleased] 적재됨. goal 몇 개 더 모아 묶어 발행 예정.
- 나머지 미완 goal (goals/ 동적 계산 — `vhk goal next`).

## 드리프트 교정 기록 (2026-06-08)
- Goal 19(pattern)·31(doctor 엔진)·32(standup) = 코드+테스트 다 있고 게이트 통과인데 frontmatter status 가 NOT_STARTED/IN_PROGRESS 로 남아있던 드리프트 → status DONE + completed 2026-06-08 + completion 박스 체크.
- 19 = v2.1.0 발행·문서화 완료 / 31(#144)·32(#146) = v2.4.2 tag(131e3c3)에 포함돼 npm 발행됐으나 2.4.2 CHANGELOG 누락 → [2.4.2] 섹션에 사후 보강. (이게 바로 Goal 42/43 가 막을 케이스)

## 블로커
- 없음

## 주의
- publish는 항상 main에서만 (가드 #119) · 사용자가 직접(2FA)
- 직접 main push 차단됨(분류기) → 변경은 PR 경유 + `gh pr merge --squash`
- active goal 은 goals/ 기준 동적 계산 (vhk work / vhk goal next)
- (cosmetic) tag `v2.4.2` → `131e3c3` (npm tarball 정확 일치, goals 30/33 미포함). main release 커밋은 `09e4b88` — 발행 tag 이동 금지라 둠(v2.4.0 동류).
