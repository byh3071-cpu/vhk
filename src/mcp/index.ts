import { startMcpServer } from './server.js'
import { resolveVhkCliInvocation } from './cli-path.js'

// 전역 vhk 가 PATH 에 없어도 로컬 dist/index.js 로 fallback 해 MCP 위임이 끊기지 않게 한다.
// (글로벌 미설치/npx 일회성 실행 시에도 도구가 동작하도록 — 배치3 §5)
const cli = resolveVhkCliInvocation()
if (cli.fallback) {
  console.error('[vhk-mcp] 전역 vhk 미발견 → 로컬 dist/index.js 로 CLI 위임을 fallback 합니다.')
}

startMcpServer().catch((err) => {
  // stderr로 에러를 흘려보내고 비정상 종료. MCP 클라이언트가 재시작 판단.
  console.error('VHK MCP 서버 시작 실패:', err)
  process.exit(1)
})
