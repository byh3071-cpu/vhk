import { describe, it, expect, vi } from 'vitest'
import { QUICK_ACTIONS, quickActions } from '../src/commands/help.js'
import { requiresConfirmation } from '../src/lib/nlp-run.js'
import type { NlpRoute } from '../src/lib/nlp-router.js'

const route = (command: NlpRoute['command'], confidence: NlpRoute['confidence']): NlpRoute => ({
  command,
  explanation: '',
  confidence,
})

describe('quick actions (자연어 도움말 — 읽기전용)', () => {
  it('10개 quick action + 핵심 문구 포함', () => {
    expect(QUICK_ACTIONS.length).toBe(10)
    const says = QUICK_ACTIONS.map((a) => a.say)
    expect(says).toContain('상태 알려줘')
    expect(says).toContain('뭐 바뀌었어?')
    expect(says).toContain('저장해줘')
  })

  it('quickActions() 는 콘솔 출력만 — 상태변경(파일/git) 없음', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    quickActions()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('requiresConfirmation — 상태변경 명령은 confidence 무관 confirm', () => {
  it('start/init 는 high 라도 confirm 필요 (스캐폴딩 방지)', () => {
    expect(requiresConfirmation(route('start', 'high'))).toBe(true)
    expect(requiresConfirmation(route('init', 'high'))).toBe(true)
  })

  it('help/status 등 읽기전용 high 는 confirm 불필요', () => {
    expect(requiresConfirmation(route('help', 'high'))).toBe(false)
    expect(requiresConfirmation(route('status', 'high'))).toBe(false)
  })

  it('low confidence 는 명령 무관 confirm', () => {
    expect(requiresConfirmation(route('status', 'low'))).toBe(true)
  })
})
