import { describe, it, expect, vi } from 'vitest'
import { QUICK_ACTIONS, quickActions } from '../src/commands/help.js'
import { requiresConfirmation, nlSafetyNotice } from '../src/lib/nlp-run.js'
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

describe('nlSafetyNotice — 자연어 high-risk 채널 가드(preview/warn)', () => {
  it('standard: high-risk NL 명령은 preview 안내', () => {
    const n = nlSafetyNotice('deploy', 'standard')
    expect(n).toBeTruthy()
    expect(n).toMatch(/미리보기|preview/i)
  })
  it('lite: 막지 않고 경고만', () => {
    expect(nlSafetyNotice('publish', 'lite')).toMatch(/경고|warn/i)
  })
  it('저위험 NL 명령은 안내 없음(null)', () => {
    expect(nlSafetyNotice('status', 'standard')).toBeNull()
    expect(nlSafetyNotice('help', 'standard')).toBeNull()
  })
  it('migrate/cloud-pull/undo 도 high-risk 로 안내', () => {
    expect(nlSafetyNotice('migrate', 'standard')).toBeTruthy()
    expect(nlSafetyNotice('cloud-pull', 'standard')).toBeTruthy()
    expect(nlSafetyNotice('undo', 'standard')).toBeTruthy()
  })
})
