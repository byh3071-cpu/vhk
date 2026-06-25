# 2026-06-25 — Phase 1: 영구 코딩 규칙을 ESLint 로 코드화 (의도 검증 방향 1)

> append-only dev log. Goal 87(의도 대조)이 **작업별 계약(mission.json)** 을 검증한 데 이어,
> **프로젝트 영구 규칙(RULES.md)** 을 자동 집행에 합류시키는 작업. 진입점 plan: 의도 검증 강화 방향 1.

## 한 줄 결론

RULES.md 코딩 규칙 중 문서로만 있던 3가지(execSync 신규 금지·빈 catch 금지·명시 any 금지)를 `eslint.config.js` 규칙으로 코드화했다. 이제 `verify` 의 lint 게이트(#381)를 타고 `receipt` 가 위반을 `block` 으로 **자동 흡수**한다 — "AI 가 시킨 것"의 **영구 층**을 자동 검증 루프에 합류.

## 무엇을 (eslint.config.js 3규칙 추가)

| 규칙 | 구현 | 근거 |
|---|---|---|
| R1 execSync 신규 금지 | `no-restricted-syntax` — `CallExpression[callee.name='execSync']` + `MemberExpression[property.name='execSync']` | RULES.md:31/64. `safeExecFile` 은 `execFileSync` 사용(exec.ts)이라 **통로는 안 막힘** — execSync 만 차단 |
| R2 빈 catch 금지 | `no-empty: ['error', { allowEmptyCatch: false }]` | RULES.md:27. 주석으로 사유 밝힌 catch 는 통과(말없이 삼킴만 차단) |
| R3 명시 any 금지 | `@typescript-eslint/no-explicit-any: 'error'` | RULES.md:26. tsc strict 는 implicit 만, 명시 `: any`/`as any` 는 여기서 |

receipt 합류는 #381 로 이미 배선됨(lint fail → `gates.red` → `decideReceipt` block) → **신규 합류 코드 0줄**.

## 검증 (구현 전 적대 검증 포함)

1. **위반 0 실측**: `eslint src` EXIT=0 — 3규칙 적용 후에도 기존 코드 깨끗.
2. **규칙 작동 negative test**: src 에 위반 3개 심은 probe → `no-empty`·`no-explicit-any`·`no-restricted-syntax` 각 1건 검출 후 probe 삭제. "config 오류로 무시돼서 0"이 아님을 확인.
3. **R1 통로 안전**: `safeExecFile` 이 `execFileSync` 사용(execSync 아님) → R1 에 안 걸림.
4. **단위(T1.3)**: `tests/eslint-rules.test.ts` — Linter API 로 8케이스 고정(검출 + 설계결정: 주석 catch 통과·execFileSync 허용·깨끗한 코드 0). 로컬 vitest forks crash 라 tsx 로 8케이스 직접 검증 PASS([[vhk-local-vitest-forks]] → CI 진실원).
5. `tsc --noEmit` 0 · `pnpm build` 성공.

## 설계 결정 (정직)

- **console.log(R4) 제외**: 986건 중 952건이 `src/commands/` 정상 CLI 출력 → 전체 금지 불가. 경로별 차등은 임의 예외 필요 → Phase 3 별도 트랙으로 분리(레버리지 대비 위험).
- **빈 catch 정책**: 주석으로 사유 밝힌 무시는 허용 — RULES.md "빈 catch 금지" 정신(에러 은폐 방지)과 정합. 기존 3건(cloud·evolve)이 그 형태라 위반 0.
- **드리프트 봉인 1차**: 테스트가 eslint.config.js 에 3규칙 존재를 확인. 더 강한 RULES.md↔ESLint 일치는 Phase 2(T2b).

## 잔여 (후속)

- **Phase 2** (병렬): T2a receipt 합류 E2E(규칙 위반 → lint fail → receipt block) · T2b RULES.md↔ESLint 일치 봉인.
- **Phase 3**: console.log 경로별 정책(별도 트랙, 후순위).
- 의도 검증 방향 2(glob 정직화)·3(위조·미설정)·4(objective LLM)는 사용자 추후 결정.
