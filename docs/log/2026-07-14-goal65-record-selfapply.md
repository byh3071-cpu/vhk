# 2026-07-14 — goal 65 종결: L2 기록 집행 커밋훅 (RFC 0061 record-net 자가적용)

> vhk 레포가 자기 자신에게 도구 무관 기록 집행을 건다. goal 65(pre-commit L2 조건부) DONE.

## 격차 (실측)
vhk 레포는 `.claude/settings.json` PreToolUse → `check-records.mjs --hook` = **Claude Code 전용**. git commit-msg 훅 없음, `.githooks/` 없음, `core.hooksPath` 미설정(실측 확인). → **비-Claude 커밋(Cursor/Codex/터미널)이 기록 집행 우회**. 이게 goal 65 잔여 격차 = 에이전트 불가지론 격차와 같은 뿌리. Cursor 트리거 온보딩(#504)으로 경로 3(다른 에이전트)이 구체화되며 착수 트리거 충족.

## 무엇을 했나
- `scripts/check-records.mjs` — `--commit-msg-file <path>` 분기(`commitMsgMode`) 추가. **`evaluateRecords` 순수부 불변**(SoT 유지), IO만 확장:
  - git 이 커밋 메시지 파일을 $1 로 넘김 → 그 **내용**에서 `[skip-record]` 판정(파일 경로 아님).
  - **merge/cherry-pick/revert/rebase 화이트리스트 필수** — commit-msg 는 PreToolUse 와 달리 merge 커밋에도 발동 → 없으면 `git pull` 분기 merge 시 커밋 차단으로 사용자가 MERGE_HEAD 에 갇힘(RFC 0061 record-check 동일 가드).
- `.githooks/commit-msg`(신규, committed, **LF 고정**) — `node scripts/check-records.mjs --commit-msg-file "$1"` 호출. fail-open(node 부재·스크립트 부재 시 통과).
- `.gitattributes` — `.githooks/commit-msg text eol=lf`(확장자 없어 `*.sh` 규칙에 안 걸림 → CRLF 셔뱅 방지 명시).
- `package.json` — `hooks:install: git config core.hooksPath .githooks`(기여자 1회 활성, 재현용).
- `scripts/check-goal-65.mjs` — 스텁 → 실 게이트(고유검증 5: shim·commit-msg 모드·MERGE_HEAD 가드·[skip-record]·hooks:install).
- goal 65 카드 DONE + Completion Check 충족 기록. goals/README 재생.

## 설계 결정
- **pre-commit 아닌 commit-msg**: 카드 원안은 pre-commit 이나 [skip-record] 는 커밋 메시지 접근 필요 → pre-commit 은 메시지를 못 봄. commit-msg 가 정답(RFC 0061 동일 결론).
- **check-records 재사용(RFC 0061 record-check 신규 이식 아님)**: vhk 레포의 자기 규칙(CODE_GLOBS = src/** + scripts/check-*)을 SoT 1개로 유지. record-check 템플릿(src/** only)은 생성 프로젝트용이라 글롭이 달라 부적합.
- **이중(L1 PreToolUse + L2 commit-msg)**: Claude 는 L1 이 먼저 차단, 통과 시 L2 재통과(로그 존재) → 중복 차단 없음. 비-Claude 는 L2 만 = 격차 폐쇄. 보너스: L2 는 항상 repo root 실행이라 L1 의 worktree cwd 불일치 한계도 닫음.
- **알려진 한계(정직)**: amend 완화 없음 — 이미 로그 든 커밋 amend 시 오차단 가능하나 [skip-record] 우회 + 이 레포 amend 지양 관행이라 수용(RFC 0061 record-check 는 HEAD 완화 보유).

## 검증
- `check-goal-65` 게이트 ✓(고유검증 5 전부) · 전체 `build`/`lint`/`test:run` green(신규 commit-msg 테스트 8 포함, check-records 33 pass)
- **실 git 훅 E2E**: 임시 레포 `core.hooksPath .githooks` 활성 → 코드+로그없음 커밋 **BLOCKED**(HEAD 미생성), `[skip-record]` 커밋 **COMMITTED**. Windows git 훅 경로 실증.
- 이 커밋 자체가 훅 대상(dev log 스테이지로 통과 = 라이브 도그푸딩).

## 활성 (사람/기여자)
`pnpm run hooks:install` 1회 → 이후 이 클론의 모든 커밋(도구 무관)이 기록 집행. 미실행이어도 Claude 커밋은 L1 이 계속 커버.
