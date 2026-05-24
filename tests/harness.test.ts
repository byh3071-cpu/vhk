import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSafeExecFile = vi.fn()
const mockReadFileSync = vi.fn()
const mockExistsSync = vi.fn()

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

  it('package.json scripts가 없으면 안내만 출력하고 safeExecFile 호출 없음', async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ name: 't' }))
    mockExistsSync.mockReturnValue(false)
    const { harness } = await import('../src/commands/harness.js')
    await harness()
    expect(mockSafeExecFile).not.toHaveBeenCalled()
  })

  it('test/build scripts 감지 시 순차 실행한다', async () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ scripts: { test: 'vitest', build: 'tsup' } })
    )
    mockExistsSync.mockReturnValue(false)
    mockSafeExecFile.mockReturnValue({ ok: true, out: '' })
    const { harness } = await import('../src/commands/harness.js')
    await harness()
    const callArgs = mockSafeExecFile.mock.calls.map((c) => c[1] as string[])
    expect(callArgs.some((a) => a.includes('test'))).toBe(true)
    expect(callArgs.some((a) => a.includes('build'))).toBe(true)
  })

  it('실패해도 다음 점검을 계속 진행한다', async () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ scripts: { test: 'vitest', build: 'tsup' } })
    )
    mockExistsSync.mockReturnValue(false)
    let call = 0
    mockSafeExecFile.mockImplementation(() => {
      call += 1
      if (call === 1) return { ok: false, err: 'test failed', out: '' }
      return { ok: true, out: '' }
    })
    const { harness } = await import('../src/commands/harness.js')
    await harness()
    expect(mockSafeExecFile).toHaveBeenCalledTimes(2)
  })

  it('pnpm-lock.yaml 감지 시 pnpm으로 실행', async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ scripts: { build: 'tsup' } }))
    mockExistsSync.mockImplementation((p: unknown) => String(p) === 'pnpm-lock.yaml')
    mockSafeExecFile.mockReturnValue({ ok: true, out: '' })
    const { harness } = await import('../src/commands/harness.js')
    await harness()
    const bins = mockSafeExecFile.mock.calls.map((c) => c[0] as string)
    expect(bins[0]).toBe('pnpm')
  })
})
