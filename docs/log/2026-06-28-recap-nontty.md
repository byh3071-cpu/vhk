# 2026-06-28 — recap 비-TTY 비대화형 폴백 (#288)

> cafe-pos-vhk 도그푸딩(VHK-5). 별도 worktree(fix/recap-nontty-288)에서 1건 PR.
> 동일 계열 #333(no-args 비-TTY)·#337(undo)와 같은 "대화형 강제·비대화 폴백 부재"의 recap 판.

## 증상 (#288)
- 비대화형 셸(파이프·AI 에이전트 Bash 도구)에서 `vhk recap` → `ensureInteractive` 가 `⚠️ TTY_REQUIRED` + exit 2 로 중단. 회고 입력이 대화형으로만 가능.
- 모순: `COMMANDS.md` 는 "오늘 한 일 정리해"를 AI 사용으로 안내하나, 실제론 AI(비-TTY)가 못 돌림. 메인 개발은 AI가 도는데 세션 정리를 AI가 못 해 흐름 단절.

## 수정
- `src/commands/recap.ts`: 진입부 `ensureInteractive`(exit 2 중단) → `isInteractive({ yes })` 분기로 교체.
  - 대화형(TTY/VHK_FORCE_INTERACTIVE=1): 기존 4-필드 프롬프트 그대로 — 회귀 0(프롬프트 배열 바이트 동일).
  - 비대화형(비-TTY/`--yes`): 프롬프트 호출 없이 플래그값(`--summary/--next/--decisions/--blockers`) 또는 기본값으로 회고 구성 → 세션 로그 작성. 미지정 항목은 `_(미입력 — 비대화형 실행)_` 표식(거짓 본문 날조 금지).
  - 파일 작성 후 비대화형은 조기 종료: ADR/트러블슈팅 **후보는 읽기전용 보고**, 문서 생성·CLAUDE.md 갱신처럼 프롬프트 필요한 경로는 건너뜀(헤드리스 inquirer 금지 규칙 준수 — 6개 prompt 사이트 전부 가드 안쪽).
- `src/index.ts`: recap 커맨드에 `--summary/--decisions/--next/--blockers/-y,--yes` 옵션 추가. (NL 라우터는 옵션 토큰 있으면 자동 위임 → cli-args 변경 불필요.)
- `src/i18n/ko.ts`: `recap.notProvided/nonInteractiveNote/detectSkipNonInteractive` 추가.
- MCP `recap` 툴은 별도 read-only 구현(`gitSession.recapLog`)이라 무영향 — CLI 경로만 변경.

## 테스트
- `tests/recap.test.ts`: 비-TTY 3케이스 추가(`node:fs`·`doc-suggest`·`troubleshooting`·`hard-stop-guard` 모킹으로 실레포 오염 차단).
  - 비-TTY: inquirer 미호출 + writeFileSync 호출(로그 생성) + exit≠2.
  - `--summary/--next` 플래그가 본문에 반영.
  - 플래그 미지정 시 "미입력" 표식 기록.
- 빌드된 dist 헤드리스 스모크: `echo "" | env -C <tmp-repo> node dist/index.js recap --summary ... --next ...` → 로그 생성 + **EXIT=0**(과거 exit 2 → 해소 확인).

## 게이트
- `pnpm build` ✓ (tsup ESM + DTS 풀 타입체크 통과).
- `tests/recap.test.ts` 단독 6 pass(forks·threads 양쪽). `nlp-router` 86 pass·`interactive` 11 pass. `node scripts/check-commands-doc.mjs --strict` PASS(57 명령 전부 문서화).
- 로컬 vitest 멀티파일은 forks "Worker exited unexpectedly"·threads "process.chdir not supported"·exit 127(rmSync) 환경성 플래키(TS-004/005, 내 변경 무관) → 단독 실행/CI 가 진실원. mcp-cli-contract 2건 실패는 threads 의 chdir 제약(deploy/publish 파리티, #288 무관).
- 문서: COMMANDS.md(헤드리스 안내 + 명령표 행)·README(Git 표 행) 동작 일치 갱신.
