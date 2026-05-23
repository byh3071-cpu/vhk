import { Command } from 'commander'
import { gate } from './commands/gate.js'
import { init } from './commands/init.js'
import { recap } from './commands/recap.js'
import { sync } from './commands/sync.js'

const program = new Command()

program
  .name('vhk')
  .description('Vibe Harness Kit — 바이브코딩 풀사이클 CLI')
  .version('0.2.0')

program
  .command('gate')
  .description('Phase 0: 아이디어 검증 → GO/REFINE/DROP')
  .action(gate)

program
  .command('init')
  .description('Phase 1-2: 프로젝트 초기화 + 하네스 파일 자동 생성')
  .option('--skip-gate', 'gate 검증 스킵')
  .option('--from-notion <url>', 'Notion PRD 페이지 URL에서 import')
  .option('--name <name>', '프로젝트 이름')
  .option('--description <desc>', '한 줄 설명')
  .option('--type <type>', '프로젝트 유형 (webapp|extension|cli|notion|mobile)')
  .option('-y, --yes', '스택 확인 스킵')
  .action(init)

program
  .command('recap')
  .description('Phase 3: 세션 기록 — Git diff → 세션 로그 자동 생성')
  .option('--since <date>', '분석 시작일 (YYYY-MM-DD)')
  .action(recap)

program
  .command('sync')
  .description('RULES.md → .cursorrules + CLAUDE.md 동기화')
  .action(sync)

program.parse()
