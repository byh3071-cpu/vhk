import { startMcpServer } from './server.js'

startMcpServer().catch((err) => {
  // stderr로 에러를 흘려보내고 비정상 종료. MCP 클라이언트가 재시작 판단.
  console.error('VHK MCP 서버 시작 실패:', err)
  process.exit(1)
})
