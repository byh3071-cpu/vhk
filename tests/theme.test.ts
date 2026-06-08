import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockExistsSync = vi.fn()
const mockMkdirSync = vi.fn()
const mockWriteFileSync = vi.fn()
const mockPrompt = vi.fn()
const mockDetectStack = vi.fn()

vi.mock('node:fs', () => ({
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  mkdirSync: (...a: unknown[]) => mockMkdirSync(...a),
  writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
}))

vi.mock('inquirer', () => ({
  default: { prompt: (...a: unknown[]) => mockPrompt(...a) },
}))

// #158: theme 가 스택 감지로 경로를 정한다 → detectProjectStack 모킹으로 src/ vs 루트 분기 검증.
vi.mock('../src/lib/stack-detect.js', () => ({
  detectProjectStack: (...a: unknown[]) => mockDetectStack(...a),
}))

// Goal 12: theme 의 덮어쓰기 확인이 promptOrDefault(stdin SoT)로 마이그됨 →
// 대화형 확인 테스트는 TTY 모사 필요(design.test.ts 선례). 비-TTY 동작은 아래 별도 describe.
let origTTY: boolean | undefined

describe('theme (대화형 — TTY)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    mockDetectStack.mockReturnValue(['React', 'TypeScript']) // 기본: src/ 관례 스택
    origTTY = process.stdin.isTTY
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
  })
  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: origTTY, configurable: true })
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

// Goal 12: ① auto-default — 비-TTY(MCP/CI/파이프)에서 멈추지 않고 안전 동작.
describe('theme (비대화형 — 비-TTY)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    mockDetectStack.mockReturnValue(['React', 'TypeScript']) // 기본: src/ 관례 스택
    origTTY = process.stdin.isTTY
    Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true })
  })
  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: origTTY, configurable: true })
  })

  it('충돌 없으면 비-TTY 라도 두 파일 생성 (멈춤 없음)', async () => {
    mockExistsSync.mockReturnValue(false)
    const { theme } = await import('../src/commands/theme.js')
    await expect(theme()).resolves.not.toThrow()
    expect(mockWriteFileSync).toHaveBeenCalledTimes(2)
    // 충돌 없음 → 프롬프트 자체가 없음
    expect(mockPrompt).not.toHaveBeenCalled()
  })

  it('충돌 + --yes 없음 → inquirer 미호출(stdin 미접근) + 기본 보존(파일 안 씀)', async () => {
    mockExistsSync.mockImplementation((p: unknown) => String(p).includes('theme.css'))
    const { theme } = await import('../src/commands/theme.js')
    await theme()
    // MCP 불변식: 비-TTY 면 stdin 미접근 = inquirer 호출 0
    expect(mockPrompt).not.toHaveBeenCalled()
    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })

  it('충돌 + --yes → inquirer 없이 덮어씀 (비대화형 강제 진행)', async () => {
    mockExistsSync.mockImplementation((p: unknown) => String(p).includes('theme.css'))
    const { theme } = await import('../src/commands/theme.js')
    await theme({ yes: true })
    expect(mockPrompt).not.toHaveBeenCalled()
    expect(mockWriteFileSync).toHaveBeenCalledTimes(2)
  })
})

// #158: 바닐라/정적 PWA(스택 감지 null) → src/ 오염 금지. 루트 경로 + .js 토글.
describe('theme — 바닐라/정적 프로젝트 (스택 null) 경로 (#158)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    mockExistsSync.mockReturnValue(false)
    mockDetectStack.mockReturnValue(null) // 바닐라/정적 = 감지 스택 없음
  })

  it('src/ 가 아니라 루트(styles/·lib/)에 생성한다', async () => {
    const { theme } = await import('../src/commands/theme.js')
    await theme({ yes: true })
    // src/ 디렉터리 오염 금지
    expect(mockMkdirSync).not.toHaveBeenCalledWith('src/styles', { recursive: true })
    expect(mockMkdirSync).not.toHaveBeenCalledWith('src/lib', { recursive: true })
    // 루트 경로 사용
    expect(mockMkdirSync).toHaveBeenCalledWith('styles', { recursive: true })
    expect(mockMkdirSync).toHaveBeenCalledWith('lib', { recursive: true })
    const writes = mockWriteFileSync.mock.calls.map((c) => String(c[0]))
    expect(writes).toContain('styles/theme.css')
    expect(writes).toContain('lib/theme-toggle.js')
    expect(writes.some((p) => p.includes('src/'))).toBe(false)
  })

  it('토글은 .js (타입 주석 없음)', async () => {
    const { theme } = await import('../src/commands/theme.js')
    await theme({ yes: true })
    const toggleCall = mockWriteFileSync.mock.calls.find((c) => String(c[0]).endsWith('theme-toggle.js'))
    expect(toggleCall).toBeDefined()
    const js = String(toggleCall![1])
    // 핵심 export 는 유지하되 TS 타입 주석은 제거됨
    expect(js).toContain('export function toggleTheme')
    expect(js).not.toContain(": 'light' | 'dark'")
    expect(js).not.toContain(': void')
    expect(js).not.toMatch(/\bas 'light'/)
  })
})
