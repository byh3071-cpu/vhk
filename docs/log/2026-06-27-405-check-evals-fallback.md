# 2026-06-27 — #405 `vhk check evals` silent fallback 제거

## 증상 (이슈 #405)
`vhk check evals` 실행 시 'evals' 인자가 무시되고 RULES.md 규칙점검(checkRules)으로 조용히 빠짐(silent fallback).
golden-set.md(#403)는 `vhk check evals`를 골든셋 채점기로 명시하지만 채점기 본체는 로드맵 goal G-B 예정(미구현)
→ 사용자가 "골든셋 채점이 돌았다"고 오해할 위험.

## 'evals'가 삼켜지던 위치 (근거)
이중으로 삼켜짐:
1. **NL 라우터 가로채기** — `src/lib/cli-args.ts` `detectNaturalLanguageInput`(line 193·200): `routeNaturalLanguage('check evals')`가
   nlp-router 의 bare `check` 키워드 규칙(`src/lib/nlp-router.ts:344` `/규칙.*(점검|위반)|린트|check|위반/`)에 매칭 →
   문장 전체('check evals')를 자연어로 판정해 반환. (commander 까지 못 감)
2. **dispatch 무인자 호출** — `src/lib/nlp-run.ts:74-75` `case 'check': return check()` → `check()`를 인자 없이 호출 → 'evals' 소실 → `checkRules()`.
   (설령 NL 을 거치지 않아도 `src/index.ts`의 commander `check` 정의에 위치인자가 없어 'evals' 는 excess arg 로 무시됨.)

## 고친 방법 (가장 단순한 해법 — check 위치인자 처리)
- `src/index.ts` — commander `check` 에 `.argument('[target]')` 추가, action 을 `(target, opts) => check(opts, target)` 로.
- `src/commands/check.ts` — `check(opts, target?)`: target 있으면 `checkSubcommand(target)` 로 분기.
  - `evals` → 골든셋 채점기 미구현(goal G-B) **정보성 안내**(exit 0) + `docs/evals/golden-set.md` 참조 + printNextStep.
  - 그 외 → "알 수 없는 인자 'X' — vhk check 는 RULES.md 규칙 점검" **정직한 안내 + exit 1**(#346: 조용한 성공 위장 차단).
  - 출력은 logger SoT(`log.*`, Goal 51) 사용 — 신규 raw `console.log(chalk)` 부채 0.
- `src/lib/cli-args.ts` — `POSITIONAL_ARG_COMMANDS={check,점검,린트}` 추가 → `detectNaturalLanguageInput` 이 `vhk check <arg>` 를
  NL 로 가로채지 않고 commander 위치인자로 위임(FREEFORM_ARG_COMMANDS 와 동일 패턴). 한글 별칭 포함.
- `src/i18n/ko.ts` — `check.evalsTitle·evalsHint·unknownTarget(fn)·unknownHint` 메시지 추가.
- `tests/check.test.ts` — 라우팅 가드(`check/점검/린트 evals`→null) + 회귀(`규칙 점검` NL 유지) + evals 안내(exit 0)·미인식 안내(exit 1) 테스트 추가.

## 게이트
- `pnpm build` ✅(tsc DTS 타입 통과) · `pnpm exec tsc --noEmit` ✅ · `pnpm lint`(eslint) ✅
- 정적 게이트 ✅: check-no-raw-json-parse PASS · check-no-stray PASS · no-raw-output 신규 hit 0(기존 checkRules baseline 만).
- 실 CLI 검증(dist): `vhk check evals`·`vhk 점검 evals` → G-B 안내·exit 0(NL 배너 없음=commander 처리 확인) / `vhk check bogus` → exit 1 /
  회귀 `vhk 규칙 점검`(NL)→규칙점검 · `vhk check`(무인자)→규칙점검 · `vhk check --goal 999`→goal 게이트.
- 로컬 vitest forks/threads 불안정(TS-004): check.test.ts 단독 실행도 exit 127 — 단, 무수정 `cli-args.test.ts`·`goal.test.ts` 도 동일 127,
  `cost.test.ts` 는 `process.chdir() not supported in workers` 로만 실패 → 환경 한계 확인. **전체 회귀는 CI(forks 정상)가 진실원.**

## 다음
- 골든셋 채점기 본체는 로드맵 goal G-B 에서 구현(이 PR 은 silent fallback 제거 + 안내까지). CI green 후 머지 판단.
