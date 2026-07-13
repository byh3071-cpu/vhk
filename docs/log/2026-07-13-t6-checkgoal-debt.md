# 2026-07-13 — RFC 0058 T6: check-goal 스크립트 부채 정리

## 결론

archive된 goal 의 게이트 스크립트 83개를 `scripts/archive/` 로 이동(삭제 0 — 감사 보존),
`scripts/` 에는 활성 goal 게이트 21개만 잔류. "검증 0 스캐폴드 27개" 추정은 실측으로 정정:
**5개(전부 활성 goal 것)** — 보존 + `scripts/archive/README.md` 에 목록·사유 문서화.

## 실측 분류 (check-goal-* 전수 104개 = .mjs 101 + .sh 3)

| 분류 | 수 | 처리 |
|---|---|---|
| archive goal 게이트 (.mjs 80 + .sh 3) | 83 | `scripts/archive/` 로 git mv |
| 활성 goal 게이트 (id 50·62·65·73·79·85~100) | 21 | 잔류 |
| 검증 0 스캐폴드 (isStubGate 기준: 50·62·65·73·79) | 5 | 전부 활성 → 이동 안 함, README 목록화 |
| 참조 때문에 이동 제외된 파일 | 0 | — |

- 스캐폴드 판정 SoT = `scripts/_lib.mjs` `isStubGate`(M.4 메타게이트와 동일 정의).
  archive 83개는 전부 실질 검증 보유 — RFC 의 27개는 감사 시점(07-05) 이후 goal 85~100
  게이트 충전으로 해소됐거나 과대추정.
- 교차 측정(고유 must() 호출 0): 8개 = 위 5 + id 0/1/2(구식 수동 if 검증 — 오탐).

## 참조 깨짐 0 검증 (이동 전 전수 grep)

- `vhk goal check/sync/drift`·`check-meta` M.4: `goals/`·`scripts/` **최상위만** 스캔(비재귀)
  — archive goal id 를 자동 조회하는 경로 없음.
- CI(`ci.yml:55` NOTE): check-goal-* 미연결 — 영향 0.
- tests: 전부 temp dir 픽스처. 실 디렉토리 스캔 2건은 영향 검증 —
  `guard-behavior-migration.test.ts` ratchet 비율 0.63 → 0.25(상한 0.85 이하, 오히려 개선),
  `meta-gate.test.ts:142` 는 활성 DONE goal 게이트가 전부 잔류라 통과 유지.
- package.json·eslint(src 한정)·check-no-stray(src/tests 한정): 참조 없음.

## 변경 내용

- `git mv scripts/check-goal-{archive id}.{mjs,sh}` × 83 → `scripts/archive/`
- 이동으로 깨진 경로만 기계적 수정(검증 로직 무변경):
  - `check-goal-0/1/2/60.mjs`: `'./_lib.mjs'` import → `'../_lib.mjs'` + 루트 고정
    `resolve(HERE, '..')` → `'../..'`
  - `check-goal-5.mjs`: 하위 게이트(0~4) 실행 경로 → `scripts/archive/...`
  - `check-goal-6.mjs`·`check-goal-60.mjs`: 상호참조 read 경로 → `scripts/archive/...`
  - cwd(레포 루트) 기준 경로(`scripts/_lib.mjs` read, check-goal-53의 `scripts/` 집계)는 무수정
- 이동 후 실측: `check-goal-6`·`check-goal-60` 새 위치에서 PASS. `check-goal-1` 은 FAIL 인데
  이동과 무관한 기존 드리프트(goal 0/1/2 카드가 goals/archive/ 로 내려가 `goal list` 에 안
  나옴 — 작성 당시 상태 단언). README 에 "역사 보존이지 현행 green 보증 아님" 명시.
- `scripts/archive/README.md` 신설 — 이동 목록·스캐폴드 실측·참조 검증·기계수정 표·사용 노트

## 게이트

- `pnpm build` / `pnpm test:run` / `pnpm lint` — 결과는 PR 본문·커밋 참조 (green 확인 후 커밋)
- 이동 후 실측: `node dist/index.js goal check --id 96 --force` 정상 (활성 게이트 해석 무영향)

## 교훈

- "N개 추정" 류 감사 수치는 레포 자체 판정기(isStubGate 등)로 재실측이 먼저 — Codex 감사의
  27개는 측정 시점 차이+정의 차이로 현행과 5배 이상 괴리 (RFC 0058 §3 "방향은 신뢰, 수치는
  실측" 원칙 재확인).
- 실 디렉토리를 스캔하는 테스트(`guard-behavior-migration` ratchet)는 파일 이동에도 값이
  변한다 — 이동/삭제 작업 전 "경로 참조" 뿐 아니라 "디렉토리 스캔형 집계" 도 grep 대상에
  포함해야 함.
