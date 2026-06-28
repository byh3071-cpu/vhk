# 2026-06-28 — #287 goal done EPIPE 시 상태 전이 누락 + exit 255

## 결론
`vhk goal done` 의 게이트 통과 후, 상태 write(frontmatter → DONE)를 **게이트 출력보다 먼저** 수행하도록 순서를 바꿨다. 추가로 CLI 진입점에서 stdout/stderr 파이프 조기종료(EPIPE)를 정상 종료(0)로 흡수한다.

## 증상 (출처: cafe-pos-vhk 도그푸딩, VHK-3 · Windows 11 · PowerShell 5.1)
- `vhk goal done --id 1 2>&1 | Select-Object -First 3` 처럼 소비자가 출력 도중 파이프를 닫으면
  `goals/1-*.md` 의 `status` 가 DONE 으로 전이되지 않음(NOT_STARTED 잔존).
- `$LASTEXITCODE = 255`(= −1).

## 원인
`goalDone` 는 게이트 통과 후 **게이트 출력(`console.log(gate.out)`)을 먼저** 찍고, 그 뒤에서 `atomicWriteFile` 로 상태를 전이했다.
게이트 출력(빌드·테스트 로그)은 길어 파이프를 넘치게 한다 → 소비자가 일찍 닫으면 그 `console.log` 가 깨진 파이프에 write.
Windows 는 파이프 write 가 **동기**라 EPIPE 가 **throw** 되어 스택을 풀고 함수를 빠져나간다 → `atomicWriteFile` 미도달 → 전이 누락.
미처리 EPIPE 는 그대로 프로세스 크래시(비정상 종료코드).

## 고친 것
1. **src/commands/goal.ts (핵심)** — `goalDone`: 게이트 통과 시 read+update+`atomicWriteFile`(부수효과)를
   게이트 출력·성공 메시지보다 **먼저** 수행. 출력은 `showGateOutput()` 클로저로 묶어 세 분기(실패/무변경/성공)에서
   동일하게 재생(사용자가 보는 출력 순서는 그대로). 파이프가 끊겨 이후 `console.log` 가 죽어도 전이는 디스크에 안전.
2. **src/index.ts (보강)** — isMainModule 안에서 stdout/stderr 의 `error`(EPIPE) → `process.exit(0)`,
   top-level catch 의 **첫 분기**로 `isEpipeError(err) → exit(0)`(동기 throw EPIPE 가 다시 `console.error` 로
   같은 끊긴 파이프를 때려 255 가 되던 경로 차단). isMainModule 내부 등록이라 테스트/임포트엔 영향 없음.
3. **tests/goal.test.ts** — 회귀: 게이트 출력 `console.log` 에서만 EPIPE 를 던지게 모사 → 상태가 DONE 으로 전이됨을 확인.

## 검증 (로컬 vitest forks 는 worker crash flaky — TS-004, CI 가 진실원)
- `pnpm build` ✓ · `pnpm typecheck` ✓ · `pnpm lint` ✓
- 회귀 로직 단독 증명(tsx 하니스): 미수정 코드 → `status-DONE=false`(RED, 버그 재현) / 수정 코드 → `status-DONE=true`(GREEN).
- Fix2 메커니즘 증명: >64KB 출력→조기종료 소비자에서 핸들러 없음=exit 1 / 동일 핸들러 적용=exit 0.
- 한계(정직): vhk 의 작은 출력 명령은 OS 파이프 버퍼(64KB)를 안 넘겨 in-node EPIPE 가 안 뜨고,
  PowerShell `Select-Object -First` 는 자식 프로세스를 **외부에서 종료**(종료코드는 PowerShell 소관)한다.
  → 그 경우에도 **상태 무결성은 Fix1 이 보장**(write 가 출력보다 앞서므로 어떻게 죽든 디스크 상태는 안전).
