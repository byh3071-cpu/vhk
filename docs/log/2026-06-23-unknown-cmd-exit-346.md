# 2026-06-23 — 미인식 명령 exit 0 위장 수정 (#346)

> 6-22 도그푸딩 med. high 7 + resume #353 완료 후 med 착수.

## 문제
`vhk zzzz`(오타·미지 명령)가 **exit 0 + stdout ❓ 안내** → `vhk <오타> && 다음작업` 류가 조용히 통과(CI/스크립트 무인 실패 누락). commander 는 옵션오류·잘못된 서브커맨드를 exit 1 로 처리하는데 '최상위 미지 명령'만 0 으로 누출.

## 수정
- `nlp-run.ts` runNaturalLanguageRoute: 미매칭(route===null) → `console.log` → **`console.error`(stderr) + `process.exitCode=1`**. commander 의 exit 1 관례와 일관.

## 검증
- E2E(파이프 없이 — `$?` 가림 방지): `zzzz`·다중토큰 → exit 1 + stderr ❓ / `status` → exit 0(회귀 0).
- 회귀 테스트 `nlp-run-exit.test.ts`(미인식 → exitCode 1).

## 남은 med/low
#345(유령 KNOWN 토큰)·#344(레지스트리 드리프트 env/design)·#330(goal id 비숫자) — 별도 추적.
