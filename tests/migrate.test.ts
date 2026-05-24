import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExecSync = vi.fn()
const mockExistsSync = vi.fn()
const mockUnlinkSync = vi.fn()
const mockRmSync = vi.fn()
const mockPrompt = vi.fn()

vi.mock('node:child_process', () => ({
  execSync: (...a: unknown[]) => mockExecSync(...a),
}))

vi.mock('node:fs', () => ({
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  unlinkSync: (...a: unknown[]) => mockUnlinkSync(...a),
  rmSync: (...a: unknown[]) => mockRmSync(...a),
}))

vi.mock('inquirer', () => ({
  default: { prompt: (...a: unknown[]) => mockPrompt(...a) },
}))

vi.mock('ora', () => ({
  default: () => ({
    start: () => ({
      succeed: () => {},
      fail: () => {},
      stop: () => {},
      text: '',
    }),
  }),
}))

describe('migrate', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('모듈을 import 할 수 있다', async () => {
    const mod = await import('../src/commands/migrate.js')
    expect(mod.migrate).toBeDefined()
  })

  it('대상이 현재 PM과 같으면 동작하지 않는다', async () => {
    mockExistsSync.mockImplementation((p: unknown) => String(p) === 'pnpm-lock.yaml')
    const { migrate } = await import('../src/commands/migrate.js')
    await migrate('pnpm')
    expect(mockUnlinkSync).not.toHaveBeenCalled()
  })

  it('대상 PM CLI가 없으면 안내만 출력', async () => {
    mockExistsSync.mockImplementation((p: unknown) => String(p) === 'pnpm-lock.yaml')
    mockExecSync.mockImplementation((cmd: unknown) => {
      if (String(cmd).startsWith('yarn --version')) throw new Error('not found')
      return Buffer.from('1.0.0')
    })
    const { migrate } = await import('../src/commands/migrate.js')
    await migrate('yarn')
    expect(mockUnlinkSync).not.toHaveBeenCalled()
    expect(mockRmSync).not.toHaveBeenCalled()
  })

  it('확인 거부 시 lockfile 삭제하지 않는다', async () => {
    mockExistsSync.mockImplementation((p: unknown) => String(p) === 'pnpm-lock.yaml')
    mockExecSync.mockReturnValue(Buffer.from('1.0.0'))
    mockPrompt.mockResolvedValue({ confirm: false })
    const { migrate } = await import('../src/commands/migrate.js')
    await migrate('npm')
    expect(mockUnlinkSync).not.toHaveBeenCalled()
  })

  it('확인 후 lockfile + node_modules 정리 + install 호출', async () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const s = String(p)
      return s === 'pnpm-lock.yaml' || s === 'node_modules'
    })
    mockExecSync.mockReturnValue(Buffer.from('1.0.0'))
    mockPrompt.mockResolvedValue({ confirm: true })
    const { migrate } = await import('../src/commands/migrate.js')
    await migrate('npm')
    expect(mockUnlinkSync).toHaveBeenCalled()
    expect(mockRmSync).toHaveBeenCalledWith('node_modules', { recursive: true, force: true })
    const installCall = mockExecSync.mock.calls.find((c) => String(c[0]) === 'npm install')
    expect(installCall).toBeDefined()
  })
})
