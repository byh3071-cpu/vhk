/**
 * `.cursor/mcp.json.example` — 커밋 가능한 MCP 설정 샘플 (머신별 경로·시크릿 금지).
 * 실제 `.cursor/mcp.json` 은 gitignore — `vhk mcp-init` 으로 로컬 생성.
 */

import fs from 'node:fs'
import path from 'node:path'
import { readJsonFile } from '../lib/read-json.js'

export type McpExampleVariant = 'vhk' | 'yohan-os'

export function MCP_JSON_EXAMPLE(variant: McpExampleVariant = 'vhk'): string {
  const servers =
    variant === 'yohan-os'
      ? {
          'yohan-os': {
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
      if (pkg.name === 'yohan-mcp' || pkg.name === 'yohan-os') return 'yohan-os'
    }
    const base = path.basename(cwd)
    if (base === 'yohan-mcp' || base === 'yohan-brain') return 'yohan-os'
  } catch {
    // fall through
  }
  return 'vhk'
}
