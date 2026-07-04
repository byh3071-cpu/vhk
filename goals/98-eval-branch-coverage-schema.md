---
vhk_format: 1
type: goal
id: 98
title: 이슈 #375 재시도 — recall eval queryType 분해 + diff-cover branch 커버리지 스키마 — P2
status: DONE
priority: P2
created: 2026-07-04
completed: 2026-07-04
leads_to: recall 검증(vhk memory eval)과 diff-cover 측정 신호가 더 정밀해져 "키워드 매칭인지 의역 매칭인지"·"단일줄 if 분기 미검증"을 감춘 채 넘어가는 회귀를 줄인다
---

# Goal 98: 이슈 #375 재시도 — eval queryType 분해 + branch 커버리지 스키마

> 출처: 이슈 #375 재시도(이전 시도는 Plan Mode 오탐으로 조사만 하고 구현 없이 멈춤). 사전 조사(별도
> opus 에이전트)가 확정한 4개 파일의 정확한 수정안을 그대로 TDD 로 구현.

## 근거

- `src/lib/recall-eval.ts` — `EvalLabel`에 쿼리 성격(키워드 정확일치 vs 의역) 태깅이 없어, `vhk memory
  eval`의 Recall@5 가 "키워드는 잘 찾는데 의역엔 약하다" 같은 세부 신호를 뭉개서 하나의 숫자로만 보여줬다.
- `src/lib/coverage-parse.ts` — v8 coverage-final.json 에 `branchMap`/`b`(분기 히트 카운트)가 실재하는데도
  기존 파서가 `statementMap`/`s`만 읽어서, `if (existsSync('yarn.lock')) return 'yarn'` 같은 단일줄 if 문은
  whole-statement 가 hit 되면 분기(참/거짓 또는 암묵 else) 중 하나가 전혀 안 밟혀도 커버로 오판정하는
  실버그가 있었다.
- `src/lib/diff-coverage.ts`·`src/commands/diff-cover.ts` — 위 branch 신호가 diff-cover 리포트에 전혀
  반영되지 않아, 사용자가 "미검증 변경분 0"이라는 축하 메시지를 보고도 실제로는 분기 하나가 통째로
  안 타본 상태를 알 방법이 없었다.

## 동작

1. `EvalLabel.queryType?: 'lexical' | 'paraphrase'` 추가(하위호환 — 생략 가능). `validateEvalLabels()`가
   허용값 검증. `scoreEval()`이 `EvalResult.byQueryType`(3버킷: lexical/paraphrase/unknown, 각
   `{n, recallAt5}`)를 계산 — 태그 없는 라벨은 `unknown` 버킷. `vhk memory eval` 출력이 버킷별 Recall@5 를
   n>0 인 것만 표시.
2. `FileCoverage.branchPartial: Set<number>`(required) 추가 — branchMap 의 각 branch location 중
   hits===0 인 것의 라인(암묵 else 등 location 에 line 정보가 없으면 branch 자체의 `loc.start.line` 폴백).
3. `FileDiffCoverage.uncoveredBranch?: number[]` 추가 — `branchPartial ∩ 추가라인(전체)`. `inCoverage`가
   false 거나 branch 정보가 없으면 빈 배열.
4. `formatReport()`가 `uncoveredBranch` 를 "분기 미검증" 라인으로 렌더링 — statement 가 전부 covered 라도
   (오판정 시나리오) branch 미검증이 있으면 더 이상 "모두 커버" 축하 메시지로 은폐하지 않는다.

## Completion Check

- [x] `src/lib/recall-eval.ts` — `EvalLabel.queryType` 추가, `validateEvalLabels()` 검증(허용값 외 →
      `EvalFormatError`, 생략 시 하위호환), `scoreEval()` → `EvalResult.byQueryType` 3버킷 분해
- [x] `src/commands/memory-eval.ts` — `EvalPerQuery.queryType` 플로우 + `memoryEval()` 출력에 버킷별
      Recall@5 표시(n>0 인 버킷만)
- [x] `src/lib/coverage-parse.ts` — `FileCoverage.branchPartial`(required, 항상 채움) + branchMap/b
      파싱(location 별 hits===0 라인 수집, line 정보 없으면 branch loc 폴백)
- [x] `src/lib/diff-coverage.ts` — `FileDiffCoverage.uncoveredBranch`(branchPartial ∩ added, inCoverage
      false 면 빈 배열)
- [x] `src/commands/diff-cover.ts` `formatReport()` — uncoveredBranch 렌더링("분기 미검증" 라인),
      statement 100%+branch 미검증 시나리오에서 축하 메시지 은폐 안 함
- [x] `tests/recall-eval.test.ts`·`tests/coverage-parse.test.ts`·`tests/diff-coverage.test.ts`·
      `tests/diff-cover.test.ts` 신규 케이스(TDD RED→GREEN 확인)
- [x] 공통 게이트(_meta) + `check-goal-98.mjs`(고유 검증) + `pnpm lint` 포함 4종 게이트 전부 green

## Forbidden Actions (OUT)

- `DiffCoverageResult` 레벨의 branch 합산 필드 추가 금지(YAGNI — 파일별 `uncoveredBranch` 만으로 충분,
  총계는 이 goal 범위 밖).
- 기존 `EvalLabel`/`FileCoverage`/`FileDiffCoverage` 필드 breaking change 금지 — 전부 신규 optional 또는
  하위호환 유지(`branchPartial`은 required 지만 `fileCoverageByFile()`이 항상 채워 반환 — 호출부 영향 없음).
- `memoryEvalInit()`(대화형 라벨링) 에 queryType 입력 프롬프트 추가 금지 — 이 goal 범위 밖(스코프 확정:
  스키마+스코어링만, 라벨링 UX 확장은 별도 이슈).
- 커버리지 리포트 없음/손상(`COVERAGE_CORRUPT`) 처리 로직 변경 금지 — 기존 동작 그대로.

## Mandatory Reading

`src/lib/recall-eval.ts` · `src/commands/memory-eval.ts` · `src/lib/coverage-parse.ts` ·
`src/lib/diff-coverage.ts` · `src/commands/diff-cover.ts`
