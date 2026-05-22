import { Command } from 'commander';
import { gate } from './commands/gate.js';
import { init } from './commands/init.js';

const program = new Command();

program
  .name('vhk')
  .description('Vibe Harness Kit — 바이브코딩 풀사이클 CLI')
  .version('0.1.0');

program
  .command('gate')
  .description('Phase 0: 아이디어 검증 (퀵 5문항 / 풀 13단계 / 스킵) → GO/REFINE/DROP')
  .action(gate);

program
  .command('init')
  .description('Phase 1-2: 프로젝트 초기화 + 하네스 파일 자동 생성')
  .option('--skip-gate', 'Phase 0 gate 검증 스킵 (기획/설계 완료 시)')
  .option('--name <name>', '프로젝트 이름')
  .option('--description <desc>', '한 줄 설명')
  .option('--type <type>', '프로젝트 유형 (webapp|extension|cli|notion|mobile)')
  .option('--from-notion <url>', 'Notion PRD 페이지 URL에서 내용 import')
  .option('-y, --yes', '스택 확인 프롬프트 스킵')
  .action(init)

const args = process.argv.slice(2)
if (args.length === 0) {
  program.outputHelp()
  process.exit(0)
}

program.parse()
