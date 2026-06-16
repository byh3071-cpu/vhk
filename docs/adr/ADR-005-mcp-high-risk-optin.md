# ADR-005 — MCP 고위험 도구 옵트인 정책

- 상태: Accepted
- 날짜: 2026-06-16
- 관련: goal 70, PAT-003(되돌릴 수 없는 작업 4중 안전장치), Goal 41(MCP HARD_STOP 가드)

## 맥락

vhk MCP 서버(`src/mcp/server.ts`)는 도구를 두 종류로 노출한다:
1. **runVhkCli 위임 도구** — `vhk <cmd>` 서브프로세스를 돌린다. CLI 의 `guardCli` chokepoint(safety-mode)가 안전을 처리하므로 별도 MCP 가드 불필요.
2. **MCP 네이티브 핸들러** — 상태변경을 MCP 안에서 재구현한다(`save`·`undo`·`env`). 이들은 `guardCli` 를 우회하므로 자체 가드가 필요.

문제: `save`(git add → commit → **push**)는 `hardStopBlocked` 가드만 있고, HARD_STOP 이 비활성이면 **MCP 호출 즉시 원격에 push** 했다. 에이전트가 사람 승인 없이 바깥(원격 저장소)으로 나가는 행동을 자동 실행 — 헌법(`되돌릴 수 없는/바깥 행동은 게이트+사람 승인`)·PAT-003 위반 위험. `undo` 는 이미 `confirm:true` 옵트인(기본 미리보기)으로 안전했다.

## 결정

MCP 상태변경 네이티브 핸들러 중 **바깥행동·되돌리기 어려운 도구를 `HIGH_RISK_MCP_TOOLS` 레지스트리(단일 SoT)로 명문화**하고, 해당 도구는 **`confirm:true` 명시 전 실제 실행을 거부하고 미리보기만 반환**한다(undo 패턴 일반화).

- `HIGH_RISK_MCP_TOOLS = { 'save', 'undo' }` (`server.ts` export).
- `save`: `confirm` optional 파라미터 추가(additive — 기존 `message` 시그니처 불변). `confirm` 없으면 저장 예정 파일·커밋 메시지 미리보기만 반환, commit/push 안 함. `confirm:true` 일 때만 실제 실행.
- `env` 는 로컬 파일(.env.example) 쓰기로 되돌리기 쉬움 → 고위험 제외(HARD_STOP 가드로 충분).
- init `RULES.md` 템플릿에 "안전 규칙 — MCP 고위험 도구는 confirm:true 전 실행 금지" 섹션 추가 → 신규 프로젝트 에이전트에게 정책 전파.

## 대안 (기각)

- **registerTool 에 `risk_level` 커스텀 필드**: MCP SDK 의 tool 등록 스키마가 임의 필드를 보장하지 않음 → 별도 export 레지스트리 + 핸들러 내 가드로 구현(코드 SoT, 테스트 가능).
- **save 를 MCP 에서 완전 제거**: 저장 자체는 유용 → 제거 대신 옵트인으로 안전화.

## 결과

- GA 안정성: 기존 low-risk 도구·`save` 의 `message` 시그니처 불변. `confirm` 은 additive optional.
- 행동 변화(의도된 것): MCP `save` 기본값이 "즉시 실행"→"미리보기". 에이전트는 명시적 `confirm:true` 로만 push. (안전 강화 — 헌법 정합.)
- 회귀 가드: `tests/mcp-optin.test.ts` — confirm 없으면 커밋 0, confirm:true 면 커밋 +1(실 temp git repo).
