/**
 * `.cursor/mcp.json.example` — 커밋 가능한 MCP 설정 샘플 (머신별 경로·시크릿 금지).
 * 실제 `.cursor/mcp.json` 은 gitignore — `vhk mcp-init` 으로 로컬 생성.
 */

export type McpExampleVariant = 'vhk'

export function MCP_JSON_EXAMPLE(_variant: McpExampleVariant = 'vhk'): string {
  const servers = {
    vhk: {
      command: 'vhk-mcp',
      args: [],
    },
  }

  return JSON.stringify({ mcpServers: servers }, null, 2) + '\n'
}

/** cwd package.json name 또는 디렉터리명으로 example variant 추론. */
export function detectMcpExampleVariant(cwd: string): McpExampleVariant {
  void cwd
  return 'vhk'
}
