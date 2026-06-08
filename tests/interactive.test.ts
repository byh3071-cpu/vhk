import { describe, it, expect, vi, afterEach } from 'vitest'
import { ensureInteractive, isPromptAbortError, isInteractive, promptOrDefault } from '../src/lib/interactive.js'

function setTTY(value: boolean | undefined): boolean | undefined {
  const orig = process.stdin.isTTY
  Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true })
  return orig
}

describe('interactive — 대화형 가드 (VHK-014)', () => {
  afterEach(() => {
    process.exitCode = 0
  })

  it('#153: 비-TTY 면 false + exitCode 2(TTY_REQUIRED 전용 코드) + 마커 출력', () => {
    const orig = setTTY(false)
    const errs: string[] = []
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errs.push(a.join(' ')) })
    expect(ensureInteractive('hint')).toBe(false)
    expect(process.exitCode).toBe(2) // generic 실패(1)와 구분되는 전용 코드
    expect(errs.join('\n')).toContain('TTY_REQUIRED') // 기계 감지용 마커
    vi.restoreAllMocks()
    setTTY(orig)
  })

  it('TTY 면 true 반환', () => {
    const orig = setTTY(true)
    expect(ensureInteractive()).toBe(true)
    expect(process.exitCode).toBe(0)
    setTTY(orig)
  })

  it('isPromptAbortError — EOF/강제종료 류만 true', () => {
    expect(isPromptAbortError(new Error('Error [ERR_USE_AFTER_CLOSE]: readline was closed'))).toBe(true)
    expect(isPromptAbortError(new Error('User force closed the prompt'))).toBe(true)
    expect(isPromptAbortError(new Error('ExitPromptError'))).toBe(true)
    expect(isPromptAbortError(new Error('일반 에러'))).toBe(false)
  })
})

describe('isInteractive (감지 SoT)', () => {
  // 비고: 이 Node 환경에서 process.stdin.isTTY 는 read-only(Socket) 라
  // 직접 대입이 불가 → 기존 setTTY(Object.defineProperty) 헬퍼로 동일 의도 유지.
  const origEnv = process.env.VHK_FORCE_INTERACTIVE
  let origTTY: boolean | undefined
  afterEach(() => { setTTY(origTTY); process.env.VHK_FORCE_INTERACTIVE = origEnv })
  it('stdin TTY 면 true', () => { origTTY = setTTY(true); expect(isInteractive()).toBe(true) })
  it('비-TTY 면 false', () => { origTTY = setTTY(undefined); expect(isInteractive()).toBe(false) })
  it('--yes 면 TTY 라도 false', () => { origTTY = setTTY(true); expect(isInteractive({ yes: true })).toBe(false) })
  it('VHK_FORCE_INTERACTIVE=1 면 비-TTY 라도 true', () => { origTTY = setTTY(undefined); process.env.VHK_FORCE_INTERACTIVE = '1'; expect(isInteractive()).toBe(true) })
})

describe('promptOrDefault', () => {
  let origTTY: boolean | undefined
  afterEach(() => { setTTY(origTTY) })
  it('대화형 → ask 결과', async () => { origTTY = setTTY(true); expect(await promptOrDefault(async () => 'asked', 'fb')).toBe('asked') })
  it('비대화형 → ask 미호출 + fallback (MCP 불변식)', async () => {
    origTTY = setTTY(undefined)
    const ask = vi.fn(async () => 'asked')
    expect(await promptOrDefault(ask, 'fb')).toBe('fb'); expect(ask).not.toHaveBeenCalled()
  })
  it('대화형서 abort(Ctrl+C/ESC=사용자 취소)면 fallback 안 쓰고 전파 (취소 보존)', async () => { origTTY = setTTY(true); await expect(promptOrDefault(async () => { throw new Error('User force closed the prompt') }, 'fb')).rejects.toThrow(/force closed/) })
  it('ask 가 비-abort 에러면 rethrow', async () => { origTTY = setTTY(true); await expect(promptOrDefault(async () => { throw new Error('boom') }, 'fb')).rejects.toThrow('boom') })
})
