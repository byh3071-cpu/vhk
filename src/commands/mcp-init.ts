import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'
import { t } from '../i18n/ko.js'

type McpEntry = { command: string; args: string[] }
type McpConfig = { mcpServers: Record<string, McpEntry> }

function resolveVhkMcpPath(): string {
  try {
    // 글로벌 설치 (npm i -g) 환경: import.meta.resolve로 패키지 경로를 찾는다.
    // 반환값은 file:// URL이므로 fileURLToPath로 OS 네이티브 경로로 변환 (Windows 대응).
    const url = import.meta.resolve?.('@byh3071/vhk/dist/mcp/index.js')
    if (typeof url === 'string') return fileURLToPath(url)
  } catch {
    // ignore
  }
  // 로컬 fallback: node_modules 안의 경로 추정.
  return join(process.cwd(), 'node_modules', '@byh3071', 'vhk', 'dist', 'mcp', 'index.js')
}

export async function mcpInit(): Promise<void> {
  console.log(chalk.bold('\n🔌 ' + t('mcp.initTitle')))
  console.log(chalk.gray('─'.repeat(40)))

  const cursorDir = join(process.cwd(), '.cursor')
  if (!existsSync(cursorDir)) {
    mkdirSync(cursorDir, { recursive: true })
  }

  const configPath = join(cursorDir, 'mcp.json')
  const vhkEntry: McpEntry = {
    command: 'node',
    args: [resolveVhkMcpPath()],
  }

  let config: McpConfig
  if (existsSync(configPath)) {
    try {
      const parsed = JSON.parse(readFileSync(configPath, 'utf-8')) as Partial<McpConfig>
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
  console.log(chalk.cyan('\n🔄 다음 단계:'))
  console.log('   1. Cursor를 재시작하세요')
  console.log('   2. Cursor 채팅에서 vhk 도구를 사용할 수 있습니다')
  console.log(chalk.gray('\n💡 예: "프로젝트 상태 알려줘" → Cursor가 vhk status 호출'))
}
