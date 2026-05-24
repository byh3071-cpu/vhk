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

describe('theme', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('모듈을 import 할 수 있다', async () => {
    const mod = await import('../src/commands/theme.js')
    expect(mod.theme).toBeDefined()
  })

  it('theme.css와 theme-toggle.ts 두 파일을 생성한다', async () => {
    mockExistsSync.mockReturnValue(false)
    const { theme } = await import('../src/commands/theme.js')
    await theme()

    expect(mockMkdirSync).toHaveBeenCalledWith('src/styles', { recursive: true })
    expect(mockMkdirSync).toHaveBeenCalledWith('src/lib', { recursive: true })

    const writes = mockWriteFileSync.mock.calls.map((c) => String(c[0]))
    expect(writes.some((p) => p.includes('theme.css'))).toBe(true)
    expect(writes.some((p) => p.includes('theme-toggle.ts'))).toBe(true)
  })

  it('theme.css는 dark/light data-theme 셀렉터를 포함한다', async () => {
    mockExistsSync.mockReturnValue(false)
    const { theme } = await import('../src/commands/theme.js')
    await theme()

    const cssCall = mockWriteFileSync.mock.calls.find((c) => String(c[0]).includes('theme.css'))
    expect(cssCall).toBeDefined()
    const css = String(cssCall![1])
    expect(css).toContain('prefers-color-scheme: dark')
    expect(css).toContain('[data-theme="dark"]')
    expect(css).toContain('[data-theme="light"]')
  })

  it('theme-toggle.ts는 getTheme/setTheme/toggleTheme/initTheme를 export한다', async () => {
    mockExistsSync.mockReturnValue(false)
    const { theme } = await import('../src/commands/theme.js')
    await theme()

    const tsCall = mockWriteFileSync.mock.calls.find((c) => String(c[0]).includes('theme-toggle.ts'))
    expect(tsCall).toBeDefined()
    const ts = String(tsCall![1])
    expect(ts).toContain('export function getTheme')
    expect(ts).toContain('export function setTheme')
    expect(ts).toContain('export function toggleTheme')
    expect(ts).toContain('export function initTheme')
  })

  it('기존 theme.css 있고 덮어쓰기 거부하면 파일 안 씀', async () => {
    mockExistsSync.mockImplementation((p: unknown) => String(p).includes('theme.css'))
    mockPrompt.mockResolvedValue({ overwrite: false })

    const { theme } = await import('../src/commands/theme.js')
    await theme()

    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })

  it('기존 theme.css 있고 덮어쓰기 승인하면 새로 씀', async () => {
    mockExistsSync.mockImplementation((p: unknown) => String(p).includes('theme.css'))
    mockPrompt.mockResolvedValue({ overwrite: true })

    const { theme } = await import('../src/commands/theme.js')
    await theme()

    expect(mockWriteFileSync).toHaveBeenCalledTimes(2)
  })
})
