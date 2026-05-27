import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSafeExecFile = vi.fn()
const mockReadFileSync = vi.fn()
const mockExistsSync = vi.fn(() => true)

vi.mock('../src/lib/exec.js', () => ({
  safeExecFile: (...a: unknown[]) => mockSafeExecFile(...a),
}))

vi.mock('node:fs', () => ({
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
}))

vi.mock('ora', () => ({
  default: () => ({
    start: () => ({
      succeed: () => {},
      fail: () => {},
      stop: () => {},
    }),
  }),
}))

describe('update', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockExistsSync.mockReturnValue(true)
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('모듈을 import 할 수 있다', async () => {
    const mod = await import('../src/commands/update.js')
    expect(mod.update).toBeDefined()
  })

  it('현재==최신이면 npm update를 호출하지 않는다', async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: '0.9.0' }))
    mockSafeExecFile.mockImplementation((cmd: unknown, args: unknown) => {
      const a = args as string[]
      if (cmd === 'npm' && a[0] === 'view') return { ok: true, out: '0.9.0' }
      return { ok: false, err: 'should not run', out: '' }
    })
    const { update } = await import('../src/commands/update.js')
    await update()
    const updateCall = mockSafeExecFile.mock.calls.find((c) => {
      const args = c[1] as string[]
      return Array.isArray(args) && args[0] === 'update'
    })
    expect(updateCall).toBeUndefined()
  })

  it('현재<최신이면 npm update -g를 호출한다', async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: '0.9.0' }))
    mockSafeExecFile.mockImplementation((cmd: unknown, args: unknown) => {
      const a = args as string[]
      if (cmd === 'npm' && a[0] === 'view') return { ok: true, out: '1.0.0' }
      if (cmd === 'npm' && a[0] === 'update') return { ok: true, out: '' }
      return { ok: true, out: '' }
    })
    const { update } = await import('../src/commands/update.js')
    await update()
    const updateCall = mockSafeExecFile.mock.calls.find((c) => {
      const args = c[1] as string[]
      return Array.isArray(args) && args[0] === 'update' && args.includes('-g')
    })
    expect(updateCall).toBeDefined()
  })

  it('npm view 실패 시 안내만 출력 (update 호출 X)', async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: '0.9.0' }))
    mockSafeExecFile.mockImplementation((cmd: unknown, args: unknown) => {
      const a = args as string[]
      if (cmd === 'npm' && a[0] === 'view') return { ok: false, err: 'network down', out: '' }
      return { ok: true, out: '' }
    })
    const { update } = await import('../src/commands/update.js')
    await update()
    const updateCall = mockSafeExecFile.mock.calls.find((c) => {
      const args = c[1] as string[]
      return Array.isArray(args) && args[0] === 'update'
    })
    expect(updateCall).toBeUndefined()
  })
})
