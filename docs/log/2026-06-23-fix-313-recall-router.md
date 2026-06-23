# 2026-06-23 — fix #313: recall/회상 NL 라우터 가로채기 차단

## 증상
`vhk recall "이거 어떻게 해"`처럼 검색 쿼리 본문에 NLP 트리거 단어(어떻게·보안·롤백 등)가
섞이면, 명시한 recall 서브커맨드가 무시되고 NL 라우터가 문장을 가로채 status/secure/undo 등
엉뚱한 명령이 실행됨. recall 은 자유형식 검색이라 어떤 단어가 와도 항상 `🔎 기억 회상`이 나와야 함.

## 근본 원인
`src/lib/cli-args.ts` 의 `FREEFORM_ARG_COMMANDS` 가 `learn/교훈/blocker/블로커` 만 포함하고
`recall/회상` 누락. recall 은 `.command('recall [query...]')` 자유형식인데 freeform 예외에서
빠져 `detectNaturalLanguageInput` 분기에서 NL 라우팅됨(#147이 learn/blocker에 적용한 패턴 누락).

## 수정
- `FREEFORM_ARG_COMMANDS` 에 `'recall', '회상'` 추가 (#147 패턴 그대로).
- 회귀 가드 `tests/memory-recall.test.ts` 에 트리거 단어 포함 케이스 6건 추가
  (어떻게·보안·롤백·한글별칭 + 대조군 publish + learn/blocker 회귀).

## 게이트
- `pnpm build` ✅ / `pnpm test` ✅ (177 files · 1805 tests pass)
- TDD: RED(4 fail) → 구현 → GREEN.
