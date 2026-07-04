# 2026-07-04 — #374: evolve 효과측정 (goal 96)

> append-only. 추가만, 수정·삭제 금지.

## 한 일
"진화(evolve) 제안이 실제로 채택되는지·반영 후 효과가 있는지 측정 0건"이라는 이슈 #374 격차를
메웠다. evolve apply/reject 결정 이벤트를 영속화하고(evolve-log.jsonl), `vhk check` 실행마다
RULES.md 위반 총계 스냅샷을 남기고(check-log.jsonl), 이 둘을 `vhk stats --trend`에서 "결정 기준
채택률"·"위반수 추세"로 분석·노출했다.

### 사전 조사 (Design 단계, 읽기전용)
- `evolveApply()`/`evolveReject()`(evolve.ts)는 큐(`queue.json`, **로컬전용·gitignore**)의
  `status`만 덮어쓴다 — 이벤트 히스토리 0건 확인. `evolveReject`는 사유 인자 자체가 없었다.
- `checkRules()`(check.ts)의 위반 카운트는 console.log 전용 — 리턴값·`--json`·파일 영속 어디에도
  없음(전수 grep 재확인).
- `.vhk/events/*.jsonl`(ai-actions.jsonl·receipt-log.jsonl)이 이미 확립된 "추적되는 JSONL 이벤트
  원장" 패턴 — `self-tracked.ts`의 `SELF_TRACKED_DIR_PREFIX`가 이 디렉터리를 dirty 판정에서 이미
  prefix로 면제(#315 동형) → 신규 로그는 추가 코드 없이 안전.
- `docs/state/data-needs-analysis.md`·`research-backlog.md`(2026-06-22)에 거의 동일한 스키마
  초안(`evolve-log{suggId,applied,rejectReason}`)이 이미 존재 — 이슈 #374는 이 문서의 구체화
  지시였음을 확인.
- **gitignore 비대칭 긴장 발견**(RFC 0057 §6.1 메모리 프라이버시 긴장과 동일 계열): 신규 로그의
  조인키(suggId·patternId)는 로컬전용 파일(queue.json·memory.json)에서 나오는데, 로그 자체는 git
  추적 — 새 클론/다른 머신에선 로그가 가리키는 실체가 없을 수 있다. 코드 comment로 캐비어트 고정,
  "이 머신의 결정 히스토리"로만 의미부여하기로 결정(draft 원문 복사 대안은 원장 비대화 우려로 이번
  스코프 제외).

### 변경
- `src/lib/evolve-log.ts` (신규) — `receipt-log.ts` 패턴 미러. `EVOLVE_LOG_REL=
  '.vhk/events/evolve-log.jsonl'`. 순수 `buildEvolveLogEntry(item, applied, ts, rejectReason?)` +
  `readEvolveLog`(BOM-safe·손상라인 skip) + `appendEvolveLog`(원자쓰기).
- `src/lib/check-log.ts` (신규) — 동일 패턴. `CHECK_LOG_REL='.vhk/events/check-log.jsonl'`.
  `CheckLogEntry{ts,totalRules,total,errors,warnings}`.
- `src/commands/evolve.ts` — `evolveApply()`가 applied 확정 직후 `appendEvolveLog(...,true,now)`.
  `evolveReject(idStr, reason?)` — 시그니처에 optional reason 추가(TTY 프롬프트 아님, 비대화형
  위치인자 — MCP 모드 inquirer 금지 규칙 준수), rejected 확정 직후
  `appendEvolveLog(...,false,now,reason)`. 둘 다 best-effort try/catch(로그 실패가 본 판정을 안 막음).
- `src/index.ts` — `evolve reject <id> [reason]` 커맨드 등록 + `check --json` 옵션 등록.
- `src/commands/check.ts` — `computeCheckSummary(rules, cwd)` 추출(export, 콘솔출력과 분리 —
  `rule.check(cwd)` 중복 호출 없이 콘솔 렌더/`--json`/check-log가 결과 공유). `CheckOptions.json`
  추가, `--json`은 `evolveList --json` 컨벤션(순수 JSON) 재사용. 실행마다(자동 규칙 1개 이상일
  때만) `appendCheckLog`.
- `src/commands/stats.ts` — `calcAdoptionStats(entries)`: evolve-log 기반 "결정된 것(applied+
  rejected) 대비" 채택률(기존 `calcApplyRate`=전체 큐 대비와 별개, 하위호환 유지) + 기각사유 분포
  (내림차순, 사유 없음은 "(사유 없음)" 버킷). `computeCheckTrend(entries)`: `computeReceiptTrend`와
  동일한 정렬→절반분할→평균비교 알고리즘 재사용, 앞/뒤 절반 평균 위반수 비교(delta 양수=악화).
  `vhk stats --trend`가 `renderEvolveEffect()`로 두 섹션 추가 렌더.
- `goals/96-evolve-effect-measurement.md` + `scripts/check-goal-96.mjs` (신규).
- `COMMANDS.md` — `evolve reject <id> [reason]`·`check --json`·`stats --trend` 설명 갱신(동작
  변경 반영).

### TDD
RED(6개 신규 테스트 파일, 모듈 미존재로 collect 실패 확인) → GREEN(40개 신규 케이스 전부 통과).
Windows 특이사항: `process.chdir(tmpDir)` 후 `fs.rmSync(tmpDir)`을 호출하면 `EPERM`(cwd가 자기
자신을 못 지움) — 정리 전 반드시 `process.chdir(origCwd)` 먼저 호출해야 함(기존
evolve-pattern-mission-hardstop.test.ts의 `finally` 패턴을 뒤늦게 확인, 새 테스트 4개 파일에서
동일 수정).

### 게이트
`pnpm exec tsc --noEmit` clean · `pnpm build` green · `pnpm lint` clean(0 findings, 이 워크트리는
`node_modules`가 sparse해 `pnpm install` 1회 필요했음 — goal 94 dev log의 기존 실측과 동형) ·
`pnpm test:run` 2275/2275 green(신규 40 케이스 포함).

## 다음
- gitignore 비대칭 긴장(evolve-log 조인키가 로컬전용 파일 참조) — 후속 검토 유보 항목으로 명시.
- check-log는 `vhk check` 명시 실행시에만 쌓임 — evolve apply 전후 효과를 보려면 사람이 apply
  전후로 각각 `vhk check`를 실제로 돌려야 유의미한 신호가 쌓임(자동 스냅샷은 이번 스코프 제외).
