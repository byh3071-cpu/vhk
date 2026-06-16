import type { Diagnostic } from '../types.js'

// VHK 자체 MCP 서버의 등록 도구 수로 무결성 판정(Phase 2). 외부 서버 핑은 환경의존이라 별도.
export function buildMcpDiag(toolCount: number, expected = 30): Diagnostic {
  if (toolCount <= 0) {
    return { name: 'MCP', status: 'fail', value: '도구 0개', advice: 'MCP 서버 등록 깨짐 — vhk 재설치' }
  }
  if (toolCount < expected) {
    return { name: 'MCP', status: 'warn', value: `${toolCount} tools (기대 ${expected}+)`, advice: 'MCP 도구 일부 누락 가능 — vhk 버전 확인' }
  }
  return { name: 'MCP', status: 'ok', value: `${toolCount} tools 등록` }
}

// 런타임: createVhkMcpServer 를 in-process 구성(stdio 시작 X)해 등록 도구 수를 센다.
// SDK private(_registeredTools) 접근 — SDK 메이저 업글 시 여기 패치(mcp-introspect 테스트가 회귀 가드).
export async function mcpToolCount(): Promise<number> {
  try {
    const { createVhkMcpServer } = await import('../../mcp/server.js')
    const server = createVhkMcpServer() as unknown as { _registeredTools?: Record<string, unknown> }
    return Object.keys(server._registeredTools ?? {}).length
  } catch {
    return 0
  }
}
