import { Command, Help } from 'commander'
import chalk from 'chalk'
import inquirer from 'inquirer'
import { detectNaturalLanguageInput } from './lib/cli-args.js'
import { runNaturalLanguageRoute } from './lib/nlp-run.js'
import { getVhkVersion } from './lib/version.js'
import { ko } from './i18n/ko.js'
import { gate } from './commands/gate.js'
import { init } from './commands/init.js'
import { recap } from './commands/recap.js'
import { sync } from './commands/sync.js'
import { check } from './commands/check.js'
import { secure } from './commands/secure.js'
import { doctor } from './commands/doctor.js'
import { ship } from './commands/ship.js'
import { save } from './commands/save.js'
import { undo } from './commands/undo.js'
import { restore } from './commands/restore.js'
import { diff } from './commands/diff.js'
import { status } from './commands/status.js'
import { startMcpServer } from './mcp/server.js'
import { mcpInit } from './commands/mcp-init.js'
import { deploy } from './commands/deploy.js'
import { env, envCheck } from './commands/env.js'
import { publish } from './commands/publish.js'
import { design, designPalette } from './commands/design.js'
import { theme } from './commands/theme.js'
import { refAdd, refList, refOpen } from './commands/ref.js'
import { harness } from './commands/harness.js'
import { audit } from './commands/audit.js'
import { migrate } from './commands/migrate.js'
import { update } from './commands/update.js'
import { context, contextShow } from './commands/context.js'
import { memoryAdd, memoryList, memoryRemove } from './commands/memory.js'
import { brief } from './commands/brief.js'
import { start } from './commands/start.js'
import { cloudPush, cloudPull } from './commands/cloud.js'
import { goalCheck, goalDone, goalInit, goalList, goalNext } from './commands/goal.js'
import { blocker, learn, resume } from './commands/agent.js'

const program = new Command()
const defaultHelp = new Help()

const KO_ALIASES: Record<string, string> = {
  gate: '검증',
  start: '시작',
  init: '초기화',
  recap: '정리',
  sync: '규칙',
  check: '점검',
  secure: '보안',
  ship: '출하',
  doctor: '환경',
  save: '저장',
  undo: '되돌리기',
  restore: '복원',
  status: '상태',
  diff: '변경',
  deploy: '배포',
  env: '환경변수',
  'env-check': '환경변수점검',
  publish: '출시',
  design: '디자인',
  'design-palette': '팔레트',
  theme: '테마',
  ref: '레퍼런스',
  harness: '하네스',
  audit: '감사',
  migrate: '전환',
  update: '업데이트',
  context: '맥락',
  'context-show': '맥락보기',
  memory: '기억',
  brief: '브리핑',
  goal: '목표',
  blocker: '블로커',
  learn: '교훈',
  resume: '재개',
}

program
  .name('vhk')
  .description('VHK — 바이브코딩 프로젝트 코치 (한국어로 안내합니다)')
  .version(getVhkVersion())

program.configureHelp({
  formatHelp(cmd, helper) {
    if (cmd.parent) {
      return defaultHelp.formatHelp(cmd, helper)
    }

    const subs = helper.visibleCommands(cmd).filter((c) => c.name() !== 'help')
    const terms = subs.map((c) => {
      const alias = KO_ALIASES[c.name()]
      return alias ? `${c.name()} (${alias})` : c.name()
    })
    const termWidth = Math.max(...terms.map((t) => t.length), 0)

    const lines = [
      helper.commandDescription(cmd),
      '',
      '명령어:',
      ...subs.map((sub, i) => {
        const term = terms[i].padEnd(termWidth + 2)
        return `  ${term}${sub.description()}`
      }),
    ]

    return lines.join('\n') + '\n'
  },
})

// 1단계 — 아이디어 검증
program
  .command('gate')
  .alias('검증')
  .alias('아이디어')
  .description('아이디어 검증 → 시작해도 돼요 / 다듬기 / 다른 아이디어')
  .action(gate)

// 2단계 — 프로젝트 시작 (올인원 마법사: git + init + mcp-init + context)
program
  .command('start')
  .alias('시작')
  .alias('새프로젝트')
  .description('새 프로젝트 시작 마법사 — git init + 문서 + MCP + 컨텍스트 한 번에')
  .option('--from-notion <url>', 'Notion PRD 페이지에서 import')
  .option('--name <name>', '프로젝트 이름')
  .option('--description <desc>', '한 줄 설명')
  .option('--type <type>', '프로젝트 유형 (webapp|extension|cli|notion|mobile)')
  .option('-y, --yes', '모든 확인 스킵 (자동 yes)')
  .action(start)

// 2단계(저수준) — 문서/하네스만 생성. 일반 사용자는 'vhk start' 권장.
program
  .command('init')
  .alias('초기화')
  .alias('만들기')
  .description('하네스 파일만 생성 (git/MCP/context는 제외) — 보통 vhk start 권장')
  .option('--skip-gate', 'gate 검증 스킵')
  .option('--from-notion <url>', 'Notion PRD 페이지에서 import')
  .option('--name <name>', '프로젝트 이름')
  .option('--description <desc>', '한 줄 설명')
  .option('--type <type>', '프로젝트 유형 (webapp|extension|cli|notion|mobile)')
  .option('-y, --yes', '스택 확인 스킵')
  .action(init)

// 3단계 — 오늘 정리
program
  .command('recap')
  .alias('정리')
  .alias('오늘')
  .description('오늘 한 일 정리 + ADR/트러블슈팅 자동 분리')
  .option('--since <date>', '분석 시작일 (YYYY-MM-DD)')
  .action(recap)

// 유틸
program
  .command('sync')
  .alias('맞추기')
  .alias('규칙')
  .option('--dry-run', '미리보기만 — 파일 변경 없음')
  .option('-y, --yes', 'drift 확인 프롬프트 생략(덮어쓰기 동의)')
  .description('RULES.md → .cursorrules + CLAUDE.md 동기화 (덮어쓰기 전 자동 백업)')
  .action(async (opts: { dryRun?: boolean; yes?: boolean }) => { await sync(opts) })

program
  .command('check')
  .alias('점검')
  .alias('린트')
  .option('--goal <id>', 'goal id 지정 시 scripts/check-goal-<id>.sh 게이트 실행')
  .description('RULES.md 규칙 점검 — 코드 위반 검사 (또는 --goal <id> 로 goal 게이트)')
  .action(async (opts: { goal?: string }) => { await check(opts) })

const secureCmd = program
  .command('secure')
  .alias('보안')
  .description('보안 도구 모음 — scan: 시크릿·키 유출 검사')
  .action(secure)

secureCmd
  .command('scan')
  .alias('스캔')
  .description('시크릿/키 유출 스캔')
  .action(secure)

const cloudCmd = program
  .command('cloud')
  .alias('클라우드')
  .description('.vhk/ 클라우드 백업·복원 (GitHub gist) — push: 올리기, pull: 내리기')
  .action(() => { cloudCmd.help() })

cloudCmd
  .command('push')
  .alias('올리기')
  .description('.vhk/ 를 secret gist 로 백업')
  .action(async () => { await cloudPush() })

cloudCmd
  .command('pull')
  .alias('내리기')
  .argument('[gistId]', '복원할 gist id (생략 시 .vhk/cloud.json 사용)')
  .description('gist 에서 .vhk/ 복원')
  .action(async (gistId?: string) => { await cloudPull(gistId) })

program
  .command('ship')
  .alias('출하')
  .description('배포 체크리스트 + 회고 + 빌드 로그 생성')
  .action(ship)

program
  .command('doctor')
  .alias('환경')
  .alias('진단')
  .description('개발 환경 점검 — Node/Git/npm 상태 확인')
  .action(doctor)

program
  .command('save')
  .alias('저장')
  .description('변경사항 저장 (git add → commit → push)')
  .action(async () => { await save() })

program
  .command('undo')
  .alias('되돌리기')
  .description('최근 커밋 되돌리기')
  .action(async () => { await undo() })

program
  .command('restore')
  .alias('복원')
  .argument('[id]', '복원할 백업 id (생략 시 목록에서 선택)')
  .description('sync 백업 복원 (.vhk/backups/ — 언커밋 덮어쓰기 복구)')
  .action(async (id?: string) => { await restore(id) })

program
  .command('status')
  .alias('상태')
  .description('프로젝트 상태 대시보드')
  .action(async () => { await status() })

program
  .command('diff')
  .alias('변경')
  .alias('차이')
  .description('Git 변경사항 한국어 요약 (staged / unstaged / 새 파일)')
  .action(diff)

program
  .command('mcp')
  .description('MCP 서버 시작 (24 tool stdio — Cursor·Claude Desktop 등)')
  .action(async () => {
    await startMcpServer()
  })

program
  .command('mcp-init')
  .alias('mcp설정')
  .description('Cursor·Claude Desktop MCP 연동 설정 자동 생성 (.cursor/mcp.json)')
  .action(async () => {
    await mcpInit()
  })

program
  .command('deploy')
  .alias('배포')
  .description('프로덕션 배포 (Vercel/Netlify/Cloudflare 자동 감지)')
  .action(async () => { await deploy() })

program
  .command('env')
  .alias('환경변수')
  .description('.env → .env.example 동기화 + .gitignore 자동 추가')
  .action(async () => { await env() })

program
  .command('env-check')
  .alias('환경변수점검')
  .description('필수 환경변수 누락 검사')
  .action(async () => { await envCheck() })

program
  .command('publish')
  .alias('출시')
  .description('npm 배포 (버전 범프 → 빌드 → 테스트 → publish)')
  .action(async () => { await publish() })

program
  .command('design')
  .alias('디자인')
  .description('디자인 토큰 생성 (Tailwind config 또는 CSS 변수)')
  .action(async () => { await design() })

program
  .command('design-palette')
  .alias('팔레트')
  .description('컬러 팔레트 프리셋 선택 + 적용')
  .action(async () => { await designPalette() })

program
  .command('theme')
  .alias('테마')
  .description('다크/라이트 모드 CSS + 토글 유틸리티 생성')
  .action(async () => { await theme() })

const refCmd = program
  .command('ref')
  .alias('레퍼런스')
  .description('레퍼런스 URL 관리 (add / list / open)')
  .action(async () => { await refList() })

refCmd
  .command('add <url>')
  .option('--memo <memo>', '메모 추가')
  .description('레퍼런스 URL 추가')
  .action(async (url: string, opts: { memo?: string }) => {
    await refAdd(url, opts.memo)
  })

refCmd
  .command('list')
  .alias('목록')
  .description('저장된 레퍼런스 목록')
  .action(async () => { await refList() })

refCmd
  .command('open <index>')
  .alias('열기')
  .description('레퍼런스를 브라우저에서 열기')
  .action(async (index: string) => { await refOpen(index) })

program
  .command('harness')
  .alias('하네스')
  .description('통합 품질 점검 (lint + type-check + test + build)')
  .action(async () => { await harness() })

program
  .command('audit')
  .alias('감사')
  .option('--fix', '자동 수정 시도')
  .description('보안 취약점 감사 (npm audit 래핑)')
  .action(async (opts: { fix?: boolean }) => { await audit(opts.fix) })

program
  .command('migrate [target]')
  .alias('전환')
  .description('패키지 매니저 전환 (npm/yarn/pnpm)')
  .action(async (target?: string) => { await migrate(target) })

program
  .command('update')
  .alias('업데이트')
  .description('VHK CLI 최신 버전 업데이트')
  .action(async () => { await update() })

program
  .command('context')
  .alias('맥락')
  .description('프로젝트 맥락 파일 생성 (.vhk/context.md)')
  .action(async () => { await context() })

program
  .command('context-show')
  .alias('맥락보기')
  .description('현재 컨텍스트 파일 내용 출력')
  .action(async () => { await contextShow() })

const memoryCmd = program
  .command('memory')
  .alias('기억')
  .description('결정사항 기억 관리 (add / list / remove)')
  .action(async () => { await memoryList() })

memoryCmd
  .command('add <content>')
  .option('--tags <tags>', '태그 (쉼표 구분)')
  .description('결정사항 기억 저장')
  .action(async (content: string, opts: { tags?: string }) => {
    const tags = opts.tags ? opts.tags.split(',').map((s) => s.trim()) : undefined
    await memoryAdd(content, tags)
  })

memoryCmd
  .command('list')
  .alias('목록')
  .description('저장된 기억 목록')
  .action(async () => { await memoryList() })

memoryCmd
  .command('remove <index>')
  .alias('삭제')
  .description('기억 삭제 (1부터 시작하는 번호)')
  .action(async (index: string) => { await memoryRemove(index) })

program
  .command('brief')
  .alias('브리핑')
  .description('프로젝트 상태 요약 보고서 생성 (.vhk/brief.md)')
  .action(async () => { await brief() })

const goalCmd = program
  .command('goal')
  .alias('목표')
  .description('Goal 단계별 미션 관리 (init / list / next / check / done)')
  .action(async () => { await goalList() })

goalCmd
  .command('list')
  .alias('목록')
  .description('goals/*.md 목록 (id, status, priority, title)')
  .action(async () => { await goalList() })

goalCmd
  .command('next')
  .alias('다음')
  .description('active goal 자동 선택 → docs/state/next-task.md 갱신')
  .action(async () => { await goalNext() })

goalCmd
  .command('init')
  .alias('초기화')
  .description('현재 프로젝트에 goals/ + docs/state/ 스캐폴딩 (기존 파일 보존)')
  .action(async () => { await goalInit() })

goalCmd
  .command('check')
  .alias('검증')
  .option('--id <id>', 'goal id 지정 (생략 시 active goal)')
  .description('scripts/check-goal-<id>.sh 실행 + exit code 전달')
  .action(async (opts: { id?: string }) => { await goalCheck(opts) })

goalCmd
  .command('done')
  .alias('완료')
  .option('--id <id>', 'goal id 지정 (생략 시 active goal)')
  .description('게이트 재검증 → 통과 시 frontmatter status=DONE 으로 전이')
  .action(async (opts: { id?: string }) => { await goalDone(opts) })

program
  .command('blocker <description>')
  .alias('블로커')
  .description('블로커 기록 → docs/state/blockers.md append (3건 누적 시 HARD_STOP 자동 생성)')
  .action(async (description: string) => { await blocker(description) })

program
  .command('learn <lesson>')
  .alias('교훈')
  .description('교훈 기록 → docs/state/learnings.md append (memory.json 과 별도 SoT)')
  .action(async (lesson: string) => { await learn(lesson) })

program
  .command('resume')
  .alias('재개')
  .option('--confirm', '사람 확인 — 자동 호출 금지 (Forbidden 위반)')
  .description('.vhk/HARD_STOP 해제 (사용자가 사유 확인 후 --confirm 필요)')
  .action(async (opts: { confirm?: boolean }) => { await resume(opts) })

program.on('command:*', async (operands: string[]) => {
  const unknown = operands[0] ?? ''
  const rest = operands.slice(1)
  const input = [unknown, ...rest].join(' ').trim()
  await runNaturalLanguageRoute(input)
})

program.action(async () => {
  console.log('\n🎯 VHK — 바이브코딩 프로젝트 코치\n')

  const { choice } = await inquirer.prompt<{ choice: string }>([{
    type: 'list',
    name: 'choice',
    message: '뭘 도와드릴까요?',
    choices: [
      { name: '💡 새 아이디어 검증하기', value: 'gate' },
      { name: '🚀 새 프로젝트 시작 마법사 (start)', value: 'start' },
      { name: '📝 오늘 한 일 정리하기', value: 'recap' },
      { name: '🔍 규칙 파일 점검하기', value: 'check' },
      { name: '🔒 보안 스캔 돌리기', value: 'secure' },
      { name: '🔄 규칙 파일 동기화', value: 'sync' },
      { name: '🚀 배포하기', value: 'ship' },
      { name: '🩺 환경 점검하기', value: 'doctor' },
      { name: '💾 Git에 저장하기', value: 'save' },
      { name: '⏪ 최근 커밋 되돌리기', value: 'undo' },
      { name: '🔍 변경사항 보기', value: 'diff' },
      { name: '📊 프로젝트 상태 보기', value: 'status' },
    ],
  }])

  switch (choice) {
    case 'gate':
      return gate()
    case 'start':
      return start()
    case 'recap':
      return recap({})
    case 'check':
      return check()
    case 'secure':
      return secure()
    case 'sync':
      return sync()
    case 'doctor':
      return doctor()
    case 'ship':
      return ship()
    case 'save':
      return save()
    case 'undo':
      return undo()
    case 'status':
      return status()
    case 'diff':
      return diff()
  }
})

const nlInput = detectNaturalLanguageInput(process.argv)
if (nlInput !== null) {
  await runNaturalLanguageRoute(nlInput)
} else {
  await program.parseAsync(process.argv)
}
