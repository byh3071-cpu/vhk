import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExistsSync = vi.fn()
const mockReadFileSync = vi.fn()
const mockWriteFileSync = vi.fn()
const mockMkdirSync = vi.fn()

vi.mock('node:fs', () => ({
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
  writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
  mkdirSync: (...a: unknown[]) => mockMkdirSync(...a),
}))

describe('memory', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('모듈을 import 할 수 있다', async () => {
    const mod = await import('../src/commands/memory.js')
    expect(mod.memoryAdd).toBeDefined()
    expect(mod.memoryList).toBeDefined()
    expect(mod.memoryRemove).toBeDefined()
  })

  it('memoryAdd — 빈 content면 쓰지 않음', async () => {
    const { memoryAdd } = await import('../src/commands/memory.js')
    await memoryAdd('')
    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })

  it('memoryAdd — 새 content면 .vhk/memory.json에 추가', async () => {
    mockExistsSync.mockReturnValue(false)
    const { memoryAdd } = await import('../src/commands/memory.js')
    await memoryAdd('API는 tRPC 사용', ['decision', 'arch'])

    expect(mockMkdirSync).toHaveBeenCalledWith('.vhk', { recursive: true })
    const call = mockWriteFileSync.mock.calls[0]
    expect(String(call[0])).toContain('memory.json')
    const data = JSON.parse(String(call[1]))
    expect(data).toHaveLength(1)
    expect(data[0].content).toBe('API는 tRPC 사용')
    expect(data[0].tags).toEqual(['decision', 'arch'])
    expect(data[0].addedAt).toBeDefined()
  })

  it('memoryAdd — 기존 항목에 append', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      JSON.stringify([{ content: '기존', addedAt: '2026-01-01', tags: [] }])
    )
    const { memoryAdd } = await import('../src/commands/memory.js')
    await memoryAdd('새 결정')

    const data = JSON.parse(String(mockWriteFileSync.mock.calls[0][1]))
    expect(data).toHaveLength(2)
    expect(data[0].content).toBe('기존')
    expect(data[1].content).toBe('새 결정')
  })

  it('memoryList — 항목 0이면 안내만, read 호출 X', async () => {
    mockExistsSync.mockReturnValue(false)
    const { memoryList } = await import('../src/commands/memory.js')
    await memoryList()
    expect(mockReadFileSync).not.toHaveBeenCalled()
  })

  it('memoryList — 항목 출력', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      JSON.stringify([
        { content: 'A', addedAt: '2026-01-01T00:00:00.000Z', tags: [] },
        { content: 'B', addedAt: '2026-02-01T00:00:00.000Z', tags: ['db'] },
      ])
    )
    const logSpy = vi.spyOn(console, 'log')
    const { memoryList } = await import('../src/commands/memory.js')
    await memoryList()
    const joined = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(joined).toContain('A')
    expect(joined).toContain('B')
    expect(joined).toContain('db')
  })

  it('memoryRemove — 유효하지 않은 인덱스면 쓰지 않음', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      JSON.stringify([{ content: 'A', addedAt: '2026-01-01', tags: [] }])
    )
    const { memoryRemove } = await import('../src/commands/memory.js')
    await memoryRemove('99')
    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })

  it('memoryRemove — 유효한 인덱스면 삭제 후 저장', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      JSON.stringify([
        { content: 'A', addedAt: '2026-01-01', tags: [] },
        { content: 'B', addedAt: '2026-02-01', tags: [] },
      ])
    )
    const { memoryRemove } = await import('../src/commands/memory.js')
    await memoryRemove('1')

    const data = JSON.parse(String(mockWriteFileSync.mock.calls[0][1]))
    expect(data).toHaveLength(1)
    expect(data[0].content).toBe('B')
  })
})
