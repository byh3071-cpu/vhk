# 2026-07-04 — 이슈 #373 자율성완주율 재시도 — vhk autonomy-log 런 시작/종결 계측 (goal 99)

> append-only. 추가만, 수정·삭제 금지.

## 배경

이전 시도가 Plan Mode 오탐으로 조사만 하고 멈췄던 트랙의 재시도. 격리 워크트리에서 실제
구현·테스트·게이트까지 완주하는 것이 이번 세션의 목표. 사전 조사(이미 완료된 설계)를
그대로 TDD 로 구현했다.

## 한 일

`vhk autonomy-log` 신규 CLI 커맨드 — vhk-auto SKILL.md 자율 루프가 "몇 번 시작해서 몇 번
사람 개입(HARD_STOP·blocker) 없이 끝났나"를 `.vhk/events/autonomy-run.jsonl` 에 append-only
로 남긴다.

## 설계 근거

### 1. 4번째 이벤트 `blocked` — 이슈 원안엔 없었지만 필수

이슈 원안은 `start`/`complete`/`hardstop` 3개만 제안했으나, SKILL.md 루프 6번의 3번째
종결 분기("3사이클 진전 없음 → `vhk blocker`")에 대응하는 이벤트가 없으면 이 경로로 끝난
런이 통계에서 누락돼 완주율 분모가 부정확해진다. `blocked` 를 4번째로 추가.

### 2. `action-ledger.ts` 패턴 그대로 복제 — 새 관례 안 만듦

writer(`appendAutonomyEntry`)+reader(`readAutonomyLog`) 를 한 파일(`autonomy-log.ts`)에
같이 둔 것은 `recall-log.ts` 스타일, append-only(dedup 없음)·`mkdirSync` 선행·BOM-safe
파싱(`stripBom` 경유, 손상 라인 skip)은 `action-ledger.ts` 그대로. 목적이 다른 별개 원장
(행동 단위 vs 런 단위)이라 파일·스키마를 통합하지 않았다(Forbidden 로 goal 카드에 명시).

### 3. `--run-id` 없이 종결 이벤트 기록 거부 — `blocker()` 방어 패턴 재사용

`blocker('')` 가 "빈 설명이면 기록 안 함" 인 것과 동일 계약으로, `complete`/`hardstop`/
`blocked` 이벤트가 `--run-id` 없이 호출되면 기록하지 않고 `exitCode=1`. runId 없이 기록하면
어느 런의 종결인지 알 수 없는 고아 라인이 되어 완주율 계산 자체가 오염되기 때문.

### 4. `--event` 값 코드 레벨 allowlist 검증

CLAUDE.md 규칙("LLM 이 뱉는 닫힌집합 값은 프롬프트 제약만 믿지 말고 코드에서 allowlist
대조")을 따라 `src/index.ts` 의 액션 핸들러에서 `Set(['start','complete','hardstop','blocked'])`
로 즉시 검증 — commander 옵션 파서가 임의 문자열을 통과시켜도 여기서 걸러진다.

### 5. `--goal` 자동감지 — 기존 관례 재사용

`blocker`/`learn`/`win` 과 동일하게 `activeGoalId()`(active goal 선택 자동감지) 재사용.
새 감지 로직을 만들지 않았다.

## 변경 파일

신규: `src/lib/autonomy-log.ts`, `tests/autonomy-log.test.ts`, `goals/99-autonomy-run-log.md`,
`scripts/check-goal-99.mjs`.

수정: `src/commands/agent.ts`(`autonomyLog()` 추가) · `src/index.ts`(커맨드 등록 + `--event`
allowlist 검증) · `src/lib/command-registry.ts`(TOP_LEVEL_COMMANDS) · `src/lib/cli-args.ts`
(KNOWN_COMMAND_TOKENS 영문+한글) · `src/i18n/ko.ts`(`agent.autonomyLogTitle`) ·
`.claude/skills/vhk-auto/SKILL.md`(INV-9 신설 + 루프 2/6번 훅 삽입) · `COMMANDS.md`(카탈로그
행 추가) · `tests/agent.test.ts`(CLI 레이어 테스트 6개) · `tests/cli-args.test.ts`(옵션토큰
NL 라우터 회귀 2개) · `goals/README.md`(재생성).

`nlp-router.ts`/MCP `server.ts` 등록은 생략 — `blocker`/`watch` 선례(사람이 대화체로 안
부르는 에이전트 전용 명령). `.vhk/events/*.jsonl` 은 `src/lib/self-tracked.ts` 의
`SELF_TRACKED_DIR_PREFIX` 가 이미 prefix 로 dirty 판정을 면제해 수정 불필요.

## 게이트

`pnpm exec tsc --noEmit` clean · `pnpm build` green(먼저 실행 필요 — 워크트리 초기
`dist/` 없어서 e2e 테스트 3개가 일시적으로 빈 stdout 으로 실패했다가 빌드 후 통과) ·
`pnpm lint` clean · `pnpm test:run` 전체 green.

## 이 워크트리에서 겪은 순서 노트

`pnpm build` 를 먼저 돌리지 않고 `pnpm test:run` 부터 실행하면 `tests/cli-args.test.ts` 의
`dist/index.js` 를 spawn 하는 e2e 테스트 3개(`vhk 보안 확인`·`vhk learn`·`vhk --version`)가
빈 stdout 으로 실패한다 — 새 워크트리라 `dist/` 가 아직 없었기 때문(코드 결함 아님). 순서를
`tsc → build → test → lint` 로 맞추니 해결.

또한 `COMMANDS.md` 갱신을 빠뜨리면 `tests/commands-doc.test.ts`("TOP_LEVEL_COMMANDS 전
명령이 COMMANDS.md 에 등장")가 즉시 잡아준다 — command-registry 등록과 문서 갱신이
분리되어 있어도 CI 가 드리프트를 놓치지 않는 구조임을 실측 확인.

## 교훈

- **완주율처럼 "런 전체의 결말"을 재는 로그는 행동 단위 원장(action-ledger)과 분리해야
  질문에 정확히 답할 수 있다.** 하나로 합치면 "행동이 몇 번 차단됐나"와 "런이 몇 번
  완주했나"가 뒤섞여 각각의 분모/분자 계산이 필터링 로직에 의존하게 된다 — 별개 파일 +
  별개 스키마가 더 단순하다.
- **이슈 원안이 항상 완전하지 않다.** 실제 실행 경로(SKILL.md 루프의 3가지 종결 분기)와
  대조하면 누락(4번째 `blocked` 이벤트)이 드러난다 — 설계를 코드로 옮기기 전에 "이 스키마가
  실제 실행되는 모든 종결 경로를 커버하는가"를 먼저 대조해야 한다.

## 추가 — 적대검증 결함수정 (같은 날)

적대적 검증(별도 에이전트)이 실버그 1건을 잡았다: `src/index.ts`의 `autonomy-log` 액션이
`--goal`/`--ticks`/`--interventions` 를 `Number()`로 무검증 변환 — `--goal abc``→NaN(자동감지
무력화, 문서상 "생략시 자동감지"와 다른 동작), `--goal " 1"`(공백패딩)→조용히 goal 1 로 오염.
이 레포에 이미 있는 `#317`(`resolveGoalId`, `src/commands/goal.ts`)과 똑같은 실패유형인데
이번 신규코드는 그 가드를 안 따랐다.

수정: `src/commands/agent.ts`에 `parseAutonomyIntArg()`+`INVALID_AUTONOMY_ARG` 마커 추가
(`/^\d+$/` 만 통과, `#317`과 동일 계약) — `src/index.ts`가 `Number()` 호출 전에 이걸로
검증 후 거부시 exitCode=1. TDD로 RED(`parseAutonomyIntArg is not a function`)→GREEN(12개
케이스: 정상 3 + 거부 8 + undefined 1) 확인. `tests/agent.test.ts`에 회귀 테스트 추가.

`goals/99-autonomy-run-log.md`의 `leads_to` 문구도 정정 — "이슈 #373 완료"라고 과장했던 걸
"로깅 스키마+커맨드까지만, 이슈 자체(분석 산출·승격임계)는 OPEN 유지"로 정확히 고침.

게이트: `pnpm exec tsc --noEmit` clean · `pnpm build` green · `pnpm test:run` 2261/2261 green
(신규 12케이스 포함) · `pnpm lint` clean.

**교훈**: 이 레포에 이미 있는 방어 패턴(`#317`)을 신규 코드가 반복 안 하는 사례 — "숫자로
변환하는 CLI 옵션은 전부 `/^\d+$/` 가드를 거친다"가 house rule 이라면, 신규 커맨드 작성 시
과거 이슈 번호로 검색(`grep -rn "resolveGoalId\|파괴적.*강제변환"`)해서 유사 패턴이 있는지
먼저 확인했어야 한다 — 처음부터 설계 단계에 넣었으면 이 재작업 자체가 불필요했다.
