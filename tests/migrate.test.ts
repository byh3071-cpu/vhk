import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSafeExecFile = vi.fn()
const mockExistsSync = vi.fn()
const mockUnlinkSync = vi.fn()
const mockRmSync = vi.fn()
const mockPrompt = vi.fn()

vi.mock('../src/lib/exec.js', () => ({
  safeExecFile: (...a: unknown[]) => mockSafeExecFile(...a),
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
    mockSafeExecFile.mockImplementation((bin: string) => {
      if (bin === 'yarn') return { ok: false, err: 'not found', out: '' }
      return { ok: true, out: '1.0.0' }
    })
    const { migrate } = await import('../src/commands/migrate.js')
    await migrate('yarn')
    expect(mockUnlinkSync).not.toHaveBeenCalled()
    expect(mockRmSync).not.toHaveBeenCalled()
  })

  it('확인 거부 시 lockfile 삭제하지 않는다', async () => {
    mockExistsSync.mockImplementation((p: unknown) => String(p) === 'pnpm-lock.yaml')
    mockSafeExecFile.mockReturnValue({ ok: true, out: '1.0.0' })
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
    mockSafeExecFile.mockReturnValue({ ok: true, out: '1.0.0' })
    mockPrompt.mockResolvedValue({ confirm: true })
    const { migrate } = await import('../src/commands/migrate.js')
    await migrate('npm')
    expect(mockUnlinkSync).toHaveBeenCalled()
    expect(mockRmSync).toHaveBeenCalledWith('node_modules', { recursive: true, force: true })
    const installCall = mockSafeExecFile.mock.calls.find(
      (c) => c[0] === 'npm' && Array.isArray(c[1]) && (c[1] as string[]).includes('install')
    )
    expect(installCall).toBeDefined()
  })
})
