# 2026-06-23 — 인자 없는 vhk 비-TTY 폴백 (#333)

> 6-22 도그푸딩 배치 이슈 중 #333. 별도 worktree(fix/333-nontty-help)에서 1건 PR.

## 증상 (#333)
- 인자 없는 `vhk` 의 기본 액션이 대화형 inquirer 메뉴인데 TTY 가드가 없어, 비-TTY(파이프·리다이렉트·CI·headless)에서도 메뉴 ANSI 를 그대로 쏟음. `--help` 폴백 부재.
- recap(#288)·undo(#337) 와 같은 "대화형 강제, 비대화 폴백 부재" 계열이나, 이쪽은 **no-args 진입점**에만 가드가 빠진 케이스.

## 수정
- `src/index.ts` 의 `program.action()`(no-args 기본 액션) 진입부에 `if (!isInteractive()) { program.outputHelp(); return }` 가드 추가.
- 다른 대화형 명령(gate/ship/design/recap 등)이 쓰는 것과 동일 축인 `isInteractive()`(stdin.isTTY + VHK_FORCE_INTERACTIVE 탈출구, src/lib/interactive.ts)에 묶어 일관성 유지.
- help 는 정상 안내라 exit 0(미인식 실패 신호 아님). 대화형(TTY/VHK_FORCE_INTERACTIVE=1)은 기존 메뉴 그대로 — 회귀 0.

## 테스트 (TDD)
- `tests/noargs-nontty.e2e.test.ts` 신규 2케이스. 실제 빌드된 dist 를 spawnSync(stdin 'ignore'=EOF, stdout 'pipe'=비-TTY)로 띄워 함수 mock 으로 재현 불가한 진입 경로 검증.
  - 비-TTY: 메뉴 마커(`뭘 도와드릴까요`/`Use arrow keys`) 0, `명령어:`(help) 출력, exit 0.
  - VHK_FORCE_INTERACTIVE=1: 메뉴 유지(폴백이 메뉴를 잡아먹지 않음 — isInteractive 축 확인).
- red 확인: 수정 전 메뉴 ANSI + `ERR_USE_AFTER_CLOSE` 크래시 재현 → green.

## 게이트
- build ✓ · lint(eslint src) ✓ · 전체 테스트 1963 pass(182 파일, --test-timeout=30000) · secure scan CRITICAL 0/HIGH 0/MEDIUM 0.
- 주의: 기본 5s 타임아웃 풀런 시 e2e spawn 테스트 6~7건이 부하성 timeout 으로 깜빡임 → main 베이스라인(내 변경 stash 후)에서도 동일 재현 → 환경성 플래키(내 변경 무관). 타임아웃 상향 시 전건 green.
