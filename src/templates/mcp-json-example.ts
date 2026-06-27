/**
 * `.cursor/mcp.json.example` — 커밋 가능한 MCP 설정 샘플 (머신별 경로·시크릿 금지).
 * 실제 `.cursor/mcp.json` 은 gitignore — `vhk mcp-init` 으로 로컬 생성.
 */

import fs from 'node:fs'
import path from 'node:path'
import { readJsonFile } from '../lib/read-json.js'

export type McpExampleVariant = 'vhk' | 'private-agent-os'

export function MCP_JSON_EXAMPLE(variant: McpExampleVariant = 'vhk'): string {
  const servers =
    variant === 'private-agent-os'
      ? {
          'private-agent-os': {
            command: 'node',
            args: ['dist/index.js'],
            cwd: '${workspaceFolder}',
          },
        }
      : {
          vhk: {
            command: 'vhk-mcp',
            args: [],
          },
        }

  return JSON.stringify({ mcpServers: servers }, null, 2) + '\n'
}

/** cwd package.json name 또는 디렉터리명으로 example variant 추론. */
export function detectMcpExampleVariant(cwd: string): McpExampleVariant {
  try {
    const pkgPath = path.join(cwd, 'package.json')
    if (fs.existsSync(pkgPath)) {
      const pkg = readJsonFile<{ name?: string }>(pkgPath)
      if (pkg.name === 'private-mcp' || pkg.name === 'private-agent-os') return 'private-agent-os'
    }
    const base = path.basename(cwd)
    if (base === 'private-mcp' || base === 'private-rules-repository') return 'private-agent-os'
  } catch {
    // fall through
  }
  return 'vhk'
}
