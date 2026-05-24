import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExistsSync = vi.fn()
const mockMkdirSync = vi.fn()
const mockReadFileSync = vi.fn()
const mockWriteFileSync = vi.fn()
const mockExecSync = vi.fn()

vi.mock('node:fs', () => ({
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  mkdirSync: (...a: unknown[]) => mockMkdirSync(...a),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
  writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
}))

vi.mock('node:child_process', () => ({
  execSync: (...a: unknown[]) => mockExecSync(...a),
}))

describe('ref', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('모듈을 import 할 수 있다', async () => {
    const mod = await import('../src/commands/ref.js')
    expect(mod.refAdd).toBeDefined()
    expect(mod.refList).toBeDefined()
    expect(mod.refOpen).toBeDefined()
  })

  it('refAdd — 빈 URL이면 안내만 출력하고 파일은 쓰지 않는다', async () => {
    const { refAdd } = await import('../src/commands/ref.js')
    await refAdd('')
    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })

  it('refAdd — 새 URL이면 .vhk/refs.json에 항목을 추가한다', async () => {
    mockExistsSync.mockReturnValue(false)
    const { refAdd } = await import('../src/commands/ref.js')
    await refAdd('https://example.com', '참고 사이트')

    expect(mockMkdirSync).toHaveBeenCalledWith('.vhk', { recursive: true })
    const call = mockWriteFileSync.mock.calls[0]
    expect(String(call[0])).toContain('refs.json')
    const data = JSON.parse(String(call[1]))
    expect(data).toHaveLength(1)
    expect(data[0].url).toBe('https://example.com')
    expect(data[0].memo).toBe('참고 사이트')
    expect(data[0].addedAt).toBeDefined()
  })

  it('refAdd — 중복 URL이면 쓰지 않는다', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      JSON.stringify([{ url: 'https://example.com', memo: '', addedAt: '2026-01-01' }])
    )
    const { refAdd } = await import('../src/commands/ref.js')
    await refAdd('https://example.com')
    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })

  it('refList — 저장된 항목이 없으면 안내만 출력', async () => {
    mockExistsSync.mockReturnValue(false)
    const { refList } = await import('../src/commands/ref.js')
    await refList()
    expect(mockReadFileSync).not.toHaveBeenCalled()
  })

  it('refList — 저장된 항목을 읽어 출력한다', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      JSON.stringify([
        { url: 'https://a.com', memo: 'A', addedAt: '2026-01-01T00:00:00.000Z' },
        { url: 'https://b.com', memo: '', addedAt: '2026-02-01T00:00:00.000Z' },
      ])
    )
    const logSpy = vi.spyOn(console, 'log')
    const { refList } = await import('../src/commands/ref.js')
    await refList()
    const joined = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(joined).toContain('https://a.com')
    expect(joined).toContain('https://b.com')
  })

  it('refOpen — 유효하지 않은 인덱스면 execSync를 호출하지 않는다', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      JSON.stringify([{ url: 'https://a.com', memo: '', addedAt: '2026-01-01' }])
    )
    const { refOpen } = await import('../src/commands/ref.js')
    await refOpen('99')
    expect(mockExecSync).not.toHaveBeenCalled()
  })

  it('refOpen — 유효한 인덱스면 플랫폼별 open 명령을 호출한다', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      JSON.stringify([{ url: 'https://a.com', memo: '', addedAt: '2026-01-01' }])
    )
    const { refOpen } = await import('../src/commands/ref.js')
    await refOpen('1')
    expect(mockExecSync).toHaveBeenCalled()
    const cmd = String(mockExecSync.mock.calls[0][0])
    expect(cmd).toContain('https://a.com')
  })
})
