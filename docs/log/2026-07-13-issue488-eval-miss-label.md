# 2026-07-13 — #488 eval --init recall 미스 라벨링 (fix/488-eval-miss-label)

## 결론
`vhk memory eval --init` 이 recall 후보 0 쿼리를 전부 자동 skip 해 **미스가 평가셋에서 구조적으로 제외**되던 편향(Recall@5 상향 + 라벨링 dead-end)을 제거. 후보 0 쿼리도 전체 기억(4버킷, 패턴 포함)에서 정답을 고르거나 "정답 없음(쿼리 무효)"을 선택할 수 있고, 히트 밖 정답은 그대로 **miss 라벨**로 기록돼 Recall@5 분모·분자에 정확히 반영된다. 스키마(`{query, expectIds, queryType?}`)·채점기(recall-eval.ts)는 무변경.

## 근인
`src/commands/memory-eval.ts` `memoryEvalInit()` — `recallMemories()` 가 빈 배열을 반환하면 `(후보 없음 — skip)` 출력 후 `continue`. 라벨 선택지가 recall top-5 히트로만 한정돼 있어 ① 후보 0 쿼리는 라벨 자체가 불가, ② 후보가 있어도 top-5 밖 정답을 지정할 방법이 없음 → `--init` 산 라벨은 사실상 전부 hit 로만 구성(미스 표본 0). 이슈 실사례: 실쿼리 6건 전부 후보 0 → 라벨 0 → 평가셋 미생성.

## 수정
- **후보 0 분기**: 자동 skip 제거 → 전체 기억 픽커(`pickExpectedFromAll`) 진입. 엔터 = "정답 없음(쿼리 무효)" 로만 skip.
- **전체 기억 픽커 신설**: decisions→failures→successes→patterns 4버킷 평탄화, 20건 초과 시 키워드 필터(부분일치, `f` 로 재필터), 번호(쉼표 구분) 선택. patterns 는 recall 코퍼스(orderedAll) 밖이라 골라도 항상 miss — 그게 recall 의 실제 사각지대이므로 숨기지 않고 라벨 가능하게 유지.
- **히트 있는 쿼리 확장(additive)**: 기존 숫자 선택·엔터 skip 그대로 + `m` 입력 시 전체 목록에서 top-5 밖 정답 지정 가능(→ 채점 시 miss).
- **문구 i18n**: 신규 사용자 대면 문구 전부 `src/i18n/ko.ts` `memory.evalInit.*` 로.
- **문서**: COMMANDS.md 해당 행에 한 줄 반영. 비-TTY 가드(`ensureInteractive`)·기존 플래그/시그니처 무변경, MCP 미노출(대화형 유지).

## 검증
- TDD: `tests/memory-eval-init.test.ts` 신설(9건) — 구현 전 red(신규 동작 4건 실패) 확인 후 구현 → green.
  - 후보 0 → 전체 목록(패턴 포함)에서 선택 → 라벨 기록 / scoreEval 에서 found:false·recallAt5 0 반영
  - 후보 0 + 엔터(정답 없음) → skip·평가셋 미생성 / 목록 >20 → 키워드 필터 후 선택
  - 히트 쿼리: 기존 숫자 선택·엔터 skip 하위호환 / `m` → top-5 밖 정답(miss 라벨)
  - 픽커 무효 입력 → skip / 빈 memory → 프롬프트 0회 skip / 비-TTY → 프롬프트 0회 + exitCode 2
- 게이트: `pnpm build` ✅ · `pnpm typecheck` ✅ · `pnpm test:run` 2396 pass(214 files) ✅ · `pnpm lint` ✅
- 라벨 데이터는 생성하지 않음(라벨링은 사람 몫) · recall-log.jsonl 무접촉.

## 한계
- patterns 정답은 recall 코퍼스 제외 때문에 영구 miss — recall 이 patterns 를 검색해야 하는지는 별도 논의(이번 스코프 밖, 이슈로 분리 가능).
- "정답 없음" 쿼리는 기록이 안 남음(스키마 확장 최소화 원칙) — 무효 쿼리 비율 계측이 필요해지면 별도 스키마 논의.
- 픽커 페이지는 상위 20건 + 필터 유도 방식(진짜 페이지네이션 아님) — 기억 수백 건 규모에서 불편하면 후속 개선.
