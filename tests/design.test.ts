import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// VHK-014 가드(ensureInteractive)는 비-TTY 면 design() 을 막는다 → 대화형 테스트는 TTY 모사 필요.
let origTTY: boolean | undefined

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
    origTTY = process.stdin.isTTY
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
  })
  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: origTTY, configurable: true })
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

  it('기존 tokens.css 있고 덮어쓰기 거부하면 파일 안 씀', async () => {
    // tailwind 없음 → tokens.css 타겟. 그 파일이 존재
    mockExistsSync.mockImplementation((p: unknown) => String(p).includes('tokens.css'))
    // 첫 prompt = 팔레트 선택, 두 번째 prompt = 덮어쓰기 확인 (false)
    mockPrompt
      .mockResolvedValueOnce({ paletteIndex: 0 })
      .mockResolvedValueOnce({ overwrite: false })

    const { design } = await import('../src/commands/design.js')
    await design()

    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })

  it('기존 tokens.css 있고 덮어쓰기 승인하면 새로 씀', async () => {
    mockExistsSync.mockImplementation((p: unknown) => String(p).includes('tokens.css'))
    mockPrompt
      .mockResolvedValueOnce({ paletteIndex: 0 })
      .mockResolvedValueOnce({ overwrite: true })

    const { design } = await import('../src/commands/design.js')
    await design()

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1)
    expect(String(mockWriteFileSync.mock.calls[0][0])).toContain('tokens.css')
  })
})
