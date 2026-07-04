# 2026-07-04 — RFC 0057 트랙② — receipt/ledger agent(에이전트 attribution) 필드 추가 (goal 94)

> append-only. 추가만, 수정·삭제 금지.

## 배경

VHK 는 "어떤 AI 에이전트(Claude Code/Codex/Cursor 등)가 써도 안 무너진다"는 불가지론
정체성을 갖는다. 이걸 자기 데이터로 증명하려면 "누가 이 작업을 했는지"를 기록 계층에
남겨야 하는데, RFC 0057 실측 감사(2026-07-03) 시점에 receipt·receipt-log·evidence-ledger·
ai-actions-ledger 4개 스키마 전부 이 필드가 0건이었다. 이번 세션(격리 워크트리)이 그 트랙②를
전담 구현.

## 한 일

`src/lib/detect-agent.ts`(신규) 토대 → `Receipt` → `ReceiptLogEntry` → `LedgerEntry` →
`AiActionEntry` 순으로 5단계 TDD(RED 확인 → GREEN 구현) 반복. 각 단계마다 테스트를 먼저 쓰고
실제 실행해 실패(assertion 실패 또는 타입에러)를 확인한 뒤 구현, 다시 실행해 통과 확인.

## 설계 근거

### 1. `detectAgent()` — 실측 신호만, 추측 금지

`AGENT_SIGNALS` allowlist 배열(`CLAUDECODE`·`CLAUDE_CODE_ENTRYPOINT`·`CLAUDE_PROJECT_DIR` →
전부 `'claude-code'`)을 순회해 첫 매치를 반환, 없으면 `'unknown'`. 이번 세션 배경 조사에서
**`CODEX_COMPANION_SESSION_ID` 를 의도적으로 제외**했다 — 이 값은 Codex 고유 신호가 아니라
"Claude Code 의 codex 플러그인이 Codex 를 헬퍼로 부를 때 Claude Code 가 세팅하는 값"이며,
`CLAUDE_CODE_SESSION_ID` 와 값이 완전히 동일함이 실측으로 확인됐다. 이걸 'codex' 신호로 쓰면
순수 Claude Code 세션을 Codex 로 오분류하는 거짓 신호가 된다 — `tests/detect-agent.test.ts`
에 이 함정을 회귀 가드로 고정(`CODEX_COMPANION_SESSION_ID` 만 있으면 반드시 `unknown`).
Codex 단독·Cursor·OpenCode 등 다른 에이전트 고유 신호는 실측된 바 없어 추가하지 않았다 —
allowlist 는 `'claude-code' | 'unknown'` 2개 값으로 시작, 향후 실측되면 배열에 항목만 추가하는
구조.

### 2. 원칙1("decision=기계증거 전용, LLM 0") 강제 — 타입 레벨 + 행동 증명

`ReceiptEvidence`(`decideReceipt(e: ReceiptEvidence)` 가 받는 유일한 타입)에는 `agent` 를
**절대 추가하지 않았다** — decideReceipt 는 이 필드에 타입 레벨로 접근이 불가능하다. `agent` 는
`ReceiptMeta`/`Receipt` 에만 존재하고, `buildReceipt` 가 조립 단계에서 채운다(판정 이후 단계).
`tests/receipt.test.ts` 에 "agent 값만 다르고 나머지 evidence 가 완전히 동일한 두 Receipt 의
decision·reasons 가 완전히 같음"을 확인하는 회귀 테스트로 원칙을 행동으로도 고정
(`missionChecksum` 이 decision 에 무영향임을 검증하던 기존 테스트와 동형 패턴).

### 3. 순수함수 성질 보존 — `buildLedgerEntry`

`evidence-ledger.ts` 의 `buildLedgerEntry(report, version, agent: AgentId = 'unknown')` 는
기본값을 `detectAgent()` 호출이 아니라 **정적 리터럴** `'unknown'` 으로 뒀다 — 이 함수는
부수효과 0 인 순수함수라 그 성질을 깨면 안 된다는 지시를 그대로 따름. 실제 env 감지는 호출부
(`commands/verify.ts` 의 `verifyEvidence()`)가 담당. `check-goal-94.mjs` 에 "evidence-ledger.ts
가 detectAgent 를 값으로 import 안 함" 회귀 가드를 넣어 이 성질을 게이트로도 고정했다(단,
"detectAgent() 호출 대신 정적 기본값" 을 설명하는 why-주석까지 막으면 안 되므로, VALUE import
패턴만 정밀 매칭하도록 조정 — 처음엔 substring 전체를 막아 자기 주석에 걸려 실패했다가 수정).

### 4. `GuardDeps.agent` override — 기존 호출부 무변경 + 우선순위 검증

`safety-guard.ts` 의 `runGuarded()` 단일 chokepoint 에서 `agent: deps.agent ?? detectAgent()`.
`GuardDeps.agent` 는 옵셔널이라 기존 모든 호출부는 코드 수정 없이 자동으로 env 감지가 적용된다.
`tests/action-ledger.test.ts` 에 "env 를 강제로 `'claude-code'` 가 나올 상황으로 만들어두고도
override(`'unknown'`)가 이긴다"는 강한 형태로 우선순위를 검증 — override 가 없을 때와 결과가
달라야 의미 있는 테스트라는 점을 의식해서 설계.

### 5. 하위호환 — 4개 스키마 전부 append-only 로그/JSON

`ReceiptMeta`/`Receipt`/`ReceiptLogEntry`/`LedgerEntry`/`AiActionEntry`(writer `action-ledger.ts`
+ reader `ai-actions-ledger.ts` 독립 선언 양쪽) 전부 `agent?: AgentId` 옵셔널로 추가. 검증:

- `tests/receipt-log.test.ts`: `agent` 프로퍼티 자체가 없는(delete 로 제거한) 구버전 `Receipt`
  객체를 `buildReceiptLogEntry` 에 넣어도 `'unknown'` 폴백, 안 죽음.
- `tests/ai-actions-ledger.test.ts`: `agent` 있는 줄(신버전)과 없는 줄(구버전)이 같은 JSONL 에
  섞여도 둘 다 정상 파싱.
- `tests/evidence-ledger.test.ts`: 기존 `toEqual` 전체구조 스냅샷 테스트가 필드 추가로 자연히
  깨져(정당한 파손 — 스키마가 실제로 커짐) `agent: 'unknown'` 을 기대값에 추가해 갱신.

## 변경 파일

신규: `src/lib/detect-agent.ts`, `tests/detect-agent.test.ts`, `goals/94-agent-attribution-ledger.md`,
`scripts/check-goal-94.mjs`.

수정: `src/lib/receipt.ts`(`ReceiptMeta`/`Receipt`/`buildReceipt`) · `src/commands/receipt.ts`
(`collectReceipt` 배선) · `src/lib/receipt-log.ts`(`ReceiptLogEntry`/`buildReceiptLogEntry`) ·
`src/lib/evidence-ledger.ts`(`LedgerEntry`/`buildLedgerEntry`) · `src/commands/verify.ts`
(`verifyEvidence` 배선) · `src/lib/action-ledger.ts`·`src/lib/ai-actions-ledger.ts`(양쪽
`AiActionEntry`) · `src/lib/safety-guard.ts`(`GuardDeps`/`runGuarded`) · 관련 테스트 6개 파일.

## 이 워크트리에서 겪은 환경 이슈 (코드와 무관 — 참고용)

`git worktree add` 로 만들어진 이 워크트리는 초기 `node_modules` 가 거의 비어 있었다(vite 캐시
뿐). `pnpm build`/`pnpm exec vitest`/`pnpm exec tsc` 는 그런 상태에서도 어떻게든 동작했지만
`pnpm lint`(eslint 셸 바이너리 PATH 조회)만 "명령을 찾을 수 없음" 으로 실패했다. `pnpm
install`(4.2초, 전부 글로벌 스토어 재사용·lockfile 변경 0)로 즉시 해결 — 코드 결함이 아니라
워크트리 초기 상태 이슈였음을 게이트 재실행으로 확인.

## 게이트

`pnpm exec tsc --noEmit` clean · `pnpm build` green · `pnpm lint` clean(0 findings) ·
`pnpm test:run` — **2233/2234 pass, 알려진 예외 1건**: `tests/gen-goals-index.test.ts` 의
"커밋된 goals/README.md == 재생성 결과(드리프트 0)" 테스트가 이번에 신규 등록한
`goals/94-agent-attribution-ledger.md` 때문에 실패한다. 이 작업 지시서에 "**goals/README.md는
건드리지 마라 — 메인 세션이 나중에 한 번에 재생성한다**"는 명시적 예외가 있어 의도적으로 손대지
않았다(여러 병렬 트랙이 각자 goal 파일을 추가 중이라 메인 세션이 한 번에 합쳐 재생성하는 편이
merge 충돌을 줄인다고 판단한 것으로 보임). `check-goal-94.mjs` 는 `VHK_GATES_SKIP_DEEP=1` 빠른
패스와 전체(딥) 패스 둘 다 고유 검증 29개 전부 통과 확인(딥 패스의 `test` 스텝만 위 알려진
예외로 인해 ✗ 표시 — 고유 검증 자체는 별개로 전부 green).

## 교훈

- **순수함수 시그니처에 옵션 인자를 추가할 때 기본값 선택이 곧 아키텍처 결정이다.**
  `buildLedgerEntry` 의 3번째 인자 기본값을 `detectAgent()` 로 뒀다면 함수 시그니처는 똑같아
  보여도 "순수함수" 라는 계약이 조용히 깨진다(호출 시점마다 다른 env 를 몰래 읽음). 정적 리터럴
  기본값 + 호출부에서 명시적으로 실감지 값을 넘기는 패턴이 "간단해 보이는 지름길"보다 항상 맞다.
- **게이트 스크립트 자신의 assert 도 부작용을 검토해야 한다.** `check-goal-94.mjs` 초안에서
  "evidence-ledger.ts 가 detectAgent 문자열을 아예 안 담고 있어야 한다"는 너무 넓은 substring
  검사를 썼다가, 정작 "왜 detectAgent() 를 안 쓰는지"를 설명하는 내 자신의 why-주석에 걸려
  false-negative 가 났다 — 의도(런타임 VALUE import 금지)와 검사 방식(전체 substring 금지)이
  어긋나면 검증 스크립트가 오히려 좋은 문서화(설명 주석)를 처벌하게 된다. VALUE import 패턴만
  정밀 매칭하도록 정규식을 좁혀 수정.
