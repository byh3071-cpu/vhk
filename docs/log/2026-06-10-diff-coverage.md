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
