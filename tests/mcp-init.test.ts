import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExistsSync = vi.fn()
const mockMkdirSync = vi.fn()
const mockReadFileSync = vi.fn()
const mockWriteFileSync = vi.fn()

vi.mock('node:fs', () => ({
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  mkdirSync: (...a: unknown[]) => mockMkdirSync(...a),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
  writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
}))

describe('mcp-init', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('모듈을 import 할 수 있다', async () => {
    const mod = await import('../src/commands/mcp-init.js')
    expect(mod.mcpInit).toBeDefined()
  })

  it('.cursor/mcp.json 이 없으면 새로 생성한다', async () => {
    mockExistsSync.mockReturnValue(false)
    const { mcpInit } = await import('../src/commands/mcp-init.js')
    await mcpInit()
    expect(mockMkdirSync).toHaveBeenCalled()
    expect(mockWriteFileSync).toHaveBeenCalled()
    const writeCall = mockWriteFileSync.mock.calls[0]
    expect(String(writeCall[0])).toContain('mcp.json')
    const content = JSON.parse(String(writeCall[1]))
    expect(content.mcpServers.vhk).toBeDefined()
    expect(content.mcpServers.vhk.command).toBe('node')
  })

  it('.cursor/mcp.json 이 이미 있으면 vhk 항목만 병합한다', async () => {
    mockExistsSync.mockImplementation((p: unknown) => String(p).includes('mcp.json'))
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ mcpServers: { other: { command: 'foo', args: [] } } })
    )
    const { mcpInit } = await import('../src/commands/mcp-init.js')
    await mcpInit()
    const writeCall = mockWriteFileSync.mock.calls[0]
    const content = JSON.parse(String(writeCall[1]))
    expect(content.mcpServers.other).toBeDefined()
    expect(content.mcpServers.vhk).toBeDefined()
  })
})
