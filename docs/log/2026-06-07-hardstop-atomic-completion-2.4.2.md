# 2026-06-07 — HARD_STOP 가드 완성 + 원자적 쓰기 완성 → v2.4.2 발행

> dev log = append-only. 추가만, 수정·삭제 금지.

## 한 일
- **Goal 39** (#163) — 나머지 상태쓰기 명령 HARD_STOP 가드: `design`·`theme`·`env`·`refAdd`·`cloudPush`.
  - 후속 핫픽스 **#164** — 가드 라벨이 머지 과정서 camelCase(`cloudPush`/`refAdd`)로 오염 + 주석 누락 → 공백 컨벤션(`cloud push`/`ref add`)으로 복구(check-goal-39 게이트 실패 유발했던 것).
- **Goal 40** (#165) — `goal.ts` 영속 쓰기(goalNext/goalInit/goalDone) `writeFileSync` → `atomicWriteFile`. 원자적 쓰기 시리즈 완성.
- **Goal 41** (#166) — MCP 서버 surface HARD_STOP 가드: `save`·`undo`·`env`(CLI guardCli 우회 인라인 핸들러). MCP용 `hardStopBlocked` 헬퍼 신설(console 미사용 — stdio JSON-RPC 오염 방지, content 반환).
- **정리** (#167) — 도그푸드 샌드박스 `vhk-*/`(~48k files) + orphan check-goal 스크립트 삭제, `.vhk/mission.json` gitignore, mission 테스트 타임아웃.
- **v2.4.2 발행** — 사용자 직접 npm publish. git 동기화(CHANGELOG 본문 + version bump)는 **#169** PR 로.

## 교훈
- **워크플로 적대검증 에이전트가 실제 소스를 손상**: worktree 격리 없는 검증 에이전트가 가드를 임시 제거→복원하며 부정확 복원(라벨/주석 변경). 내 무결성 체크가 `grep -c`(개수)라 내용 변경을 못 잡음 → 커밋·머지까지 흘러감. **교훈: 검증 에이전트는 `isolation:'worktree'` 또는 직접 수행, 커밋 전 `git diff` 내용 육안 확인.** (read-only `cavecrew-reviewer` 로 전환 후 재발 0.)
- **MCP stdio 가드는 console 금지**: CLI `ensureNotHardStopped`(console.error+exitCode)를 MCP 에 쓰면 JSON-RPC 채널 오염 → content 반환형 헬퍼 별도 신설.
- **동시 머지 중 발행 동기화**: 발행 중 origin/main 이 병렬로 계속 이동(#139·#162·#168) + 직접 main push 차단(분류기) → release 커밋을 최신 main 위로 rebase + PR 경유. npm tarball 은 발행 베이스 스냅샷이라 이후 머지분 미포함(다음 릴리즈로).
- **tag 정확도 vs main 일관성**: tag `v2.4.2`→`131e3c3`(npm tarball 정확 일치) 유지, main release 커밋(`09e4b88`)과 분리. 발행된 tag 이동 금지(v2.4.0 동류 cosmetic).

## 검증
- 발행본 tarball grep: `ensureNotHardStopped` 26 + `hardStopBlocked` 4(chunk) + `atomicWriteFile`/`renameSync` 13 → 작업 전부 포함 확인.
- 메인 스위트 1035 pass (vhk-* 제외). 각 머지 전 read-only 적대리뷰 발견 0.

## 다음
- Goal 33(`vhk today`) 마무리(IN_PROGRESS) → 2.4.3 발행(Goal 30/33/#168 포함).
