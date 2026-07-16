# 2026-07-16 — Orca ADE 탭 스크롤 + 세션 마감

## 지금까지 한 것
- Orca ADE 상단 탭 전환 시 메인 터미널 스크롤이 맨 위로 가는 문제 재현·원인 확정 (`display: none` → xterm viewport 0).
- 수정: intra-worktree 탭 숨김을 `opacity: 0` 레이아웃 유지로 변경 + legacy `Terminal.tsx` 에디터/브라우저 park 동일 처리.
- 업스트림 PR: https://github.com/stablyai/orca/pull/8968 (`byh3071-cpu/orca` fork, branch `fix/tab-switch-preserve-terminal-scroll`).
- 메인테이너(nwparker) 코멘트: "Might be some perf concerns" — 미머지(OPEN). 사용자 선택 = 업데이트 대기(답글/로컬빌드 보류).
- (같은 날 선행) yohan-cc-skills `/handoff` 채팅 종료 검증·workflow 0.3.4 — 별도 레포 로그: `yohan-cc-skills/docs/log/2026-07-16-handoff-session-end-verify.md`.
- (같은 날 선행) Cursor Agent Lazyweb MCP 콘솔 팝업 → `node` 런처로 수정 완료(`~/.cursor/mcp.json`).

## 핵심 결정
- vhk 설정만으로는 ADE 스크롤 버그 불가 → stablyai/orca 업스트림 수정 필요.
- 성능 우려 댓글에 대해 당장 추가 패치/답글 안 함 → 릴리즈 대기.

## 다음 할 일
1. Orca PR #8968 머지·릴리즈 감시 → 설치본 업데이트 후 탭 전환 스크롤 재확인.
2. (선택) 성능 우려에 답글: cold-park 30s 언마운트 유지·축소안 제안.
3. VHK 본선: next-task 사람 큐(#455 종결·G3 육안·GTM) / AI 큐(GTM 준비·T6).

## 산출물 포인터
- 진입점: https://github.com/stablyai/orca/pull/8968
- 로컬 fork: `C:\Users\Public\dev\vendor\orca` @ `fix/tab-switch-preserve-terminal-scroll`
- 핵심 파일: `terminal-tab-visibility-style.ts` · `TerminalPane.tsx` · `TerminalPaneOverlayLayer.tsx` · `Terminal.tsx`
