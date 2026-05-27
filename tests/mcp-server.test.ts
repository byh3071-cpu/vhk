import { describe, it, expect, vi } from 'vitest'

vi.mock('node:child_process')
vi.mock('node:fs')

interface ToolRegistryShape {
  _registeredTools: Record<string, unknown>
}

async function getRegisteredToolNames(): Promise<string[]> {
  const { createVhkMcpServer } = await import('../src/mcp/server.js')
  const server = createVhkMcpServer() as unknown as ToolRegistryShape
  return Object.keys(server._registeredTools)
}

describe('MCP Server', () => {
  it('서버 인스턴스가 생성된다', async () => {
    const { createVhkMcpServer } = await import('../src/mcp/server.js')
    const server = createVhkMcpServer()
    expect(server).toBeDefined()
  })

  it('기존 10 tool이 등록되어 있다 (v1.0 안정성 약속)', async () => {
    const names = await getRegisteredToolNames()
    for (const t of ['save', 'undo', 'status', 'diff', 'ship', 'doctor', 'check', 'recap', 'env', 'env-check']) {
      expect(names).toContain(t)
    }
  })

  it('Goal 0 v1.1 신규 6 tool이 등록되어 있다', async () => {
    const names = await getRegisteredToolNames()
    for (const t of ['sync', 'secure', 'audit', 'harness', 'context', 'brief']) {
      expect(names).toContain(t)
    }
  })

  it('총 16+ tool이 등록되어 있다 (Goal 0 진행 중 baseline)', async () => {
    const names = await getRegisteredToolNames()
    expect(names.length).toBeGreaterThanOrEqual(16)
  })
})
