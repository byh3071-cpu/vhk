---
vhk_format: 1
type: goal
id: 99
title: 자율성완주율 측정 스키마 — vhk autonomy-log 런(run) 시작/종결 계측 — P2
status: DONE
priority: P2
created: 2026-07-04
completed: 2026-07-04
leads_to: 이슈 #373 완료 — vhk-auto 자율 루프의 완주율(런 시작 대비 사람개입 없는 종결)을
  실측 데이터로 축적 시작(향후 stats/trend 분석 토대)
---

# Goal 99: 자율성완주율 측정 스키마 (이슈 #373)

> 출처: 이슈 #373 — VHK 정체성 중 하나인 "자율 루프가 사람 개입 없이 얼마나 완주하는지"를
> 지금까지는 어디에도 기록하지 않았다. `.claude/skills/vhk-auto/SKILL.md` 루프가 매번
> start/complete/hardstop/blocked 4가지 방식 중 하나로 끝나는데, 이 자체가 레포 영속으로
> 남지 않으면 완주율의 분모(런 시작 횟수)·분자(개입 없는 종결 횟수) 어느 쪽도 계산할 수 없다.

## 근거

- 이슈 원안은 `start`/`complete`/`hardstop` 3개 이벤트만 제안했으나, SKILL.md 루프 6번의
  3번째 종결 분기("3사이클 진전 없음 → `vhk blocker`")에 대응하는 이벤트가 빠지면 이 경로로
  끝난 런이 통계에서 누락돼 분모가 부정확해진다 — `blocked` 이벤트를 4번째로 추가.
- `action-ledger.ts`(Goal 55, AI 행동 원장)와 스키마·목적이 다르다: action-ledger 는
  "행동 하나하나가 가드에서 어떻게 판정됐나"를 기록하고, 이 goal 은 "자율 루프 런 하나
  전체가 어떻게 끝났나"를 기록한다 — writer+reader 구조·append-only 계약만 그대로 복제.
- `--goal` 생략 시 `blocker()`/`learn()`/`win()` 과 동일하게 `activeGoalId()`(선택 active
  goal 자동감지)로 채운다 — 새 관례를 만들지 않고 기존 관례를 재사용.
- `--run-id` 없이 종결 이벤트(complete/hardstop/blocked)를 호출하면 기록하지 않고
  exitCode=1 — `blocker()`의 "빈 설명이면 기록 안 함" 방어 패턴과 동일 계약(runId 없이
  기록하면 어느 런의 종결인지 알 수 없어 데이터가 오염된다).

## 동작

신규 CLI 커맨드 `vhk autonomy-log`:

- `vhk autonomy-log --event start [--goal <n>]` → `crypto.randomUUID()` 로 runId 발급 +
  stdout 출력 + `{ts,runId,goal,event:'start'}` append.
- `vhk autonomy-log --event complete --run-id <id> [--goal <n>] [--ticks <n>] [--interventions <n>]`
- `vhk autonomy-log --event hardstop --run-id <id> [...] [--review-rejected]`
- `vhk autonomy-log --event blocked --run-id <id> [...]`

파일:

- `src/lib/autonomy-log.ts`(신규) — `AUTONOMY_LOG_PATH_REL='.vhk/events/autonomy-run.jsonl'`.
  `action-ledger.ts` 의 writer(`appendActionEntry`)+reader(`readActionLedger`) 구조를 그대로
  복제 — 단순 `appendFileSync`, `mkdirSync` 선행, dedup/cap 없음(append-only). `newAutonomyRunId()`
  가 `crypto.randomUUID()` 래핑.
- `src/commands/agent.ts` — `blocker`/`learn`/`win` 옆에 `autonomyLog()` 추가. start 는 runId
  발급, 나머지 3개는 `--run-id` 필수(없으면 기록 안 하고 exitCode=1).
- `src/index.ts` — `autonomy-log` 커맨드 등록(watch 처럼 전부 `--option` 플래그 스타일),
  `--event` 값을 `Set(['start','complete','hardstop','blocked'])` allowlist 로 코드 검증
  (닫힌집합 값은 프롬프트/문서 제약만 믿지 않는다).
- `src/lib/command-registry.ts`/`src/lib/cli-args.ts` — 영문 `autonomy-log` + 한글 별칭
  `자율기록` 등록(등록 4지점 체크리스트).
- `src/i18n/ko.ts` — `agent.autonomyLogTitle` 추가.
- `.claude/skills/vhk-auto/SKILL.md` — INV-9 신설(루프 시작 시 `--event start` 로 runId 발급·
  유지, 종결 분기마다 해당 이벤트로 반드시 종결 기록) + 루프 2번 직후 "런 시작 기록" 삽입 +
  루프 6번 각 분기 말미에 이벤트 호출 삽입(합격→complete, HARD_STOP→hardstop[+review-rejected],
  3사이클→blocked).
- `.vhk/events/*.jsonl` 은 `src/lib/self-tracked.ts` 의 `SELF_TRACKED_DIR_PREFIX` 가 이미
  prefix 로 dirty 판정을 면제(수정 불필요). root/.vhk 양쪽 `.gitignore` 모두 `.vhk/events/`
  를 제외하지 않아 git 추적(영속) 대상.
- `nlp-router.ts`/MCP `server.ts` 등록은 생략 — `blocker`/`watch` 선례(사람이 대화체로 안
  부르는 에이전트 전용 명령).

## Completion Check

- [x] `src/lib/autonomy-log.ts`(신규) — `AutonomyEvent`(`'start'|'complete'|'hardstop'|'blocked'`) +
      `AutonomyRunEntry` + `appendAutonomyEntry`/`readAutonomyLog`/`newAutonomyRunId`.
- [x] `src/commands/agent.ts` 의 `autonomyLog()` — start 는 runId 발급, 종결 3종은 `--run-id`
      없으면 기록 안 하고 exitCode=1(blocker() 방어 패턴 계약).
- [x] `src/index.ts`/`command-registry.ts`/`cli-args.ts`/`ko.ts` 4지점 등록(영문+한글 별칭
      회귀 테스트 포함).
- [x] `COMMANDS.md` 카탈로그 표에 신규 명령 행 추가(`tests/commands-doc.test.ts` 정합 유지).
- [x] TDD: `tests/autonomy-log.test.ts`(신규, action-ledger.test.ts 패턴) — append/read,
      append-only, 손상 라인 skip, 원장 없음→빈 배열, 4이벤트 전부 append 가능.
      `tests/agent.test.ts` — `autonomyLog()` CLI 레이어(start/complete/hardstop/blocked +
      run-id 누락 시 거부). `tests/cli-args.test.ts` — 옵션 토큰 있어도 NL 라우터가 안 새는지
      회귀(영문+한글 별칭).
- [x] `.claude/skills/vhk-auto/SKILL.md` — INV-9 + 루프 2/6번 훅 삽입.
- [x] 공통 게이트(_meta) + `check-goal-99.mjs`(고유 검증으로 채움).

## Forbidden Actions (OUT)

- `--run-id` 없이 종결 이벤트(complete/hardstop/blocked)를 기록 허용 금지 — 런 추적 무결성이
  깨진다(어느 런의 종결인지 알 수 없는 고아 라인 방지).
- `AutonomyRunEntry` 필드를 필수(non-optional)로 바꾸는 breaking change 금지 — append-only
  JSONL 이라 과거(필드 없는) 엔트리를 읽는 코드가 깨지면 안 됨.
- action-ledger.ts(`ai-actions.jsonl`)와 파일·스키마 통합 금지 — 목적이 다른 별개 원장
  (행동 단위 vs 런 단위)을 하나로 합치면 각각의 질문에 답하기 어려워진다.
- `nlp-router.ts`/MCP 등록 금지 — 에이전트 전용 명령(blocker/watch 선례).

## Mandatory Reading

`src/lib/action-ledger.ts`(writer/reader 구조 원본) · `src/commands/agent.ts`(`blocker` 의
빈 입력 방어 패턴) · `.claude/skills/vhk-auto/SKILL.md`(INV-1~8, 루프 2/6번 삽입 지점) ·
`tests/action-ledger.test.ts`(테스트 패턴 원본)
