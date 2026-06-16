# 2026-06-16 — Goal 70: MCP high-risk 도구 옵트인 정책

## 배경

Fable5 배치3의 마지막. MCP `save`(git add → commit → **push**)가 `hardStopBlocked` 가드만 있고, HARD_STOP 비활성 시 **MCP 호출 즉시 원격 push** — 에이전트가 사람 승인 없이 바깥행동 자동 실행(헌법·PAT-003 위반 위험). `undo` 는 이미 `confirm:true` 옵트인으로 안전. 격리: `git worktree`(vhk-fullcycle)에서 작업, 다른 세션과 충돌 0. GA MCP API라 시그니처 불변 최우선.

## 한 일

- **`HIGH_RISK_MCP_TOOLS` 레지스트리** (`src/mcp/server.ts` export) — 옵트인 정책 단일 SoT(risk_level). `{ 'save', 'undo' }`. runVhkCli 위임 도구는 CLI guardCli 가 가드하므로 제외.
- **`save` confirm 옵트인** — inputSchema 에 `confirm?: boolean` 추가(**additive — 기존 `message` 시그니처 불변**). `confirm` 없으면 저장 예정 파일·커밋 메시지 미리보기만 반환(commit/push 안 함), `confirm:true` 일 때만 실제 실행. undo 패턴 일반화. `env` 는 로컬 파일 쓰기(되돌리기 쉬움)라 고위험 제외(HARD_STOP 가드로 충분).
- **ADR-005** — 정책 결정 기록(맥락·결정·대안 기각·결과).
- **RULES.md 템플릿** (`rules-md.ts`) — 신규 프로젝트에 "안전 규칙 — MCP 고위험 도구 confirm 전 실행 금지" 섹션 전파.
- 게이트: `scripts/check-goal-70.mjs` 고유검증(8건) + `tests/mcp-optin.test.ts`(실 temp git repo — confirm 없으면 커밋 0, confirm:true 면 커밋 +1).

## 검증

- 전체 테스트 **1724 pass** (origin/main + optin 3). save 동작 변경이 mcp-hardstop·mcp-server 등 회귀 0.
- `check-goal-70.mjs`: typecheck ✓ · lint ✓ · 고유검증 8/8 ✓.
- 안전 불변식 직접 검증: 실 git repo 에서 `callTool('save', {message})` → 미리보기·커밋 0, `callTool('save', {confirm:true})` → 커밋 +1.

## 교훈

- MCP 네이티브 핸들러(guardCli 우회)와 runVhkCli 위임은 안전 책임 주체가 다르다 — 네이티브만 자체 옵트인 필요. 레지스트리(`HIGH_RISK_MCP_TOOLS`)로 "어떤 도구가 고위험인가"를 코드 SoT 로 못박아 누락·드리프트 차단.
- GA API 안전: 행동을 바꾸되(즉시실행→미리보기) **시그니처는 additive optional 로만** 확장 → 기존 호출(`save {message}`)은 깨지지 않고 더 안전해짐.
- 고위험 작업 검증은 mock 보다 **실 temp git repo + 커밋 카운트**가 정직(실제 commit 발생 여부를 직접 관측).
