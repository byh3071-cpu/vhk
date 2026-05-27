import { describe, it, expect, vi } from 'vitest'
import { getRegisteredToolNames, getServerVersion } from './helpers/mcp-introspect.js'

vi.mock('node:child_process')
vi.mock('node:fs')

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

  it('Goal 0 1차 — 신규 6 tool (sync/secure/audit/harness/context/brief)', async () => {
    const names = await getRegisteredToolNames()
    for (const t of ['sync', 'secure', 'audit', 'harness', 'context', 'brief']) {
      expect(names).toContain(t)
    }
  })

  it('Goal 0 2차 — 신규 8 tool (deploy/publish/migrate/update/ref-list/memory-list/context-show/mcp-init)', async () => {
    const names = await getRegisteredToolNames()
    for (const t of [
      'deploy',
      'publish',
      'migrate',
      'update',
      'ref-list',
      'memory-list',
      'context-show',
      'mcp-init',
    ]) {
      expect(names).toContain(t)
    }
  })

  it('Goal 0 완료 baseline — registerTool 24개 이상', async () => {
    const names = await getRegisteredToolNames()
    expect(names.length).toBeGreaterThanOrEqual(24)
  })

  it('SERVER_VERSION 이 package.json 과 정합 (lib/version SoT)', async () => {
    const { getVhkVersion } = await import('../src/lib/version.js')
    const pkgVersion = getVhkVersion()
    expect(pkgVersion).toMatch(/^\d+\.\d+\.\d+/)
    // SDK private 접근은 mcp-introspect 헬퍼로 격리 — SDK 변경 시 헬퍼 1 곳만 패치.
    expect(await getServerVersion()).toBe(pkgVersion)
  })
})
