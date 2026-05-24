import { describe, it, expect, vi, beforeEach } from 'vitest'

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

describe('design', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('모듈을 import 할 수 있다', async () => {
    const mod = await import('../src/commands/design.js')
    expect(mod.design).toBeDefined()
    expect(mod.designPalette).toBeDefined()
  })

  it('tailwind.config 없으면 CSS 토큰 파일을 생성한다', async () => {
    mockExistsSync.mockReturnValue(false)
    mockPrompt.mockResolvedValue({ paletteIndex: 0 })

    const { design } = await import('../src/commands/design.js')
    await design()

    expect(mockMkdirSync).toHaveBeenCalledWith('src/styles', { recursive: true })
    expect(mockWriteFileSync).toHaveBeenCalled()
    const call = mockWriteFileSync.mock.calls[0]
    expect(String(call[0])).toContain('tokens.css')
    expect(String(call[1])).toContain('--color-primary')
    expect(String(call[1])).toContain(':root')
  })

  it('tailwind.config 있으면 vhk-colors.ts를 생성한다', async () => {
    mockExistsSync.mockImplementation((p: unknown) => String(p).includes('tailwind.config'))
    mockPrompt.mockResolvedValue({ paletteIndex: 1 })

    const { design } = await import('../src/commands/design.js')
    await design()

    const call = mockWriteFileSync.mock.calls[0]
    expect(String(call[0])).toContain('vhk-colors.ts')
    expect(String(call[1])).toContain('export default')
    expect(String(call[1])).toContain('primary')
  })

  it('designPalette는 design 위임(같은 동작)', async () => {
    mockExistsSync.mockReturnValue(false)
    mockPrompt.mockResolvedValue({ paletteIndex: 2 })

    const { designPalette } = await import('../src/commands/design.js')
    await designPalette()

    expect(mockWriteFileSync).toHaveBeenCalled()
  })
})
