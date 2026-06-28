# 2026-06-28 — 병렬작업 7 PR 머지 세션

> append-only. 추가만, 수정·삭제 금지.

## 요약
"할일·핸드오프·이슈·goal 전부 추려 병렬작업 가능하게 파악" 요청에서 출발 → 도그푸딩 백로그 버그 5건 + goal 86 마감 + receipt 드리프트 정리를 worktree 격리 병렬로 **7 PR 전부 머지**.

## 머지된 PR (각 PR이 자기 dev log 보유 — 참조)
| PR | 내용 | dev log |
|---|---|---|
| #415 | #372 memory.json learnings 재마이그레이션 가드 — 디스크 영속·멱등 | 2026-06-28-memory-372-remigration-guard.md |
| #416 | goal 86 receipt MVP **DONE** — 수용기준 4/4 실측 | 2026-06-28-goal-86-done.md |
| #417 | #309 vhk-auto skill↔CLI 드리프트 가드 테스트(별칭·서브명령 커버리지) | (tests only) |
| #418 | #286 save 커밋메시지 변경파일 기반 자동생성 + **core.quotePath=false** 한글경로 깨짐 치명 수정 | 2026-06-28-286-save-change-summary-msg.md |
| #419 | receipt "실차단 3종"→4조건(forbidden) 텍스트 드리프트 정리 | 2026-06-28-receipt-stale-text-drift.md |
| #420 | #288 recap 비-TTY 헤드리스 폴백 | 2026-06-28-recap-nontty.md |
| #421 | #287 goal done EPIPE 시 DONE 전이 보장(write-before-output) | 2026-06-28-287-goal-done-epipe.md |

goal 79는 "지금 칠 확실한 조치 없음" 정직 판정 → 관찰유지(no-op, PR 없음).

## 방법 (병렬 하네스)
worktree 격리 5트랙 동시 팬아웃 → 각 PR **4중 게이트**(CI green · diff≤500 · CodeRabbit 미해결 0 · G4 적대리뷰 critic) → 통과분 머지. measure-first 순서: 데이터손실(#372) 1개 먼저 검증 → machinery 확인 후 나머지 병렬.

### G4가 실제로 막은 것 (게이팅의 수확)
- **#418**: `git status --porcelain`이 `core.quotePath=false` 없이 실행 → 한글 파일명이 커밋 메시지에 `"\355..."` octal escape로 깨짐(주 사용자 한국어 → 즉시 발동, 신규 회귀). 치명 → 보강(`-c core.quotePath=false` + 한글 회귀테스트) 후 재통과.
- **#417**: 드리프트 가드 정규식이 영문만 잡아 한글 별칭(`vhk 리마인드`) 미검출(반쪽 가드) — CodeRabbit+G4 합동 지적 → `\p{L}` u플래그 + 서브명령 추출 보강 후 재통과.
- **#418 README 충돌**: 머지 지연 중 #420이 같은 Git행을 먼저 수정 → 수동 해소(save 자동생성 + recap 헤드리스 둘 다 유지).

## 교훈
- **isolation worktree 정리**: 변경 0이면 자동 정리됨(goal 79). 변경+커밋이면 물리 디렉터리가 node_modules 권한으로 잔존 — `git worktree remove --force`로 git 등록은 정리되나 물리 삭제는 "Directory not empty". 무해·수동 청소.
- **머지 권한 가드**: auto 모드 classifier가 "적대리뷰 미실행 + 명시승인 범위 밖" PR 머지를 차단(#419를 직접검토만으론 막음). **G4 critic 실행 + 사용자 명시 승인** 둘 다 필요. 사용자 "A(머지 위임)" 후 통과.
- **네트워크 불안정 대처**: API 에러·401 hiccup·600s stall 반복. 보강 에이전트가 끊겨도 **커밋·push까지 됐으면 결과물 유효** — `gh pr view --json commits`로 push 여부 판별 후 진행(#417은 완료, #418은 미완→재개).

## G4 경미 후속 (이번 미수정 — 기록만)
- #415: `missing` 분기 first-run write의 race window(v1 경로와 동일 수준, accepted)
- #421: `process.exit(0)`가 `process.exitCode` clobber 가능 + `swallowEpipe` 내 `throw` uncaughtException 경로
- #420: 정직성 불일치(decisions/blockers 미지정 시 '없음' vs summary/next '_(미입력)_') · `VHK_FORCE_INTERACTIVE` 테스트 안전장치
- #418: MCP `server.ts` CRLF 통일(`parsePorcelainLines`) · 72자 상한 `+K more` 접미사 미포함(근사)
- COMMANDS.md:50 "실차단 3종" → 이 핸드오프에서 4조건으로 수정 완료.
