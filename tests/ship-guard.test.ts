import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Goal 12: ship 은 ② refuse-essential — 비-TTY(파이프/CI/MCP)면 대화형 입력 불가 →
// inquirer 크래시 대신 friendly 거부 + exit 1 (절대 안 멈춤).
const mockPrompt = vi.fn()
vi.mock('inquirer', () => ({
  default: { prompt: (...a: unknown[]) => mockPrompt(...a) },
}))

let origTTY: boolean | undefined

describe('ship 가드 — 비-TTY refuse-essential', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    origTTY = process.stdin.isTTY
    process.exitCode = 0
  })
  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: origTTY, configurable: true })
    process.exitCode = 0
  })

  it('비-TTY → inquirer 미호출 + exitCode 1 (크래시/멈춤 없음)', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true })
    const { ship } = await import('../src/commands/ship.js')
    await expect(ship()).resolves.not.toThrow()
    expect(mockPrompt).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })
})
