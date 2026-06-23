# 2026-06-23 — 도그푸딩 high 이슈 처리 시작 (#337/#338 undo 안전)

> 6-22 도그푸딩 배치(이슈 15개) 중 severity:high 부터. 1건씩 PR.

## 세션 시작 정리
- stale 원격 브랜치 7개 삭제(머지/대체분) · 로컬 main pull(d5895c6) · 임시파일(ledger·vitest-result) 정리.
- #347(goal 컨테이너 description peek 누락 — help 정합) fix → #351 머지·close.

## undo 안전 (#337 + #338, 한 PR)
- **#338 HARD_STOP 우회**: undo 가 `guardCliDefer`(가드 면제 함수)를 쓰는데 거기엔 `ensureNotHardStopped` 가 없어 HARD_STOP 활성 시에도 실행 경로 진입. resume(해제 명령)만 면제돼야 하므로 `action !== 'resume' && !ensureNotHardStopped(action)` 가드 추가(index.ts). → HARD_STOP 시 undo 차단 확인(E2E).
- **#337 non-TTY 크래시**: undo() 가 비대화형에서 number 프롬프트 호출 → `ERR_USE_AFTER_CLOSE` raw 스택트레이스. restore 패턴(isTTY 가드 + nonTtyHint)을 undo.ts 에 적용(+ ko.ts 메시지). high-risk 라 무인 default reset 대신 graceful 안내 후 종료. → 회귀 테스트 tests/undo.test.ts.
- **검증**: typecheck·build ✓ · E2E 3종(HARD_STOP+undo 차단 / non-TTY graceful / resume 면제 유지) · undo.test 6 pass.

## 발견 — resume exit 127 (별개 기존 버그, 이슈 등록)
- `vhk resume --confirm` 이 **exit 127 + HARD_STOP 미해제**(파일 안 지워짐). `git stash`로 내 변경 제거 후 **main 에서도 동일 재현** → 내 #337/#338 과 무관한 기존 버그.
- 정적 분석으로 원인 미상: runGuarded(approved→run 정상)·clearHardStop(rmSync import 정상)·isHardStopActive(ensureNotHardStopped 와 공유, 정상). resume() 제목 출력 후 silent exit 127 — 런타임 디버깅 필요.
- 영향: HARD_STOP 해제 경로가 깨짐(수동 `rm .vhk/HARD_STOP` 우회 가능). #338(차단)과 연쇄되나 별개 추적.
