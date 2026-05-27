// McpServer 의 private 멤버 조회용 테스트 전용 헬퍼.
// SDK 가 public introspection API 를 제공하지 않아 private 캐스팅으로 접근.
// SDK 메이저 업그레이드 시 깨지면 여기 한 곳만 패치 — SDK 1.29.x 기준.
// 운영 코드에서는 절대 사용 금지 (테스트 격리용).

interface ToolRegistryShape {
  _registeredTools: Record<string, unknown>
}

interface ServerInfoShape {
  server: {
    _serverInfo: { name: string; version: string }
  }
}

async function loadServer(): Promise<unknown> {
  const { createVhkMcpServer } = await import('../../src/mcp/server.js')
  return createVhkMcpServer()
}

export async function getRegisteredToolNames(): Promise<string[]> {
  const server = (await loadServer()) as ToolRegistryShape
  return Object.keys(server._registeredTools)
}

export async function getServerVersion(): Promise<string> {
  const server = (await loadServer()) as ServerInfoShape
  return server.server._serverInfo.version
}

export async function getServerName(): Promise<string> {
  const server = (await loadServer()) as ServerInfoShape
  return server.server._serverInfo.name
}
