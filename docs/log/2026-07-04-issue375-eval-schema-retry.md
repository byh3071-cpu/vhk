# 2026-07-04 — 이슈 #375 재시도: recall eval queryType 분해 + diff-cover branch 스키마 (goal 98)

> append-only. 추가만, 수정·삭제 금지.

## 배경

이슈 #375 이전 시도가 Plan Mode 오탐으로 조사만 하고 구현 없이 멈췄다. 이번 세션(격리 워크트리)이
사전 조사(별도 opus 에이전트가 확정한 정확한 수정안)를 그대로 TDD 로 구현했다.

## 한 일

4개 파일을 순서대로 TDD(RED 확인 → GREEN 구현) 로 수정했다.

1. `src/lib/recall-eval.ts` — `EvalLabel.queryType?: 'lexical' | 'paraphrase'`(하위호환, 생략 가능)
   추가. `validateEvalLabels()`가 허용값 외 문자열/문자열 아닌 값을 `EvalFormatError`로 거부.
   `scoreEval()`이 `EvalResult.byQueryType`(3버킷: lexical/paraphrase/unknown, 각
   `{n, recallAt5}`)을 순수 함수 `buildByQueryType()`로 계산 — 태그 없는 라벨은 `unknown` 버킷.
2. `src/commands/memory-eval.ts` — `EvalPerQuery.queryType` 플로우 + `memoryEval()` 출력에
   버킷별 Recall@5(n>0 인 것만) 표시.
3. `src/lib/coverage-parse.ts` — `FileCoverage.branchPartial: Set<number>`(required, 항상 채워
   반환) 추가. v8 coverage-final.json 의 `branchMap`/`b`를 파싱해 각 branch location 중
   hits===0 인 것의 라인을 수집(location 에 line 정보 없으면 — 암묵 else 흔한 케이스 — branch
   자체의 `loc.start.line` 폴백).
4. `src/lib/diff-coverage.ts` — `FileDiffCoverage.uncoveredBranch?: number[]` 추가
   (`branchPartial ∩ 추가라인 전체`, `inCoverage`가 false 거나 branch 정보가 없으면 빈 배열).
5. `src/commands/diff-cover.ts` `formatReport()` — `uncoveredBranch`를 "분기 미검증" 라인으로
   렌더링. statement 레벨이 전부 covered(단일줄 if 오판정 시나리오)라도 branch 미검증이 있으면
   더 이상 "모두 커버" 축하 메시지로 은폐하지 않도록 게이트 로직도 함께 조정.

## 발견한 실버그(수정 동기)

`if (existsSync('yarn.lock')) return 'yarn'` 같은 단일줄 if 문은 whole-statement 가 hit 되면
`s` 카운트 상 covered 로 잡히지만, 실제로는 조건이 항상 참(또는 항상 거짓)이라 반대쪽 분기가
전혀 실행되지 않을 수 있다. 기존 `coverage-parse.ts`는 `statementMap`/`s`만 읽어 이 케이스를
완전히 놓쳤다(v8 coverage-v8 리포트에 `branchMap`/`b`가 이미 실재함을 실측 확인). `formatReport()`의
기존 최상단 early-return(`totalUncovered===0` → 무조건 축하 메시지)도 이 신호를 감출 수 있었다 —
`anyBranchUncovered` 가드를 추가해 branch 미검증이 있으면 축하 메시지 대신 "statement 100% —
단, 분기 미검증 있음" 메시지로 분기시켰다.

## 게이트

`pnpm exec tsc --noEmit`·`pnpm build`·`pnpm test:run`(2254 pass)·`pnpm lint` 전부 green.
신규 테스트: `tests/recall-eval.test.ts`(+16 케이스, #375 queryType 하위호환·검증·byQueryType 분해),
`tests/coverage-parse.test.ts`(+5 케이스, branchMap fixture — 완전커버/부분미커버/branchMap없음/
location line 폴백), `tests/diff-coverage.test.ts`(+4 케이스, uncoveredBranch 교집합·
inCoverage:false·coverage=null), `tests/diff-cover.test.ts`(+3 케이스, formatReport 분기 미검증
렌더링 + 기존 FileCoverage 리터럴 3곳에 `branchPartial: new Set()` 추가로 컴파일 유지 확인).

## 환경 메모(이 워크트리 한정)

이 워크트리는 `node_modules`가 비어있는 상태(`.vite`/`.vite-temp` 캐시만 존재)로 생성돼 있었다 —
`pnpm exec tsc`/`pnpm build`/`pnpm test:run`은 Node 모듈 해석이 상위 디렉터리(`vhk/node_modules`)
로 climb 하거나 전역 pnpm bin shim(`tsc`/`tsup`/`vitest`, 우연히 프로젝트 pin 버전과 일치)을 타서
겉보기엔 통과했지만, `eslint`는 로컬에도 전역에도 없어 `pnpm lint`가 즉시 실패했다(진짜 lint 결함이
아니라 워크트리 셋업 결함). `pnpm install --frozen-lockfile`로 로컬 `node_modules`를 채운 뒤 4종
게이트 전부 재확인해 green 을 받았다 — 다음 세션/워크트리에서도 게이트 전 `pnpm install` 여부를
먼저 확인할 것(교훈: 새 워크트리에서 `pnpm lint`가 "command not found"로 죽으면 코드 문제가 아니라
`pnpm install` 누락일 가능성 우선 의심).

## 코드 변경 파일

`src/lib/recall-eval.ts`·`src/commands/memory-eval.ts`·`src/lib/coverage-parse.ts`·
`src/lib/diff-coverage.ts`·`src/commands/diff-cover.ts`·`tests/recall-eval.test.ts`·
`tests/coverage-parse.test.ts`·`tests/diff-coverage.test.ts`·`tests/diff-cover.test.ts`
