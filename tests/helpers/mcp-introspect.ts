// McpServer 의 등록된 tool 목록을 조회하는 테스트 전용 헬퍼.
// SDK 가 tool 카운트/이름 public API 를 제공하지 않아 private 멤버 `_registeredTools`
// 를 캐스팅으로 접근한다. SDK 메이저 업그레이드 시 깨지면 여기 한 곳만 패치.
// 운영 코드에서는 절대 사용 금지 (테스트 격리용).

interface ToolRegistryShape {
  _registeredTools: Record<string, unknown>
}

export async function getRegisteredToolNames(): Promise<string[]> {
  const { createVhkMcpServer } = await import('../../src/mcp/server.js')
  const server = createVhkMcpServer() as unknown as ToolRegistryShape
  return Object.keys(server._registeredTools)
}
