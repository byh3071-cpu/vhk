import { describe, it, expect, vi, afterEach } from 'vitest'
import { ensureInteractive, isPromptAbortError } from '../src/lib/interactive.js'

function setTTY(value: boolean | undefined): boolean | undefined {
  const orig = process.stdin.isTTY
  Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true })
  return orig
}

describe('interactive — 대화형 가드 (VHK-014)', () => {
  afterEach(() => {
    process.exitCode = 0
  })

  it('비-TTY 면 false 반환 + exitCode 1 (크래시 대신 friendly 중단)', () => {
    const orig = setTTY(false)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(ensureInteractive('hint')).toBe(false)
    expect(process.exitCode).toBe(1)
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
