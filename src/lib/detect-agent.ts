// RFC 0057 트랙②: VHK 는 "어떤 AI 에이전트(Claude Code/Codex/Cursor 등)가 써도 안 무너진다"는
// 불가지론 정체성을 자기 데이터로 증명하려면 "누가 이 작업을 했는지" 가 기록 계층(receipt·
// receipt-log·evidence-ledger·ai-actions-ledger)에 남아야 한다 — 그런데 4개 스키마 전부 이
// 필드가 0건이었다. 이 모듈이 그 감지를 전담한다: 로컬에서 관찰 가능한 환경변수만 보는 결정론
// 감지(LLM 0) — 닫힌집합(AgentId)은 allowlist 로만 채워지고, 모르면 항상 'unknown'(추측 금지).
//
// 실측 확정(2026-07 세션, env | grep CLAUDE 직접 실행으로 검증 — 재조사 불필요):
//  - CLAUDECODE=1 · CLAUDE_CODE_ENTRYPOINT=cli 는 Claude Code 일반 세션(에이전트가 Bash/PowerShell
//    로 vhk 커맨드를 직접 실행하는 경우)에 실재한다.
//  - CLAUDE_PROJECT_DIR 은 Claude Code **훅 서브프로세스**에서만 세팅됨(일반 세션엔 없음) — 보조 신호.
//  - 함정(의도적으로 allowlist 제외): CODEX_COMPANION_SESSION_ID 는 Codex 고유 신호가 아니다 —
//    "Claude Code 의 codex 플러그인이 Codex 를 헬퍼로 부를 때 Claude Code 가 세팅하는 값"이다
//    (CLAUDE_CODE_SESSION_ID 와 값이 완전히 동일함을 실측으로 확인). 이걸 'codex' 신호로 쓰면 순수
//    Claude Code 세션을 Codex 로 오분류하는 거짓 신호가 된다.
//  - Codex 단독·Cursor·OpenCode 등 다른 에이전트 고유 환경변수는 이번 세션에서 실측된 바 없어
//    추가하지 않는다(추측 금지). 향후 다른 에이전트 신호가 실측되면 AGENT_SIGNALS 에 항목을 더하는
//    것만으로 확장되는 구조 — allowlist 는 지금 'claude-code' | 'unknown' 2개 값으로 시작.

export type AgentId = 'claude-code' | 'unknown'

interface AgentSignal {
  agent: AgentId
  envVar: string
}

const AGENT_SIGNALS: readonly AgentSignal[] = [
  { agent: 'claude-code', envVar: 'CLAUDECODE' },
  { agent: 'claude-code', envVar: 'CLAUDE_CODE_ENTRYPOINT' },
  { agent: 'claude-code', envVar: 'CLAUDE_PROJECT_DIR' },
]

export function detectAgent(env: NodeJS.ProcessEnv = process.env): AgentId {
  for (const signal of AGENT_SIGNALS) {
    if (env[signal.envVar]) return signal.agent
  }
  return 'unknown'
}
