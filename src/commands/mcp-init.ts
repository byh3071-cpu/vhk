import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'
import { t } from '../i18n/ko.js'
import { readJsonFile } from '../lib/read-json.js'
import { printNextStep } from '../lib/next-step.js'

type McpEntry = { command: string; args: string[] }
type McpConfig = { mcpServers: Record<string, McpEntry> }

// 자기 파일 위치 기준으로 vhk-mcp 진입점(dist/mcp/index.js) 찾기.
// npm 글로벌, pnpm 글로벌, 로컬 dev 모두에서 dist/commands/mcp-init.js → ../mcp/index.js 관계 동일.
// 존재 검증해서 깨진 경로 생성 차단 (v1.0.0 회귀: pnpm 글로벌에서 import.meta.resolve 실패 시 sandbox node_modules 가짜 경로 생성).
function resolveMcpEntryPoint(): string | null {
  try {
    const here = fileURLToPath(import.meta.url)
    const dir = dirname(here)
    // 후보 경로 (번들/dev/test 모두 커버):
    //   - dist/index.js (tsup 번들) → ./mcp/index.js (sibling 디렉토리)
    //   - dist/commands/mcp-init.js (분리 빌드) → ../mcp/index.js
    //   - src/commands/mcp-init.ts (dev) → ../mcp/index.js (런타임엔 dist 경로로 해석)
    for (const rel of [['mcp', 'index.js'], ['..', 'mcp', 'index.js']]) {
      const candidate = join(dir, ...rel)
      if (existsSync(candidate)) return candidate
    }
  } catch {
    // ignore
  }
  try {
    const url = import.meta.resolve?.('@byh3071/vhk/dist/mcp/index.js')
    if (typeof url === 'string') {
      const p = fileURLToPath(url)
      if (existsSync(p)) return p
    }
  } catch {
    // ignore
  }
  // dogfooding: cwd가 vhk 저장소
  try {
    const pkgPath = join(process.cwd(), 'package.json')
    if (existsSync(pkgPath)) {
      const pkg = readJsonFile<{ name?: string }>(pkgPath)
      if (pkg.name === '@byh3071/vhk') {
        const local = join(process.cwd(), 'dist', 'mcp', 'index.js')
        if (existsSync(local)) return local
      }
    }
  } catch {
    // ignore
  }
  return null
}

export function resolveVhkMcpEntry(): McpEntry {
  const entryPath = resolveMcpEntryPoint()
  if (entryPath) {
    return { command: 'node', args: [entryPath] }
  }
  // 진입점 못 찾으면 PATH의 vhk-mcp shim 사용 (npm/pnpm 글로벌 설치 시 등록됨).
  return { command: 'vhk-mcp', args: [] }
}

export async function mcpInit(): Promise<void> {
  console.log(chalk.bold('\n🔌 ' + t('mcp.initTitle')))
  console.log(chalk.gray('─'.repeat(40)))

  const cursorDir = join(process.cwd(), '.cursor')
  if (!existsSync(cursorDir)) {
    mkdirSync(cursorDir, { recursive: true })
  }

  const configPath = join(cursorDir, 'mcp.json')
  const vhkEntry: McpEntry = resolveVhkMcpEntry()

  let config: McpConfig
  if (existsSync(configPath)) {
    try {
      const parsed = readJsonFile<Partial<McpConfig>>(configPath)
      config = {
        mcpServers: { ...(parsed.mcpServers ?? {}), vhk: vhkEntry },
      }
    } catch {
      // 손상된 JSON: 새 설정으로 덮어쓰기 전에 사용자에게 알린다.
      console.log(chalk.yellow('⚠️  기존 .cursor/mcp.json 파싱 실패 — 새 파일로 덮어씁니다.'))
      config = { mcpServers: { vhk: vhkEntry } }
    }
  } else {
    config = { mcpServers: { vhk: vhkEntry } }
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')

  console.log(chalk.green('\n✅ Cursor MCP 설정 완료!'))
  console.log(chalk.cyan('📁 생성된 파일:'))
  console.log(`   ${configPath}`)
  printNextStep({
    message: t('mcp.nextMessage'),
    command: 'vhk mcp',
    cursorHint: t('mcp.nextCursor'),
  })
}
