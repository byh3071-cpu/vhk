import { describe, it, expect, vi } from 'vitest'
import { QUICK_ACTIONS, quickActions } from '../src/commands/help.js'
import { setSink } from '../src/utils/logger.js'
import { requiresConfirmation } from '../src/lib/nlp-run.js'
import type { NlpRoute } from '../src/lib/nlp-router.js'

const route = (command: NlpRoute['command'], confidence: NlpRoute['confidence']): NlpRoute => ({
  command,
  explanation: '',
  confidence,
})

const subRoute = (
  command: NlpRoute['command'],
  subcommand: string,
  confidence: NlpRoute['confidence'] = 'high',
): NlpRoute => ({ ...route(command, confidence), args: [subcommand] })

describe('quick actions (자연어 도움말 — 읽기전용)', () => {
  it('10개 quick action + 핵심 문구 포함', () => {
    expect(QUICK_ACTIONS.length).toBe(10)
    const says = QUICK_ACTIONS.map((a) => a.say)
    expect(says).toContain('상태 알려줘')
    expect(says).toContain('뭐 바뀌었어?')
    expect(says).toContain('저장해줘')
    expect(QUICK_ACTIONS.find((a) => a.say === '저장해줘')?.does).toContain('vhk save --no-push')
    expect(QUICK_ACTIONS.at(-1)?.does).toBe('vhk help --all')
  })

  // #552 리뷰 대응 — 출력은 logger 단일 sink 를 거친다(raw console.log 금지).
  it('quickActions() 출력은 logger sink 로 흐른다', () => {
    const lines: string[] = []
    const restore = setSink((line) => lines.push(line))
    try {
      quickActions()
    } finally {
      restore()
    }
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.join('|')).toContain('quick actions')
    expect(lines.join('|')).toContain('vhk help --all')
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

  it('policy baseline은 high라도 confirm 필요 (신뢰 기준 자동 갱신 방지)', () => {
    expect(requiresConfirmation(subRoute('policy', 'baseline'))).toBe(true)
  })

  it('help/status 등 읽기전용 high 는 confirm 불필요', () => {
    expect(requiresConfirmation(route('help', 'high'))).toBe(false)
    expect(requiresConfirmation(route('status', 'high'))).toBe(false)
  })

  it('low confidence 는 명령 무관 confirm', () => {
    expect(requiresConfirmation(route('status', 'low'))).toBe(true)
  })
})
