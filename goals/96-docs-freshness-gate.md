---
vhk_format: 1
type: goal
id: 96
title: 문서 신선도 경고 — vhk preflight 에 docs/state/next-task.md 갱신주기 점검 추가 (#292-G5) — P2
status: DONE
priority: P2
created: 2026-07-04
completed: 2026-07-04
leads_to: 이슈 #292(문서 신선도) G5 트랙 완료 — next-task.md 가 오래 안 갱신되면 preflight 가 경고(차단 아님)
---

# Goal 96: 문서 신선도 게이트 (#292-G5)

> 출처: GitHub 이슈 #292 서브태스크 G5. `docs/state/next-task.md` 는 세션 종료 의례(`vhk work
> handoff`)마다 갱신이 요구되는 상태 SoT 문서 — 오래 갱신 안 되면 "다음 세션이 stale 한 정보로
> 시작"하는 위험 신호다. 이번 goal 은 이 신호를 `vhk preflight` 에 읽기전용 경고로 추가한다.

## 근거 (사전 조사 — Design 단계 감사)

- `src/lib/preflight.ts:206-215`(`runPreflight()`) — 8개 체크를 배열로 반환하는 기존 오케스트레이션에
  9번째 항목만 추가하면 배선 끝(`src/commands/preflight.ts` 는 배열을 그대로 순회·집계하므로 무변경).
- `src/lib/preflight.ts:153-163`(`summarizePreflight()`) — `status==='fail' && severity==='critical'`
  일 때만 `blocked=true`. `severity: 'normal'` 로 두면 절대 차단 안 됨(경고만).
- `docs/state/blockers.md` 는 대상에서 **제외** — append-only 라 "블로커 없음"이 정상적으로 수십 일
  지속 가능(실측: 2026-07-04 시점 마지막 커밋 2026-06-10, 24일+ 경과했는데 현재 상태는 정상인
  "블로커 없음"). 같은 7일 임계값을 적용하면 상시 거짓경고가 된다.
- `.vhk/context.md` 는 `.vhk/.gitignore` 로 git 추적 자체가 안 돼 커밋시각 조회 불가 → 대상 아님
  (이미 별도 SHA 기반 드리프트 체크가 `doctor.ts` 에 비차단 경고로 존재).
- mtime 함정: `fs.statSync(...).mtime` 은 `git worktree add` 체크아웃 시각으로 리셋되므로 절대
  사용 불가 — 반드시 `git log -1 --format=%ct -- <file>` (커밋시각) 으로만 판정.

## 동작

`src/lib/preflight.ts` 에 `checkDocsFreshness(run, opts)` 순수 함수 추가 — 기존 `checkGitClean`/
`checkBranch` 와 동일한 "주입된 `Runner`만 호출" 패턴을 따른다.

- 대상 파일: `docs/state/next-task.md` 단독(`DOCS_FRESHNESS_FILE` export 상수).
- 임계값: `DOCS_FRESHNESS_WARN_DAYS = 7`(하드코딩 export 상수, YAGNI — config/CLI 플래그 없음).
- severity: `'normal'`(항상 경고만, 차단 안 함).
- git 커밋시각 조회 실패/빈 출력/파싱불가 → `status: 'skip'`("판정 불가", 경고도 안 함).
- `runPreflight()` 반환 배열에 9번째 항목으로 배선(`src/commands/preflight.ts` 무변경).

## Completion Check

- [x] `checkDocsFreshness()` 신규 함수 — fresh/경계값(7일)/초과(warn)/git 실패/빈 출력/파싱불가
      (전부 skip 또는 pass/warn)/`thresholdDays` 커스텀 오버라이드 단위 테스트 전부 GREEN
      (`tests/preflight.test.ts`, TDD RED→GREEN 확인).
- [x] `runPreflight()` 통합 테스트 — 9개 항목 확인 + 정상환경 blocked 아님 + docs freshness
      가 warn(오래된 mock)이어도 `summarizePreflight().blocked` 는 여전히 `false`(severity
      normal 이 실제 배선에서도 차단 안 함을 재확인).
- [x] `src/commands/preflight.ts` 무변경 확인(배열 길이·내용과 무관하게 이미 범용 순회).
- [x] 공통 게이트(_meta) + `scripts/check-goal-96.mjs`(고유 검증).

## Forbidden Actions (OUT)

- `docs/state/blockers.md` 를 신선도 체크 대상에 포함 금지 — append-only 특성상 상시 오탐(실측
  확인, 위 근거 참조).
- `severity: 'critical'` 로 두어 차단(blocked) 시키는 것 금지 — 문서 미갱신은 진짜 문제일 수도,
  그날 안 바뀐 정상 상태일 수도 있어 false positive 비용이 lint/typecheck/test 실패보다 크다.
- `fs.statSync(...).mtime` 사용 금지 — 워크트리 checkout 시각으로 리셋되는 함정(실측 확인).
- 임계값을 CLI 플래그/config 로 노출하는 것 금지(YAGNI, goal 92 선례를 따름) — 필요해지면
  함수 파라미터(`opts.thresholdDays`)로 이미 열려 있다.

## Mandatory Reading

`src/lib/preflight.ts`(`checkGitClean`/`checkBranch` 선례) · `tests/preflight.test.ts` ·
`src/commands/preflight.ts`
