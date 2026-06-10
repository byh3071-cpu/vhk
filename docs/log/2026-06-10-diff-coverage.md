# 2026-06-10 — diff-coverage PR1 (RFC 0050, Goal 50) — 측정 도구 + 도그푸딩

> append-only dev log. 추가만, 수정·삭제 금지.

## 한 일 (feat/diff-coverage 브랜치, PR 예정)

"이번 변경이 테스트로 실제 실행됐나"를 측정하는 자문형 `vhk diff-cover` + coverage 인프라. review.ts:40 자백("git diff 미사용 — 테스트 green이어도 이번 변경 미커버 가능") 구멍을 측정으로 메우는 첫 단계.

- **설계**: RFC 0050(measure-first — 게이트부터 안 짓고 숫자로 구멍 실재 증명 후 승격). 적대 다관점 리뷰(워크플로는 spend限 중도실패 → 직접 검토)로 모순 3건 수정 후 확정.
- **구현(TDD red→green, 커밋 7+)**:
  - coverage 인프라: `@vitest/coverage-v8@4.1.7` + vitest.config v8 블록(json reporter). coverage/ gitignore.
  - `git-session.diffUnified0`(단일 SoT 확장 — 라인단위 diff).
  - 순수 3모듈: `diff-hunks.addedLinesByFile`(diff→추가라인) · `coverage-parse.fileCoverageByFile`(v8 json→{covered,executable}) · `diff-coverage.diffCoverage`(교차→미검증 변경분).
  - `vhk diff-cover` 명령 + 5지점 등록(import·별칭맵·command·command-registry·cli-args KNOWN_COMMAND_TOKENS). 한글별칭 '커버리지'.
- 테스트 1376→1381. 빌드·typecheck·lint·전체 green.

## 측정 (도그푸딩 — measure-first 루프가 결함 잡음)

PR1 코드 자체(vs main)에 도구를 돌림:

1. **1차**: 미검증 118/213(44%). 그런데 미커버 목록이 import·주석·타입·닫는중괄호 투성이 → **지표가 노이즈에 묻힘**(false-completion 가드가 늑대소년 됨).
2. **결함 수정**: v8 statementMap 검사로 확인 — 비실행 라인(주석/import)은 statement 아님. `coverage-parse`가 `executable`(statement 라인) 노출, `diff-coverage`가 **실행가능 추가라인만** 분모로. 재측정 → 미검증 30(전부 `diffCover()` IO 오케스트레이션 — formatReport만 테스트했음).
3. **자기 dogfood 먹기**: 도구가 가리킨 구멍(diffCover 미테스트)에 통합 테스트 4분기 추가 → 재측정 **미검증 0 / 132 실행가능추가 = 100% diff-coverage**.

→ 빌드→측정→지표결함→수정→진짜구멍→봉합. 합성/단일표본 1건.

## 핵심 결정

- **measure-first 유지**: review 통합·CI 게이트·차단은 PR1 도그푸딩이 "구멍 실재"를 ≥5 실제 코드 diff(며칠)로 증명한 뒤 PR2(RFC 0050 §5 관찰 프로토콜). 단일 표본으론 승격 안 함.
- **"미검증 변경분" = 실행가능 추가라인 중 미커버만**. 비실행(주석·import·타입·중괄호)은 분모에서 제외 — 안 그러면 신호가 노이즈에 묻힘(이번 도그푸딩이 정확히 이걸 잡음).
- Goal 50 카드 "신규분 차단"은 PR2로 미룸(카드↔RFC 정합 표기). status NOT_STARTED→IN_PROGRESS.

## 교훈

- **도그푸딩이 유닛테스트가 못 본 지표 결함을 잡았다** — 1381 유닛테스트 전부 green인데도, 실제 diff에 돌리니 "미검증" 정의가 노이즈(주석/import)를 셈. 신규기능은 실사용 1회로 통합결함 검출(과거 Goal 19 SnapContext 선례 반복).
- **측정 도구도 측정당해야 한다** — diff-cover가 자기 자신을 측정해 자기 미테스트 구멍을 드러냄. 도구가 외친 신호를 무시하면 위선.
- **measure-first가 또 보상** — recall(56/92)에 이어, 게이트 짓기 전에 측정부터 한 덕에 지표 결함을 출하 전에 잡음.

## 다음

1. **며칠 `vhk diff-cover` 실사용** — 실제 코드 작업 diff ≥5건 누적해 미검증 변경분 분포 측정(RFC 0050 §5). 유의미하면 PR2(review 통합 + CI), ≈0이면 "이론적 구멍" 문서화 후 중단.
2. recall 실측(RFC 0049 §5)과 병행 — 둘 다 measure-first 대기.

---

## 후속 (같은 날 2026-06-10 — 같은 세션)

### #239 diff-hunks 파서 버그 (적대적 검증 발견)

PR1 머지 후 "머지해도 됐나" 적대 검증 — **읽기 아닌 실행**(악성 diff 8케이스 직접 돌림). BUG 2건 확정: 헌트 본문의 추가라인 `++ x`(diff에선 `+++ x`)·제거라인 `-- y`(`--- y`)를 파일 헤더로 오인 → 같은 파일 후속 헌트 누락(undercount). TDD red→green·도그푸딩 둘 다 못 친 엣지. 헤더/본문 상태머신(첫 `@@` 이후 `+++`/`---` 무시)으로 차단 + 회귀 테스트 2건. 나머지(새파일·CRLF·파일격리·diff-coverage 엣지)는 견고 확인.

- **교훈**: 적대적 검증은 *실행*으로 — 합성 TDD 입력은 작성자 가정만 검증, 적대적 실행 입력이 가정 밖 노출.

### #240 콜드스타트 −37% (RFC 0047, measure-first가 전략 바꿈)

dep별 import 비용 실측 → **inquirer 단독 212ms = 콜드스타트 절반**(handlebars/notion/simple-git는 20~33ms). "명령 60+ 전부 lazy"(index.ts 통째 재작성·고위험) 대신 **inquirer 하나만 lazy**(`lib/prompt.ts` `await import` 래퍼 + 22파일 코드모드) = 80/20. `vhk --version` 512→323ms(−37%), `status` 739→610. 전체 1385 green(inquirer mock 정상, 테스트 import도 23s→12s). 회귀 가드 `tests/check-inquirer-lazy.test.ts`. splitting 불필요(ESM dynamic import 자체가 지연).

- **교훈**: lazy-load 전 dep별 비용 측정 — 하나가 절반이면 그것만 고치는 게 80/20. 추측으로 전부 lazy화(고위험) 금지.

### #38 close

RFC 0001 .vhk 규격 의견수렴 이슈 — 11일 코멘트 0(솔로). 4개 질문 현재상태로 답하고 close(Q1 드리프트=doctor --strict·goal 43 구현됨, Q2~4 YAGNI). 열린 이슈 0.

### 세션 머지 총 6 PR + 1 close

PR/이슈: #235 recall dev log · #236 diff-coverage PR1 · #237 상태 · #239 파서 · #240 콜드스타트 · #241 정리 · #38 close.

---

## 후속 (같은 날 2026-06-10) — diff-coverage 실측 누적 (RFC 0050 §5, 5 실제 diff)

> §5 관찰 프로토콜: 표본 = 실제 코드 작업 diff ≥5건(합성·단일 금지). 합성 1건(PR1 자기측정)뿐이라 **최근 실제 feature 커밋 5건을 소급 측정**해 누적. 다양성 확보(lazy-load·파서·cost-guard·eval 하네스·recall — 서로 다른 5 goal, ~10일치 작업 #230~#240).

**측정법(소급, 충실):** `dist/`·`coverage/` 둘 다 gitignore → checkout해도 현재 빌드(diff-cover) 유지. 커밋 C마다: `git checkout -f C` → `git reset --soft C^`(작업트리=C, HEAD=C^ → `git diff HEAD`=C의 변경) → `pnpm test:run --coverage`(C 코드 기준 커버리지 ~13초) → `node dist/index.js diff-cover`. 측정 후 `git checkout -f main` 복원. (dep 드리프트 무관: coverage-v8는 main node_modules 사용, 비실행라인은 statementMap로 이미 제외.)

| # | 커밋 | 기능(goal) | raw 미검증/추가 | 커버% | §5 실로직 미검증(분자) |
|---|------|-----------|----------------|-------|----------------------|
| 합성 | #236 6cd57e6 | diff-cover PR1 자기측정 | 0/132 | 100% | 0 (합성 — 표본 제외) |
| 1 | #240 49cc500 | inquirer lazy-load | 29/49 | 41% | **≈0** — 미커버 29는 전부 `inquirer.prompt`→`await prompt()` **기계적 위임 치환**(§5 trivial 제외). 새 로직 래퍼 `lib/prompt.ts`는 커버됨. |
| 2 | #239 1da0f4d | diff-hunks 파서 fix | 0/N | 100% | **0** — 적대검증서 회귀테스트 2건 동반 → 새 로직 다 닿음. |
| 3 | #234 e6586e1 | cost-guard | 0/N | 100% | **0** — TDD(cost-ledger·cost-policy 순수모듈 red→green). |
| 4 | #233 d8047f0 | recall eval 하네스 | 81/129 | 37% | **~76** — `memory-eval.ts` 명령부 76/77 미커버. 순수 lib(`recall-eval`)는 테스트됐으나 **CLI 명령 오케스트레이션(Recall@5/MRR 출력)이 미테스트**. |
| 5 | #232 6640df0 | recall MVP | 24/84 | 71% | **~24** — `memory.ts` 688~711 연속블록 미커버. **just-in-time recall 경고 로직(명령부)이 미테스트.** |

### §5 판정 (잠정 — 사람 결정 입력)

- **실로직 미검증 > 0: 2/5 (#233·#232) = 40% → 과반(≥3/5) 미달 = 승격 임계 불충족.**
- **단 기각 임계(사실상 0)도 아님** — 2건서 실질 미테스트 로직 다수(76·24라인). "구멍은 이론적"이라 단정 불가.
- **핵심 패턴:** 미검증이 몰린 2건은 **둘 다 CLI 명령부(command body) IO 오케스트레이션**. 순수 lib는 TDD로 100% 닿지만 **명령 래퍼는 미테스트**. TDD 규율 커밋(#239·#234)은 100%. → "테스트 green인데 새 로직 미검증" 현상은 **존재하나 명령부에 국한**.
- **PR2 함의:** 명령부 커버리지를 *차단*으로 강제하면 본질상 통합테스트 영역(솔로 부담·Goal 50 OUT 정신)을 단위테스트로 밀어붙이게 됨. → **단순 차단보다 "명령부 미검증 N라인 경고"(advisory·confidence 캡)가 데이터에 부합.** 차단은 여전히 opt-in(`VHK_TEST_FIRST`).

### 결정 보류 (정직)

- 5 표본은 소급 배치 측정(같은 날) — 다양성은 충족하나 §5 "며칠" 정신(조기판단 방지)을 존중해 **PR2 강행 안 함**. 추가로 앞으로의 실제 커밋도 같은 레시피로 누적해 추세 확인 권장(특히 명령부 비중 큰 작업).
- **다음:** ① recall 쪽 측정(RFC 0049 §5)과 합산해 measure-first 2종 종합 판단. ② PR2 가면 "명령부 미검증 경고"형(차단 아님)으로 좁혀 설계. ③ 측정 레시피(위)는 재현 가능 — 향후 커밋마다 ~13초로 표본 추가.

- **교훈:** dist/coverage gitignore 덕에 **현재 빌드로 과거 커밋을 충실 측정** 가능(checkout이 빌드 안 건드림). 소급 측정이 합성 단일표본보다 신호 풍부 — 실제로 recall 두 커밋의 명령부 미검증을 드러냄(유닛 1316~1385 green인데도).
