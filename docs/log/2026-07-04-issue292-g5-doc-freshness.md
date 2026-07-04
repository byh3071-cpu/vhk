# 2026-07-04 — 이슈 #292 G5 — 문서 신선도 경고 게이트 (goal 96)

> append-only. 추가만, 수정·삭제 금지.

## 배경

GitHub 이슈 #292 서브태스크 G5. `docs/state/next-task.md` 는 CLAUDE.md 세션종료 의례가
매 세션 갱신을 요구하는 상태 SoT 문서다. 오래 안 갱신되면 다음 세션이 stale 한 정보로
시작할 위험이 있다 — 이 신호를 `vhk preflight` 에 읽기전용 경고로 추가했다.

## 사전 조사(Design 단계) 핵심 결론

- 대상 문서: `docs/state/next-task.md` **단독**. `docs/state/blockers.md` 는 append-only
  특성상 "블로커 없음"이 정상적으로 수십 일 지속 가능해 제외(실측: 2026-07-04 시점 마지막
  커밋 2026-06-10, 24일+ 경과했는데 현재 상태는 정상인 "블로커 없음" — 같은 7일 임계값을
  적용하면 상시 거짓경고가 되는 함정을 사전 조사에서 발견).
- `.vhk/context.md` 는 `.vhk/.gitignore` 로 git 추적 자체가 안 돼 대상 아님.
- 임계값 7일, severity `'normal'`(항상 경고만, 차단 안 함) — 하드코딩 export 상수로 시작
  (goal 92 선례를 따라 config/CLI 플래그는 YAGNI 로 기각).
- mtime 함정 회피 필수: `fs.statSync(...).mtime` 은 `git worktree add` 체크아웃 시각으로
  리셋되므로 절대 사용 금지 — 반드시 `git log -1 --format=%ct -- <file>` (커밋시각)만 사용.

## 한 일 (TDD RED → GREEN)

1. `tests/preflight.test.ts` 에 `checkDocsFreshness` 신규 describe 블록 작성(RED 확인 —
   `checkDocsFreshness is not a function`, 9개 테스트 실패).
2. `src/lib/preflight.ts` 에 `checkDocsFreshness(run, opts)` 구현 — 기존 `checkGitClean`/
   `checkBranch` 와 동일한 "주입된 `Runner`만 호출" 패턴. `runPreflight()` 반환 배열에
   9번째 항목으로 배선.
3. 재실행 → 48개 테스트 전부 GREEN.

## 커버한 케이스

- fresh(3일 전) → pass
- 정확히 임계값(7일) 경계 → pass(off-by-one 방지, `>` 조건이라 경계 포함)
- 임계값 초과(10일) → warn(severity `'normal'`, `'critical'` 아님을 명시적으로 assert)
- git log 실패(`r.ok=false`) → skip
- 출력 빈 문자열 → skip
- 출력 파싱 불가(숫자 아님) → skip
- `thresholdDays` 커스텀 오버라이드(3일로 주면 5일 경과가 warn) 확인
- `runPreflight()` 통합: 9개 항목 확인 + docs freshness 가 warn(오래된 mock)이어도
  `summarizePreflight().blocked` 는 여전히 `false`(severity normal 이 실제 배선에서도
  차단 안 함을 재확인)

NOW/DAY 상수 패턴은 `version-check.test.ts` 를 그대로 차용(고정 NOW + 오프셋 계산으로
결정론적 테스트, 실제 `Date.now()` 호출 없음).

## 변경 파일

- `src/lib/preflight.ts` — `checkDocsFreshness()`·`DOCS_FRESHNESS_WARN_DAYS`·
  `DOCS_FRESHNESS_FILE` 신규, `runPreflight()` 배선 1줄 추가.
- `tests/preflight.test.ts` — 신규 describe 블록 + 기존 `runPreflight` 통합 테스트 갱신
  (8개 → 9개, mock 응답에 git log 항목 추가).
- `src/commands/preflight.ts` — **무변경**(배열을 그대로 순회·집계하는 기존 로직이 배열
  길이·내용과 무관하게 이미 범용으로 동작).
- `goals/96-docs-freshness-gate.md` + `scripts/check-goal-96.mjs` 신규.

## 게이트

`pnpm exec tsc --noEmit` / `pnpm build` / `pnpm test:run` / `pnpm lint` — 결과는 이 커밋의
gateStatus 참조(구조화 출력에 실제 실행 결과 기록).

## 교훈

- 문서 신선도처럼 "진짜 문제일 수도, 정상적으로 안 바뀐 걸 수도" 있는 애매한 신호는
  severity 를 낮게(`'normal'`) 잡고 경고만 하는 게 맞다 — false positive 비용이 lint/
  typecheck/test 실패보다 훨씬 크다. `blockers.md` 실측 사례(24일+ 지났는데 정상 상태)가
  이 판단을 실증했다.
- 상태 관리 파일 신선도를 잴 때 mtime 은 워크트리/CI 체크아웃 환경에서 신뢰할 수 없다
  (checkout 시각으로 리셋) — git 커밋시각(`%ct`)만 SoT 로 써야 한다.
