import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExecSync = vi.fn()
const mockReadFileSync = vi.fn()
const mockExistsSync = vi.fn()

vi.mock('node:child_process', () => ({
  execSync: (...a: unknown[]) => mockExecSync(...a),
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
      text: '',
    }),
  }),
}))

describe('harness', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('모듈을 import 할 수 있다', async () => {
    const mod = await import('../src/commands/harness.js')
    expect(mod.harness).toBeDefined()
  })

  it('package.json scripts가 없으면 안내만 출력하고 execSync 호출 없음', async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ name: 't' }))
    mockExistsSync.mockReturnValue(false)
    const { harness } = await import('../src/commands/harness.js')
    await harness()
    expect(mockExecSync).not.toHaveBeenCalled()
  })

  it('test/build scripts 감지 시 순차 실행한다', async () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ scripts: { test: 'vitest', build: 'tsup' } })
    )
    mockExistsSync.mockReturnValue(false)
    mockExecSync.mockReturnValue(Buffer.from(''))
    const { harness } = await import('../src/commands/harness.js')
    await harness()
    const cmds = mockExecSync.mock.calls.map((c) => String(c[0]))
    expect(cmds.some((c) => c.includes('test'))).toBe(true)
    expect(cmds.some((c) => c.includes('build'))).toBe(true)
  })

  it('실패해도 다음 점검을 계속 진행한다', async () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ scripts: { test: 'vitest', build: 'tsup' } })
    )
    mockExistsSync.mockReturnValue(false)
    let call = 0
    mockExecSync.mockImplementation(() => {
      call += 1
      if (call === 1) throw new Error('test failed')
      return Buffer.from('')
    })
    const { harness } = await import('../src/commands/harness.js')
    await harness()
    expect(mockExecSync).toHaveBeenCalledTimes(2)
  })
})
