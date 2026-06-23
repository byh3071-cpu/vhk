# 2026-06-24 — verify 게이트에 lint 추가 (#381 거짓완료 클래스 포획)

> 동기: receipt(=verify 게이트 소비)가 typecheck/test/build/secure 4종만 봐서 eslint 실패(#381 류)를 못 잡음.
> lint 추가 → receipt 가 그 거짓완료 클래스도 red 로 포획 + verify 가 CI gate(tsc→eslint→build)와 정합.

## 한 일
- `src/commands/verify.ts`
  - `GateResult.id` 유니온에 `'lint'` 추가 + `runScriptGate` 시그니처 동기.
  - `runGates` 에 lint 게이트 추가(typecheck **바로 뒤** — 정적검사 묶음). `scripts.lint` 있으면 `pm run lint` 실행→실종료코드로 pass/fail, **없으면 skip**(비-lint 프로젝트 fail 0). typecheck/test/build 와 동일 패턴.
  - `verificationChecklist()` 에 린트 항목 추가(사람용 SoT).
- `src/commands/review.ts` `impliedGates`: 게이트 풀세트 분기에 lint 추가 + `린트|lint|eslint|biome` 키워드 매핑.
- `README.md`: verify 게이트 설명 `tsc/lint/test/build/secure` 로 갱신.

## receipt 합류 (수정 0)
- `src/lib/receipt.ts`·`src/commands/receipt.ts` **무수정**. 수집부(`collectReceipt`)가 `report.gates.filter(status==='fail')` 로 게이트 id 에 일반적 → lint fail 이 `failedGateIds`·`red` 에 자동 합류 → decision=block.

## 검증 (TDD)
- 신규 테스트(red→green):
  - `tests/verify.test.ts`: lint fail→FAIL · lint 스크립트 없음→skip(FAIL 아님) · lint pass · 게이트 집합 `[typecheck,lint,test,build,secure]` 5종 단언 + 손상 package.json all-skip 에 lint 추가.
  - `tests/receipt.test.ts`: 임시 git 레포(base-sha 고정)에서 lint 에러→`evidence.gates.red=true`·`failedGateIds∋lint`·decision=block.
- 게이트: `pnpm build` ✓ · `pnpm lint` exit 0 ✓ · `pnpm test:run` 1991 pass ✓ · `node dist/index.js secure scan` CRITICAL:0 ✓.
- E2E(dist): 실패 lint 스크립트 repo → `verify --json` → status=FAIL, gates `typecheck=skip,lint=fail,test=skip,build=skip,secure=pass`, total=5.

## 결정·주의
- lint 검출 키는 `scripts.lint`(eslint 설정 단독 감지 아님) — typecheck/test/build 가 scripts 우선인 기존 패턴과 일관. preflight 의 `detectHasLinter`(스크립트 OR 설정)와는 의도적으로 다른 층(verify=실행 게이트, preflight=권고).
- GA: 기존 4게이트 동작·id·시그니처 불변(추가만). `buildReport`/`aggregateStatus` 등 명시 게이트 배열을 받는 함수는 무변경.

## 남은 위험
- verify 가 lint 만큼 느려짐(consumer 프로젝트에 lint 스크립트 있으면). 비-lint 프로젝트는 skip 이라 영향 0.
- consumer 의 lint 가 verify 와 별개 설정(예: lint-staged 만)이면 verify 가 전체 lint 를 돌려 더 엄격할 수 있음 — skip 경로로 비-lint 회귀는 0 이나, lint 스크립트 보유 repo 는 이제 lint 통과가 verify PASS 조건에 포함됨(의도된 동작).
