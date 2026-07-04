---
vhk_format: 1
type: goal
id: 94
title: agent attribution — receipt/ledger 4대 스키마에 에이전트 감지 필드 추가 — P2
status: DONE
priority: P2
created: 2026-07-04
completed: 2026-07-04
leads_to: RFC 0057(기억/복리/에이전트불가지론) 트랙② 완료 — "누가 이 작업을 했는지" 실측 데이터 축적 시작(향후 stats/trend 분석 토대)
---

# Goal 94: Agent Attribution Ledger (RFC 0057 트랙②)

> 출처: RFC 0057(기억/복리/에이전트불가지론) 실측 감사(2026-07-03)에서 발견된 격차 — VHK 는
> "어떤 AI 에이전트(Claude Code/Codex/Cursor 등)가 써도 안 무너진다"는 불가지론 정체성을 갖지만,
> 이걸 자기 데이터로 증명하려면 "누가 이 작업을 했는지"가 기록 계층에 남아야 한다. 감사 시점
> receipt·receipt-log·evidence-ledger·ai-actions-ledger 4개 스키마 전부 이 필드가 0건이었다.

## 근거

- RFC 0057 배경 조사에서 `CLAUDECODE=1`·`CLAUDE_CODE_ENTRYPOINT=cli` 환경변수가 Claude Code
  일반 세션(에이전트가 Bash/PowerShell 로 vhk 커맨드를 직접 실행)에 실제로 존재함을
  `env | grep CLAUDE` 직접 실행으로 확인. `CLAUDE_PROJECT_DIR` 은 훅 서브프로세스 전용(보조 신호).
- 함정 발견: `CODEX_COMPANION_SESSION_ID` 는 Codex 고유 신호가 아니라 "Claude Code 의 codex
  플러그인이 Codex 를 헬퍼로 부를 때 Claude Code 가 세팅하는 값"(`CLAUDE_CODE_SESSION_ID` 와 값이
  완전히 동일함을 실측 확인) — allowlist 에 넣으면 순수 Claude Code 세션을 Codex 로 오분류하는
  거짓 신호가 된다. 의도적으로 제외.
- Codex 단독·Cursor·OpenCode 등 다른 에이전트 고유 환경변수는 이번 세션에서 실측된 바 없어
  추가하지 않는다(추측 금지) — allowlist 는 `'claude-code' | 'unknown'` 2개 값으로 시작.

## 동작

`src/lib/detect-agent.ts`(신규) — `detectAgent(env = process.env): AgentId`. 로컬 환경변수만
보는 결정론 감지(LLM 0). `AGENT_SIGNALS` allowlist 배열을 순회해 첫 매치를 반환, 없으면
`'unknown'`. 향후 다른 에이전트 신호가 실측되면 배열에 항목만 추가하면 되는 구조.

이 감지 결과가 4개 기록 스키마에 옵셔널 `agent?: AgentId` 필드로 흘러든다:

1. **Receipt**(`src/lib/receipt.ts`) — `ReceiptMeta.agent` → `buildReceipt` 가 `Receipt.agent`
   에 반영(`meta.agent ?? 'unknown'`). `collectReceipt()`(`src/commands/receipt.ts`)가 실제
   조립 시점에 `detectAgent()` 호출.
2. **ReceiptLogEntry**(`src/lib/receipt-log.ts`) — `buildReceiptLogEntry` 가 이미 채워진
   `Receipt.agent` 를 그대로 복사(별도 감지 호출 없음).
3. **LedgerEntry**(`src/lib/evidence-ledger.ts`) — `buildLedgerEntry(report, version, agent =
   'unknown')` 3번째 선택 인자. 순수함수 성질 유지를 위해 기본값은 `detectAgent()` 호출이 아닌
   정적 리터럴. 실제 감지는 호출부 `src/commands/verify.ts`(`verifyEvidence()`)가 담당.
4. **AiActionEntry**(`src/lib/action-ledger.ts` writer + `src/lib/ai-actions-ledger.ts` reader,
   두 곳에 독립 선언돼 있어 양쪽 다 추가) — `src/lib/safety-guard.ts` 의 `runGuarded()` 단일
   chokepoint 가 `GuardDeps.agent`(옵셔널 override, 테스트/특수 호출용) 우선, 없으면
   `detectAgent()` 로 자동 채운다.

**불가침 원칙 강제**: `ReceiptEvidence`(`decideReceipt(e: ReceiptEvidence): ReceiptDecision` 이
받는 유일한 타입)에는 `agent` 필드를 절대 추가하지 않는다 — "decision(판정)=기계증거 전용,
LLM 0"을 타입 레벨로 강제(접근 자체가 불가능). `tests/receipt.test.ts` 에 agent 값만 다르고
나머지 evidence 가 동일한 두 Receipt 의 decision·reasons 가 완전히 같음을 확인하는 회귀
테스트로 행동 증명까지 고정.

## Completion Check

- [x] `src/lib/detect-agent.ts`(신규) — `AgentId`(`'claude-code' | 'unknown'`) + `detectAgent()`.
      `CODEX_COMPANION_SESSION_ID` 는 allowlist 에서 의도적으로 제외(회귀 가드 테스트로 고정).
- [x] `ReceiptMeta`/`Receipt`/`ReceiptLogEntry`/`LedgerEntry`/`AiActionEntry`(writer+reader
      양쪽) 에 `agent?: AgentId` 추가 — 전부 옵셔널(기존 append-only JSONL/JSON 하위호환).
      `ReceiptEvidence` 는 절대 건드리지 않음(원칙1 강제).
- [x] 실 조립 지점 4곳에 `detectAgent()` 배선: `collectReceipt()`(receipt.ts) ·
      `verifyEvidence()`(verify.ts, `buildLedgerEntry` 3번째 인자) · `runGuarded()`
      (safety-guard.ts, `appendActionEntry` 호출) · receipt-log 는 Receipt.agent 복사라 배선 불필요(확인 완료).
- [x] `decideReceipt` 순수성 회귀 테스트(`tests/receipt.test.ts`) — agent 만 다르고 나머지
      evidence 동일 → decision·reasons 완전히 동일.
- [x] 5개 스키마 전부 TDD(RED 확인 후 GREEN) — `tests/detect-agent.test.ts`(신규) ·
      `tests/receipt.test.ts` · `tests/receipt-log.test.ts` · `tests/evidence-ledger.test.ts` ·
      `tests/verify.test.ts` · `tests/action-ledger.test.ts` · `tests/ai-actions-ledger.test.ts`.
- [x] 공통 게이트(_meta) + `check-goal-94.mjs`(고유 검증으로 채움).

## 구현 결과 (2026-07-04)

- `src/lib/detect-agent.ts`(신규, 33줄) — `AGENT_SIGNALS` allowlist 배열 순회 방식. 파일 상단에
  왜 이 3개 env var 만 쓰는지 + `CODEX_COMPANION_SESSION_ID` 함정을 why 블록주석으로 고정.
- `src/lib/receipt.ts` — `ReceiptMeta.agent?`/`Receipt.agent?` 추가, `buildReceipt` 가
  `meta.agent ?? 'unknown'` 반영. `ReceiptEvidence`/`decideReceipt` 는 무변경(원칙1).
- `src/commands/receipt.ts` — `collectReceipt()` 가 `buildReceipt` 호출 meta 에
  `agent: detectAgent()` 추가.
- `src/lib/receipt-log.ts` — `ReceiptLogEntry.agent?` 추가, `buildReceiptLogEntry` 가
  `agent: r.agent ?? 'unknown'` (구버전 Receipt 객체 — agent 프로퍼티 자체 없음 — 도 안전).
- `src/lib/evidence-ledger.ts` — `LedgerEntry.agent?` 추가, `buildLedgerEntry(report, version,
  agent: AgentId = 'unknown')` — 순수함수 유지(정적 기본값, `detectAgent()` 호출 없음).
- `src/commands/verify.ts` — `verifyEvidence()` 의 `buildLedgerEntry(...)` 호출에 3번째 인자
  `detectAgent()` 추가.
- `src/lib/action-ledger.ts`(writer) + `src/lib/ai-actions-ledger.ts`(reader) — 두 곳에 독립
  선언된 `AiActionEntry` 양쪽에 동일하게 `agent?: AgentId` 추가(필드 어긋남 방지).
- `src/lib/safety-guard.ts` — `GuardDeps.agent?: AgentId`(override, 테스트/특수 호출용) 추가.
  `runGuarded()` 의 `appendActionEntry(...)` 조립부에 `agent: deps.agent ?? detectAgent()` —
  기존 호출부는 코드 수정 없이 자동으로 env 감지가 적용된다.

### 검증 포인트 — "override 가 감지보다 우선"을 강한 증거로 고정

`tests/action-ledger.test.ts` 에 `process.env.CLAUDECODE='1'`(감지하면 `'claude-code'` 가 나올
상황)을 강제해 두고도 `GuardDeps.agent: 'unknown'` override 를 주면 실제 기록은 `'unknown'`
이 되는 것까지 확인 — override 가 없을 때와 결과가 달라야 의미 있는 테스트라, 약한 형태(그냥
override 값이 반영되는지만 보는 테스트)보다 훨씬 엄격하게 검증했다.

### 하위호환 검증 — 구버전 데이터 안전 처리

- `tests/receipt-log.test.ts`: `agent` 프로퍼티 자체가 없는(delete 로 제거) 구버전 `Receipt`
  객체를 `buildReceiptLogEntry` 에 넣어도 죽지 않고 `'unknown'` 폴백.
- `tests/ai-actions-ledger.test.ts`: `agent` 필드 있는 줄(신버전)과 없는 줄(구버전)이 같은
  JSONL 파일에 섞여도 `readAiActions` 가 둘 다 정상 파싱(있으면 값, 없으면 `undefined`).
- `tests/evidence-ledger.test.ts`: 기존 `toEqual` 전체구조 스냅샷 테스트가 필드 추가로 자연히
  깨져서(스키마가 실제로 커졌으므로 정당한 파손) `agent: 'unknown'` 을 기대값에 추가해 갱신.

### 이 워크트리에서 발견한 실측 노트 (참고용 — 코드 변경 아님)

이 워크트리(`git worktree add`) 자체는 `node_modules` 가 거의 비어 있었다(vite 캐시만) — `pnpm
build`/`pnpm exec vitest`/`pnpm exec tsc` 는 그런 상태에서도 동작했지만 `pnpm lint`(eslint 셸
바이너리 PATH 조회)만 실패했다. `pnpm install`(4.2 초, 전부 글로벌 스토어 재사용·lockfile 변경
0)로 해결 — 코드와 무관한 워크트리 초기 상태 이슈였음을 게이트 재실행으로 확인.

### 게이트

`pnpm exec tsc --noEmit` clean · `pnpm build` green · `pnpm lint` clean(0 findings) ·
`pnpm test:run` 2234/2234 green(신규 detect-agent.test.ts 7개 + 기존 5개 파일에 agent 관련
케이스 추가, 총 +약 20개 신규 케이스).

## Forbidden Actions (OUT)

- `ReceiptEvidence`/`decideReceipt` 에 `agent` 필드·인자 추가 금지 — 원칙1("decision=기계증거
  전용, LLM 0") 위반. 이 goal 전체에서 가장 중요한 불변식.
- `buildLedgerEntry`(evidence-ledger.ts) 기본값으로 `detectAgent()` 호출 금지 — 이 함수는
  순수함수(부수효과 0)여야 한다. 정적 리터럴 `'unknown'` 만 허용.
- `CODEX_COMPANION_SESSION_ID`(또는 다른 미실측 에이전트 신호)를 allowlist 에 추측으로 추가
  금지 — 실측 없는 신호 추가는 거짓 attribution 을 만든다.
- 기존 스키마 필드를 필수(non-optional)로 바꾸는 breaking change 금지 — 4개 전부 append-only
  JSONL/JSON 로그라 과거(필드 없는) 엔트리를 읽는 코드가 깨지면 안 됨.

## Mandatory Reading

`src/lib/detect-agent.ts` · `src/lib/receipt.ts`(`ReceiptEvidence` vs `Receipt` 구분) ·
`src/lib/safety-guard.ts`(`runGuarded` chokepoint) · `tests/receipt.test.ts`
(`decideReceipt` 순수성 회귀 테스트) · RFC 0057(기억/복리/에이전트불가지론 — 아직
`docs/rfc/`에 문서화 전, 브레인스토밍 단계. 배경은 CLAUDE.md LIVE 구역 2026-07-03 기록 참고)
