---
vhk_format: 1
type: goal
id: 97
title: evolve 효과측정 — apply/reject 결정 로그 + check 위반수 스냅샷 (#374)
status: DONE
priority: P2
created: 2026-07-04
completed: 2026-07-04
leads_to: "evolve 채택률·기각사유 분포·RULES.md 위반수 추세를 실측 데이터로 축적 시작 (vhk stats --trend 소비)"
---

# Goal 97: evolve 효과측정 (#374)

> 출처: 이슈 #374 — "진화(evolve) 제안이 실제로 채택되는지, 반영 후 효과가 있는지 측정 0건"이라는
> 격차 지적. 사전 조사(Design 단계, 읽기전용)로 `evolve.ts`(apply/reject 상태전이는 있으나 이벤트
> 히스토리 0건) · `check.ts`(위반 카운트가 console.log 로만 출력, 리턴값·영속 0건)를 실측 확인 —
> `docs/state/data-needs-analysis.md`·`research-backlog.md`(2026-06-22)에 이미 존재하던
> `evolve-log{suggId,applied,rejectReason}` 스키마 초안의 구체화 지시였음을 확인.

## 근거

- `evolveApply()`/`evolveReject()`(`src/commands/evolve.ts`)는 큐(`queue.json`, **로컬전용·
  gitignore**)의 `status` 만 덮어쓴다 — "언제 왜 결정됐는지" 이벤트 히스토리가 0건이었다.
- `checkRules()`(`src/commands/check.ts`)의 위반 카운트(`allViolations.length`)는 콘솔 출력
  전용 — 리턴값·`--json`·파일 영속 어디에도 없었다(전수 grep으로 재확인).
- `.vhk/events/*.jsonl`(`ai-actions.jsonl`·`receipt-log.jsonl`)이 이미 확립된 "추적되는 JSONL
  이벤트 원장" 패턴 — `self-tracked.ts`의 `SELF_TRACKED_DIR_PREFIX`가 이 디렉터리 전체를 dirty
  판정에서 이미 prefix 로 면제(Goal 85/#315 동형) → 신규 로그를 여기 두면 추가 코드 없이 안전.
- **gitignore 비대칭 긴장**(설계 조사에서 발견, RFC 0057 §6.1 과 동일 계열): 신규 로그의 조인키
  (`suggId`·`patternId`)는 로컬전용 파일(`queue.json`·`memory.json`)에서 나오는데, 로그 자체는
  git 추적 파일이 된다 — 새 클론/다른 머신에선 로그가 가리키는 실체가 없을 수 있다. 이 로그는
  "이 머신의 결정 히스토리"로만 의미부여하기로 결정(코드 comment 로 고정, 후속 검토 유보).

## 동작

1. **`src/lib/evolve-log.ts`**(신규) — `EVOLVE_LOG_REL='.vhk/events/evolve-log.jsonl'`.
   `EvolveLogEntry{ts,suggId,patternId,targetLayer,applied,rejectReason}`. `buildEvolveLogEntry`
   순수함수(ts 를 호출부가 주입 — receipt-log.ts 와 동일 철학) + `readEvolveLog`/`appendEvolveLog`
   (receipt-log.ts 미러: BOM-safe·손상라인 skip·원자쓰기).
2. **`src/lib/check-log.ts`**(신규) — `CHECK_LOG_REL='.vhk/events/check-log.jsonl'`.
   `CheckLogEntry{ts,totalRules,total,errors,warnings}` + 동일 패턴의 빌더/리더/어펜더.
3. **`evolveApply()`**(`src/commands/evolve.ts`) — `applied` 확정 직후 `appendEvolveLog(cwd,
   buildEvolveLogEntry(item, true, now))` (best-effort try/catch, RULES.md 반영 판정을 막지 않음).
4. **`evolveReject(idStr, reason?)`**(`src/commands/evolve.ts`) — 시그니처에 optional `reason`
   위치인자 추가(대화형 프롬프트 아님 — MCP 모드 inquirer 금지 규칙 준수). `rejected` 확정 직후
   `appendEvolveLog(cwd, buildEvolveLogEntry(item, false, now, reason?.trim() || null))`.
   `src/index.ts`의 `evolve reject <id> [reason]` 커맨드가 이 인자를 전달.
5. **`checkRules()`**(`src/commands/check.ts`) — 콘솔출력과 분리된 순수 계산부
   `computeCheckSummary(rules, cwd)` 추출(export, `--json`/check-log 가 `rule.check(cwd)` 재호출
   없이 결과 공유). `CheckOptions.json?: boolean` 추가 — `--json` 시 `evolveList --json` 과 동일
   컨벤션(순수 JSON, exitCode 유지)으로 요약 출력. 실행마다(자동 규칙이 1개 이상일 때만)
   `appendCheckLog`.
6. **`src/commands/stats.ts`** — `calcAdoptionStats(entries)`: evolve-log 기반 "결정된 것(applied+
   rejected) 대비" 채택률(기존 `calcApplyRate`=전체 큐 대비와 별개, 하위호환 유지) + 기각사유
   분포(내림차순, 사유 없음은 `"(사유 없음)"` 버킷 — 표본 부족을 위장하지 않음). `computeCheckTrend
   (entries)`: `computeReceiptTrend` 와 동일한 정렬→절반분할→평균비교 알고리즘 재사용, 앞/뒤 절반
   평균 위반수 비교(delta 양수=악화). `vhk stats --trend` 가 두 섹션을 추가 렌더(표본 0 은 "표본
   없음" 정직 표기, 억지로 0%/0건으로 위장 안 함).

## Completion Check

- [x] `src/lib/evolve-log.ts`(신규) — `EvolveLogEntry` 타입 + `buildEvolveLogEntry`(순수, ts 인자
      주입) + `readEvolveLog`(BOM-safe·손상라인 skip) + `appendEvolveLog`(원자쓰기).
- [x] `src/lib/check-log.ts`(신규) — 동일 패턴의 `CheckLogEntry`/`buildCheckLogEntry`/
      `readCheckLog`/`appendCheckLog`.
- [x] `evolveApply()` 가 applied 확정 시점에 `appendEvolveLog` 배선(best-effort).
- [x] `evolveReject(idStr, reason?)` — 시그니처에 optional reason 추가 + rejected 확정 시점에
      `appendEvolveLog` 배선. `src/index.ts` 의 `evolve reject <id> [reason]` 이 인자 전달.
- [x] `checkRules()` 리팩터링 — `computeCheckSummary`(export, 콘솔출력 0) 추출 + `CheckOptions.json`
      추가 + `--json` 시 순수 JSON 출력 + 실행마다 `appendCheckLog`(자동 규칙 0개면 미기록).
- [x] `src/commands/stats.ts` — `calcAdoptionStats`(결정 기준 채택률 + 기각사유 분포) +
      `computeCheckTrend`(앞/뒤 절반 위반수 비교) 추가, 기존 `calcApplyRate` 하위호환 유지.
      `vhk stats --trend` 렌더에 두 섹션 추가.
- [x] TDD(RED 확인 후 GREEN) — `tests/evolve-log.test.ts` · `tests/check-log.test.ts` ·
      `tests/stats-evolve-effect.test.ts` · `tests/check-json-and-log.test.ts` ·
      `tests/evolve-reject-reason.test.ts` · `tests/evolve-apply-log.test.ts`(inquirer mock +
      `VHK_FORCE_INTERACTIVE` 로 TTY 필요 커맨드까지 통합 검증).
- [x] 공통 게이트(_meta) + `check-goal-97.mjs`(고유 검증으로 채움).

## 구현 결과 (2026-07-04)

- `src/lib/evolve-log.ts`(신규) — gitignore 비대칭 긴장을 why 블록주석으로 코드에 고정(다음
  구현자가 같은 함정에 다시 빠지지 않도록).
- `src/lib/check-log.ts`(신규) — check-log 는 `vhk check` 명시 실행시에만 쌓임(verify/receipt
  미연동, 의도적 — 모듈 결합 최소화 원칙).
- `src/commands/evolve.ts` — `evolveApply`/`evolveReject` 양쪽에 best-effort try/catch 로 로그
  append 배선. 로그 실패가 본 판정(RULES.md 반영/큐 상태전이)을 절대 막지 않음.
- `src/commands/check.ts` — `computeCheckSummary` 추출로 `rule.check(cwd)` 중복 호출 제거(콘솔
  렌더가 `violationsByRule` 맵으로 계산 결과 재사용). `--json` 은 RULES.md 없음/자동규칙 0개/
  일반 케이스 3가지 분기 모두 지원.
- `src/commands/stats.ts` — `calcAdoptionStats`/`computeCheckTrend`를 `computeReceiptTrend` 바로
  옆에 배치(같은 파일, 같은 알고리즘 재사용 원칙 시각적으로 드러남). `renderEvolveEffect()` 함수로
  `--trend` 출력에 추가 — receipt 추세와 분리된 별도 섹션.

### 게이트

`pnpm exec tsc --noEmit` clean · `pnpm build` green · `pnpm lint` clean(0 findings) ·
`pnpm test:run` 2275/2275 green(신규 6개 테스트 파일, 40개 신규 케이스).

## Forbidden Actions (OUT)

- `queue.json`/`memory.json` 을 git 추적으로 전환 금지 — 로컬전용 유지가 원래 설계 의도(사적
  정보/실험적 상태를 레포에 남기지 않음). 이번 goal 은 그 비대칭을 없애지 않고 인지·문서화만 한다.
- `evolveReject` 에 inquirer 대화형 프롬프트로 사유를 받는 방식 금지 — MCP 모드 inquirer 호출
  금지 규칙 위반. 반드시 비대화형 위치인자.
- check-log 를 `verify`/`receipt` 자동 게이트에 자동 연동 금지 — 사용자가 명시적으로 `vhk check`
  를 실행할 때만 쌓인다(verify 스코프 침범 방지, 모듈 결합 최소화 — 설계 조사의 openQuestion 중
  "자동 스냅샷" 옵션은 이번 스코프에서 채택하지 않음).
- 기존 `calcApplyRate`(전체 큐 대비 적용율) 제거·시그니처 변경 금지 — 신규 `calcAdoptionStats`
  (결정 기준)는 추가일 뿐 대체가 아니다(하위호환).

## Mandatory Reading

`src/lib/receipt-log.ts`(미러링 원본 패턴) · `src/lib/evolve-log.ts` · `src/lib/check-log.ts` ·
`src/commands/stats.ts`(`computeReceiptTrend` — 재사용된 정렬/분할/비교 알고리즘) ·
`docs/state/data-needs-analysis.md`·`research-backlog.md`(2026-06-22, 이 goal 의 스키마 초안 출처)
