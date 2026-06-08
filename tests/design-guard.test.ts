import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Goal 12: design / design-palette 는 ② refuse-essential — 팔레트 선택은 자동답 불가.
// 비-TTY 면 ensureInteractive 로 friendly 거부(파일 미생성, inquirer 미호출, exit 1).
const mockExistsSync = vi.fn()
const mockMkdirSync = vi.fn()
const mockWriteFileSync = vi.fn()
const mockPrompt = vi.fn()

vi.mock('node:fs', () => ({
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  mkdirSync: (...a: unknown[]) => mockMkdirSync(...a),
  writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
}))
vi.mock('inquirer', () => ({
  default: { prompt: (...a: unknown[]) => mockPrompt(...a) },
}))

let origTTY: boolean | undefined

describe('design / design-palette 가드 — 비-TTY refuse-essential', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    origTTY = process.stdin.isTTY
    Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true })
    process.exitCode = 0
  })
  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: origTTY, configurable: true })
    process.exitCode = 0
  })

  it('design 비-TTY → inquirer 미호출 + 파일 미생성 + exit 1', async () => {
    const { design } = await import('../src/commands/design.js')
    await expect(design()).resolves.not.toThrow()
    expect(mockPrompt).not.toHaveBeenCalled()
    expect(mockWriteFileSync).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(2) // #153: TTY_REQUIRED 전용 코드
  })

  it('design-palette 비-TTY → 동일하게 거부 (design 위임)', async () => {
    const { designPalette } = await import('../src/commands/design.js')
    await expect(designPalette()).resolves.not.toThrow()
    expect(mockPrompt).not.toHaveBeenCalled()
    expect(mockWriteFileSync).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(2) // #153: TTY_REQUIRED 전용 코드
  })
})
