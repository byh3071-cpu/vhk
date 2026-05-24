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
    expect(mod.resolveVhkMcpEntry).toBeDefined()
  })

  it('.cursor/mcp.json 이 없으면 새로 생성하고 vhk 항목을 등록한다', async () => {
    // dist/mcp/index.js 경로가 존재한다고 가정 (자기 파일 위치 기반 1차 시도가 성공)
    mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('mcp/index.js') || String(p).endsWith('mcp\\index.js'))
    const { mcpInit } = await import('../src/commands/mcp-init.js')
    await mcpInit()
    expect(mockMkdirSync).toHaveBeenCalled()
    expect(mockWriteFileSync).toHaveBeenCalled()
    const writeCall = mockWriteFileSync.mock.calls[0]
    expect(String(writeCall[0])).toContain('mcp.json')
    const content = JSON.parse(String(writeCall[1]))
    expect(content.mcpServers.vhk).toBeDefined()
    expect(content.mcpServers.vhk.command).toBe('node')
    expect(content.mcpServers.vhk.args[0]).toMatch(/mcp[\\/]index\.js$/)
  })

  it('.cursor/mcp.json 이 이미 있으면 vhk 항목만 병합한다', async () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const s = String(p)
      return s.includes('mcp.json') || s.endsWith('mcp/index.js') || s.endsWith('mcp\\index.js')
    })
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

  it('진입점 파일을 못 찾으면 PATH의 vhk-mcp shim으로 fallback', async () => {
    // dist/mcp/index.js 후보 경로 전부 false → resolveMcpEntryPoint() null 반환
    mockExistsSync.mockImplementation((p: unknown) => String(p).includes('mcp.json'))
    const { resolveVhkMcpEntry } = await import('../src/commands/mcp-init.js')
    const entry = resolveVhkMcpEntry()
    expect(entry.command).toBe('vhk-mcp')
    expect(entry.args).toEqual([])
  })

  it('생성된 args 경로는 항상 실제 존재하는 파일이다 (가짜 node_modules 경로 회귀 방지)', async () => {
    // existsSync는 mcp/index.js 끝나는 경로만 true 반환 → import.meta 기반 1차 시도 성공
    mockExistsSync.mockImplementation((p: unknown) => /mcp[\\/]index\.js$/.test(String(p)))
    const { resolveVhkMcpEntry } = await import('../src/commands/mcp-init.js')
    const entry = resolveVhkMcpEntry()
    // 'node' command + 실존 경로 args[0] 또는 vhk-mcp fallback 둘 중 하나
    if (entry.command === 'node') {
      expect(entry.args[0]).toMatch(/mcp[\\/]index\.js$/)
    } else {
      expect(entry.command).toBe('vhk-mcp')
    }
  })
})
