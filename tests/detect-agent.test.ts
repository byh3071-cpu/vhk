import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { detectAgent } from '../src/lib/detect-agent.js'

// RFC 0057 트랙②: "누가 이 작업을 했는지" 감지 — 결정론(LLM 0)·닫힌집합(AgentId) allowlist.
// 실측 확정 사실(재조사 불필요 — 배경 참고):
//  - CLAUDECODE·CLAUDE_CODE_ENTRYPOINT 는 Claude Code 일반 세션에 실재(env | grep CLAUDE 직접 확인).
//  - CLAUDE_PROJECT_DIR 은 훅 서브프로세스 전용(보조 신호)이나 있으면 claude-code 로 판정해도 안전.
//  - CODEX_COMPANION_SESSION_ID 는 함정 — Claude Code 의 codex 플러그인이 세팅하는 값이라
//    Codex 고유 신호가 아님(CLAUDE_CODE_SESSION_ID 와 값 동일 실측). allowlist 에 넣으면 안 됨.

describe('detectAgent — env 인자 명시', () => {
  it('CLAUDECODE 매치 → claude-code', () => {
    expect(detectAgent({ CLAUDECODE: '1' })).toBe('claude-code')
  })

  it('CLAUDE_CODE_ENTRYPOINT 만 있어도 → claude-code', () => {
    expect(detectAgent({ CLAUDE_CODE_ENTRYPOINT: 'cli' })).toBe('claude-code')
  })

  it('CLAUDE_PROJECT_DIR 만 있어도 → claude-code', () => {
    expect(detectAgent({ CLAUDE_PROJECT_DIR: 'C:\\some\\path' })).toBe('claude-code')
  })

  it('빈 env → unknown', () => {
    expect(detectAgent({})).toBe('unknown')
  })

  it('CODEX_COMPANION_SESSION_ID 만 있으면 → unknown (회귀 가드 — 허위 Codex 신호에 안 잡힘)', () => {
    expect(detectAgent({ CODEX_COMPANION_SESSION_ID: 'abc123' })).toBe('unknown')
  })
})

describe('detectAgent — env 인자 생략 시 실제 process.env 사용', () => {
  const KEYS = ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_PROJECT_DIR', 'CODEX_COMPANION_SESSION_ID'] as const
  const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {}

  beforeEach(() => {
    for (const k of KEYS) saved[k] = process.env[k]
  })

  afterEach(() => {
    for (const k of KEYS) {
      const v = saved[k]
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('process.env.CLAUDECODE 설정 시 인자 생략해도 claude-code', () => {
    for (const k of KEYS) delete process.env[k]
    process.env.CLAUDECODE = '1'
    expect(detectAgent()).toBe('claude-code')
  })

  it('관련 env 전부 미설정이면 인자 생략 시 unknown', () => {
    for (const k of KEYS) delete process.env[k]
    expect(detectAgent()).toBe('unknown')
  })
})
