import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExecSync = vi.fn()
const mockReadFileSync = vi.fn()

vi.mock('node:child_process', () => ({
  execSync: (...a: unknown[]) => mockExecSync(...a),
}))

vi.mock('node:fs', () => ({
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
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
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('모듈을 import 할 수 있다', async () => {
    const mod = await import('../src/commands/update.js')
    expect(mod.update).toBeDefined()
  })

  it('현재==최신이면 npm update를 호출하지 않는다', async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: '0.9.0' }))
    mockExecSync.mockImplementation((cmd: unknown) => {
      if (String(cmd).startsWith('npm view')) return Buffer.from('0.9.0\n')
      throw new Error('should not run npm update')
    })
    const { update } = await import('../src/commands/update.js')
    await update()
    const updateCall = mockExecSync.mock.calls.find((c) =>
      String(c[0]).includes('npm update -g')
    )
    expect(updateCall).toBeUndefined()
  })

  it('현재<최신이면 npm update -g를 호출한다', async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: '0.9.0' }))
    mockExecSync.mockImplementation((cmd: unknown) => {
      const c = String(cmd)
      if (c.startsWith('npm view')) return Buffer.from('1.0.0\n')
      if (c.startsWith('npm update -g')) return Buffer.from('')
      return Buffer.from('')
    })
    const { update } = await import('../src/commands/update.js')
    await update()
    const updateCall = mockExecSync.mock.calls.find((c) =>
      String(c[0]).includes('npm update -g')
    )
    expect(updateCall).toBeDefined()
  })

  it('npm view 실패 시 안내만 출력 (update 호출 X)', async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: '0.9.0' }))
    mockExecSync.mockImplementation((cmd: unknown) => {
      if (String(cmd).startsWith('npm view')) throw new Error('network down')
      return Buffer.from('')
    })
    const { update } = await import('../src/commands/update.js')
    await update()
    const updateCall = mockExecSync.mock.calls.find((c) =>
      String(c[0]).includes('npm update -g')
    )
    expect(updateCall).toBeUndefined()
  })
})
