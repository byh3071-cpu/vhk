import { Command, Help } from 'commander'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import chalk from 'chalk'
import { prompt } from './lib/prompt.js'
import { detectNaturalLanguageInput, detectInvalidCommandUsage } from './lib/cli-args.js'
import { runNaturalLanguageRoute } from './lib/nlp-run.js'
import { getVhkVersion, getVhkDescription, normalizeMcpToolCount } from './lib/version.js'
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
import { diffCover } from './commands/diff-cover.js'
import { status } from './commands/status.js'
import { stats } from './commands/stats.js'
import { loopTick } from './commands/loop.js'
import { startMcpServer, getMcpToolCount } from './mcp/server.js'
import { mcpInit } from './commands/mcp-init.js'
import { injectBootstrapCommand } from './commands/inject-bootstrap.js'
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
import { memoryAdd, memoryList, memoryRemove, memoryArchive, memoryResolve, memoryUnarchive, memoryMigrate, memoryRecall } from './commands/memory.js'
import { memoryEval } from './commands/memory-eval.js'
import { brief } from './commands/brief.js'
import { loopBrief } from './commands/loop-brief.js'
import { remind } from './commands/remind.js'
import { content } from './commands/content.js'
import { launch } from './commands/launch.js'
import { ops } from './commands/ops.js'
import { sell } from './commands/sell.js'
import { work, workHandoff } from './commands/work.js'
import { getUpdateInfo } from './lib/version-check.js'
import { QUICK_ACTIONS } from './commands/help.js'
import { start } from './commands/start.js'
import { bootstrapCursor } from './commands/bootstrap-cursor.js'
import { mode } from './commands/mode.js'
import { configSetBrainRoot, configSetRulesFile } from './commands/config.js'
import { verify } from './commands/verify.js'
import { cost } from './commands/cost.js'
import { preflight } from './commands/preflight.js'
import { testmap } from './commands/testmap.js'
import { worktreeAdd, worktreeCheck } from './commands/worktree.js'
import { standup } from './commands/standup.js'
import { today } from './commands/today.js'
import { review } from './commands/review.js'
import { receipt } from './commands/receipt.js'
import { missionSet, missionShow, missionCheck, missionClear } from './commands/mission.js'
import { runGuarded } from './lib/safety-guard.js'
import { ensureNotHardStopped } from './lib/hard-stop-guard.js'
import { isPromptAbortError, isInteractive, TTY_REQUIRED_EXIT_CODE } from './lib/interactive.js'

/**
 * CLI high-risk 작업 가드 — 단일 chokepoint(runGuarded) 경유.
 * standard/strict 면 confirm(거부/비대화형 → 중단), lite 면 경고만. `--yes` 로 명시 승인.
 * (각 호출부는 한 줄로 위임만 — 결정 로직은 runGuarded 한 곳.)
 */
async function guardCli(
  action: string,
  approved: boolean,
  run: () => Promise<void> | void,
  target?: string, // Goal 57: 위험 대상(파일/경로) — risk-policy 글롭 차원 + 행동원장 target 기록.
): Promise<void> {
  // VHK-020: HARD_STOP 활성 시 high-risk CLI 작업(save/deploy/publish/sync/migrate/cloud-pull/env-write) 차단.
  if (!ensureNotHardStopped(action)) return
  await runGuarded(
    action,
    {
      channel: 'cli',
      approved,
      target,
      confirm: async () => {
        const { ok } = await prompt<{ ok: boolean }>([{
          type: 'confirm',
          name: 'ok',
          message: `⚠️ 위험 작업(${action})을 실행할까요?`,
          default: false,
        }])
        return ok
      },
      log: (m) => console.log(chalk.yellow(`  ${m}`)),
    },
    run,
  )
}

/**
 * undo/resume 처럼 명령이 **자체 확인**(undo: 푸시 커밋 경고·되돌릴 개수, resume: --confirm)을
 * 하는 high-risk 용 가드. 단일 chokepoint(runGuarded)로 모드 정책만 적용하고
 * (비대화형 미승인 → 차단, lite → 경고만), 실제 사용자 확인은 명령에 위임해 이중 프롬프트를 막는다.
 * → 일관성(전부 runGuarded 경유) + 명령별 특화 안전(푸시 경고/--confirm) 둘 다 유지.
 */
async function guardCliDefer(
  action: string,
  approved: boolean,
  run: () => Promise<void> | void,
): Promise<void> {
  // #338: undo 등 high-risk 는 HARD_STOP 활성 시 차단. resume 만 예외 — resume 은 HARD_STOP
  // *해제* 명령이라 가드하면 자기 자신을 막는 역설(resume --confirm 이 유일한 트립와이어 해제 통로).
  if (action !== 'resume' && !ensureNotHardStopped(action)) return
  await runGuarded(
    action,
    {
      channel: 'cli',
      approved,
      // TTY 면 통과(명령이 자체 확인), 비대화형은 confirm 불가 → 가드가 차단.
      confirm: async () => !!process.stdout.isTTY,
      log: (m) => console.log(chalk.yellow(`  ${m}`)),
    },
    run,
  )
}
import { cloudPush, cloudPull } from './commands/cloud.js'
import { goalCheck, goalDone, goalDrift, goalInit, goalList, goalMigrate, goalNext, goalPeek, goalSync } from './commands/goal.js'
import { blocker, learn, resume, win, autonomyLog, parseAutonomyIntArg, INVALID_AUTONOMY_ARG } from './commands/agent.js'
import { watch } from './commands/watch.js'
import { patternDetect, patternList, patternDismiss } from './commands/pattern.js'
import { evolveSuggest, evolveList, evolveApply, evolveReject, evolveUndo, evolveNegatives, evolveDigest, evolveSeed } from './commands/evolve.js'
import { runSeo, seoInit, seoSubmit, seoCheck, seoReport, seoAutomate } from './commands/seo/index.js'

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
  stats: '통계',
  diff: '변경',
  'diff-cover': '커버리지',
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
  preflight: '출고점검',
  worktree: '워크트리',
  standup: '아침',
  today: '자축',
  review: '검토',
  mission: '미션',
  blocker: '블로커',
  learn: '교훈',
  win: '성공',
  watch: '감시',
  resume: '재개',
  pattern: '패턴',
  evolve: '진화',
  work: '작업',
}

program
  .name('vhk')
  // Goal 81: 제품 설명 SoT = package.json.description (런타임 주입 — 하드코딩 복제·드리프트 제거).
  // #342 #343: 설명 안 'MCP N tools' 는 실 등록 도구 수(런타임 SoT)로 정규화해 표면 정합.
  .description(normalizeMcpToolCount(getVhkDescription(), getMcpToolCount()))
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
  .option('--type <type>', '프로젝트 유형 (webapp|extension|cli|notion|mobile|other)')
  .option('-y, --yes', '모든 확인 스킵 (자동 yes)')
  .action(start)

const bootstrapCmd = program
  .command('bootstrap')
  .description('Cursor/에이전트 배선 bootstrap (#467)')

bootstrapCmd
  .command('cursor')
  .description('Cursor 독푸딩 — doctor + goal migrate + inject-bootstrap + skills + verify')
  .option('-y, --yes', '확인 스킵 (비대화형)')
  .option('--skip-verify', '마지막 vhk verify 생략')
  .action(async (opts: { yes?: boolean; skipVerify?: boolean }) => {
    await bootstrapCursor({ yes: opts.yes, skipVerify: opts.skipVerify })
  })

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
  .option('--type <type>', '프로젝트 유형 (webapp|extension|cli|notion|mobile|other)')
  .option('-y, --yes', '스택 확인 스킵')
  .action(init)

// 3단계 — 오늘 정리
program
  .command('recap')
  .alias('정리')
  .alias('오늘')
  .description('오늘 한 일 정리 + ADR/트러블슈팅 자동 분리')
  .option('--since <date>', '분석 시작일 (YYYY-MM-DD)')
  // #288: 비-TTY(헤드리스 AI·파이프)에서도 회고를 남길 수 있게 비대화형 입력 경로 제공.
  .option('--summary <text>', '작업 요약 (비대화형 입력)')
  .option('--decisions <text>', '결정 사항 (비대화형 입력)')
  .option('--next <text>', '다음 할 일 (비대화형 입력)')
  .option('--blockers <text>', '블로커 (비대화형 입력)')
  .option('-y, --yes', '비대화형 실행 — 프롬프트 없이 플래그·기본값 사용 (TTY 에서도 강제)')
  .action(recap)

// 유틸
program
  .command('sync')
  .alias('맞추기')
  .alias('규칙')
  .option('--dry-run', '미리보기만 — 파일 변경 없음')
  .option('--check', '검사만 — sync 산출 전체(RULES 미러 8 + bootstrap) drift 검사(쓰기 0), drift 시 exit 1 (Goal 63)')
  .option('-y, --yes', 'drift 확인 프롬프트 생략(덮어쓰기 동의)')
  .description('RULES.md → .cursorrules + CLAUDE.md 동기화 (덮어쓰기 전 자동 백업)')
  .action(async (opts: { dryRun?: boolean; yes?: boolean; check?: boolean }) => { await guardCli('sync', opts?.yes === true, () => sync(opts)) })

program
  .command('check')
  .alias('점검')
  .alias('린트')
  .argument('[target]', "예약 서브명령 'evals'(골든셋 채점기, goal G-B 예정) — 미구현/미인식은 안내 (#405)")
  .option('--goal <id>', 'goal id 지정 시 scripts/check-goal-<id>.sh 게이트 실행')
  .option('--json', 'JSON 요약 출력 (CI/MCP용, #374)')
  .description('RULES.md 규칙 점검 — 코드 위반 검사 (또는 --goal <id> 로 goal 게이트)')
  .action(async (target: string | undefined, opts: { goal?: string; json?: boolean }) => { await check(opts, target) })

const secureCmd = program
  .command('secure')
  .alias('보안')
  .description('보안 도구 모음 — scan: 시크릿·키 유출 검사')
  .action(async () => { await secure() })

secureCmd
  .command('scan')
  .alias('스캔')
  .argument('[paths...]', '발행물 초안 등 특정 파일만 스캔 (#457 게시 전 게이트 — 미지정 시 프로젝트 전체)')
  .description('시크릿/키 유출 스캔 — 경로 지정 시 초안 파일 단위(.md 포함)')
  .action(async (paths: string[]) => { await secure(paths) })

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
  .option('--yes', '확인 없이 실행 (위험 작업 명시 승인)')
  .description('gist 에서 .vhk/ 복원')
  .action(async (gistId: string | undefined, opts: { yes?: boolean }) => { await guardCli('cloud-pull', opts?.yes === true, () => cloudPull(gistId)) })

program
  .command('ship')
  .alias('출하')
  .description('배포 체크리스트 + 회고 + 빌드 로그 생성')
  .action(ship)

program
  .command('doctor')
  .alias('환경')
  .alias('진단')
  .option('--strict', '규칙 드리프트 발견 시 실패 처리 (exit 1, CI 게이트용)')
  .option('--audit', '의존성 보안 audit 포함 (기본 생략 — pnpm/yarn/npm audit)')
  .option('--json', '진단 결과를 JSON 으로 출력 (CI/MCP용 — 제목·드리프트 생략)')
  .description('개발 환경 점검 — Node/npm/pnpm/git/OS + VHK/MCP/audit 진단')
  .action(async (opts: { strict?: boolean; audit?: boolean; json?: boolean }) => { await doctor(opts) })

program
  .command('save')
  .alias('저장')
  .option('--yes', '확인 없이 실행 (strict 모드 가드 명시 승인)')
  .option('-m, --message <msg>', '커밋 메시지 직접 지정 (비-TTY/에이전트용 — 프롬프트 생략)')
  .description('변경사항 저장 (git add → commit → push)')
  .action(async (opts: { yes?: boolean; message?: string }) => { await guardCli('save', opts?.yes === true, () => save({ message: opts?.message })) })

program
  .command('undo')
  .alias('되돌리기')
  .option('--yes', '확인 없이 실행 (위험 작업 명시 승인)')
  .description('최근 커밋 되돌리기')
  .action(async (opts: { yes?: boolean }) => { await guardCliDefer('undo', opts?.yes === true, () => undo()) })

program
  .command('restore')
  .alias('복원')
  .argument('[id]', '복원할 백업 id (생략 시 목록에서 선택)')
  .option('--yes', '확인 없이 실행 (위험 작업 명시 승인)')
  .description('sync 백업 복원 (.vhk/backups/ — 언커밋 덮어쓰기 복구)')
  .action(async (id: string | undefined, opts: { yes?: boolean }) => { await guardCli('restore', opts?.yes === true, () => restore(id)) })

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
  .command('diff-cover')
  .alias('커버리지')
  .description('이번 변경(HEAD 대비)이 테스트로 커버됐는지 측정 (자문형·차단 없음)')
  .action(async () => { await diffCover() })

program
  .command('stats')
  .alias('통계')
  .description('통계 대시보드 — 패스율/차단율/진화 적용율 집계 (읽기 전용)')
  .option('--trend', 'receipt-log 시계열 추세(거짓완료 판정 추이)')
  .action(async (opts: { trend?: boolean }) => { await stats({ trend: opts.trend }) })

program
  .command('loop')
  .alias('틱')
  .description('자가진화 조율 1틱 — 닫힌 것/다음 한 수 (읽기 전용, 집행 0)')
  .option('--tick', '명시적 1틱 — vhk loop 기본 동작과 동일(문서화된 no-op 별칭)')
  .action(async () => { await loopTick() })

program
  .command('mcp')
  // #342 #343: 도구 수를 하드코딩하지 않고 실 등록 수(런타임 SoT)에서 도출 — 드리프트 0.
  .description(`MCP 서버 시작 (${getMcpToolCount()} tool stdio — Cursor·Claude Desktop 등)`)
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
  .command('inject-bootstrap')
  .alias('생태계규칙')
  .option('--yes', '확인 없이 실행')
  .option('--force', '기존 harness 파일 덮어쓰기')
  .description('tier S harness bootstrap (ecosystem · CORE-RULES · context · mcp.example)')
  .action(async (opts: { yes?: boolean; force?: boolean }) => {
    await injectBootstrapCommand(opts)
  })

program
  .command('deploy')
  .alias('배포')
  .option('--yes', '확인 없이 실행 (위험 작업 명시 승인)')
  .description('프로덕션 배포 (Vercel/Netlify/Cloudflare 자동 감지)')
  .action(async (opts: { yes?: boolean }) => { await guardCli('deploy', opts?.yes === true, () => deploy()) })

program
  .command('env')
  .alias('환경변수')
  .option('--yes', '확인 없이 실행 (위험 작업 명시 승인)')
  .description('.env → .env.example 동기화 + .gitignore 자동 추가')
  .action(async (opts: { yes?: boolean }) => { await guardCli('env-write', opts?.yes === true, () => env(), '.env') })

program
  .command('env-check')
  .alias('환경변수점검')
  .description('필수 환경변수 누락 검사')
  .action(async () => { await envCheck() })

program
  .command('publish')
  .alias('출시')
  .option('--yes', '확인 없이 실행 (위험 작업 명시 승인)')
  .description('npm 배포 (버전 범프 → 빌드 → 테스트 → publish)')
  .action(async (opts: { yes?: boolean }) => { await guardCli('publish', opts?.yes === true, () => publish()) })

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
  .option('-y, --yes', '기존 파일 덮어쓰기 확인 스킵 (비대화형 자동 덮어쓰기)')
  .description('다크/라이트 모드 CSS + 토글 유틸리티 생성')
  .action(async (opts: { yes?: boolean }) => { await theme(opts) })

const refCmd = program
  .command('ref')
  .alias('레퍼런스')
  .description('레퍼런스 URL 관리 (add / list / open)')
  .action(async () => { await refList() })

refCmd
  .command('add <url>')
  .option('--memo <memo>', '메모 추가')
  .option('--title <title>', '메모 별칭 (--memo 와 동일) — #151')
  .description('레퍼런스 URL 추가')
  .action(async (url: string, opts: { memo?: string; title?: string }) => {
    await refAdd(url, opts.memo ?? opts.title)
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
  .option('--yes', '확인 없이 실행 (위험 작업 명시 승인)')
  .description('패키지 매니저 전환 (npm/yarn/pnpm) — 패키지매니저만 바꿈, 설정 마이그레이션 아님')
  .action(async (target: string | undefined, opts: { yes?: boolean }) => { await guardCli('migrate', opts?.yes === true, () => migrate(target)) })

program
  .command('update')
  .alias('업데이트')
  .description('VHK CLI 최신 버전 업데이트')
  .action(async () => { await update() })

program
  .command('context')
  .alias('맥락')
  .option('--compact', '토큰 절감형 — 전체 명령 목록/깊은 트리 생략, 참조 링크 중심')
  .description('프로젝트 맥락 파일 생성 (.vhk/context.md)')
  .action(async (opts: { compact?: boolean }) => { await context({ compact: opts.compact }) })

program
  .command('mode [target]')
  .alias('모드')
  .description('Safety Mode 조회/변경 (lite|standard|strict) — 위험 작업 가드 강도')
  .action(async (target?: string) => { await mode(target) })

// Goal 56: 비용·예산 가드(자문형). vhk 는 API 비용을 자동 추적 못 하므로 사용량은 외부 입력.
program
  .command('cost [action] [value]')
  .alias('비용')
  .option('--usd <n>', '비용($) 직접 입력 (add)', parseFloat)
  .option('--in <n>', '입력 토큰 수 (add — config pricing 으로 환산)', (v) => parseInt(v, 10))
  .option('--out <n>', '출력 토큰 수 (add)', (v) => parseInt(v, 10))
  .option('--model <name>', '모델명 (add — config pricing 키)')
  .option('--yes', '비대화형/예산 초과 시 명시 승인 (check)')
  .description('비용·예산 가드 — add(사용량 기록)/check(임계 집행)/budget(예산 설정) · 자문형')
  .action(
    async (
      action?: string,
      value?: string,
      opts?: { usd?: number; in?: number; out?: number; model?: string; yes?: boolean }
    ) => {
      await cost(action, value, {
        usd: opts?.usd,
        in: opts?.in,
        out: opts?.out,
        model: opts?.model,
        yes: opts?.yes,
      })
    }
  )

program
  .command('verify')
  .alias('사전점검')
  .option('--json', '리포트 JSON 을 stdout 으로 출력 (CI용 — 경로 대신)')
  .option('--report', 'latest.json 을 사람용 정적 HTML(.vhk/reports/latest.html) 로 렌더 (외부 의존 0)')
  .option('--open', '리포트 생성 후 기본 브라우저로 열기 (비대화형/CI/MCP 자동 스킵)')
  .option('--check-fresh', '기존 증거(latest.json)가 현재 HEAD 와 일치하는지 검사 — 낡으면 exit 1 (증거 안 만듦)')
  .description('검증 게이트(tsc/test/build/secure) 실제 실행 + 증거 기록 (.vhk/reports/latest.json)')
  .action(async (opts: { json?: boolean; report?: boolean; open?: boolean; checkFresh?: boolean }) => { await verify(opts) })

program
  .command('preflight')
  .alias('출고점검')
  .option('--publish', 'publish 직전 점검 (2FA·버전 강조)')
  .option('--pr', 'PR 직전 점검 (lint·테스트·브랜치 강조)')
  .option('--full', '테스트 전체 실행 (--changed 캐시 미사용)')
  .description('출고 전 안전점검 — 2FA·shim·env·lint·타입·테스트·git 8개 항목, 치명 실패 시 차단')
  .action(async (opts: { publish?: boolean; pr?: boolean; full?: boolean }) => { await preflight(opts) })

program
  .command('testmap')
  .alias('테스트매핑')
  .description('test-first 매핑 점검 — 변경 기능 소스에 대응 테스트 누락 경고 (VHK_TEST_FIRST=1 시 exit 1)')
  .action(async () => { await testmap() })

const worktreeCmd = program
  .command('worktree')
  .alias('워크트리')
  .description('worktree 가드 — 생성 시 필수 env/설정 자동 복사·누락 점검 (add / check)')
  .action(async () => { await worktreeCheck() })

worktreeCmd
  .command('check')
  .alias('점검')
  .description('현재 worktree 의 필수 env 키 누락 점검 (개수만, 값 미노출)')
  .action(async () => { await worktreeCheck() })

worktreeCmd
  .command('add <branch>')
  .alias('추가')
  .option('--install', 'worktree 생성 후 pnpm install 자동 실행')
  .description('worktree 생성 + 필수 env/설정 자동 복사 (파일 복사·심볼릭 X, 비밀값 미노출)')
  .action(async (branch: string, opts: { install?: boolean }) => { await worktreeAdd(branch, opts) })

program
  .command('standup')
  .alias('아침')
  .description('아침 브리핑 — 어제 한 일(마지막 활동일 커밋·완료 goal) + 오늘 추천 + 미해결 (읽기 전용)')
  .option('--if-stale', '오늘 아직 안 본 경우에만 브리핑 (터미널 자동실행 앵커용)')
  .option('--install-anchor', '터미널 자동실행 앵커(셸 rc 에 붙여넣을 줄) 안내 출력')
  .action(async (opts: { ifStale?: boolean; installAnchor?: boolean }) => { await standup(opts) })

program
  .command('today')
  .alias('자축')
  .description('저녁 자축·회고 — 오늘 커밋·완료 goal 카운트 + 격려 (읽기 전용)')
  .action(async () => { await today() })

program
  .command('review')
  .alias('검토')
  .option('--id <id>', '대상 goal id (없으면 active goal)')
  .option('--strict', '엄격 모드 — 미검증/커버리지 부족도 실패 (기본 advisory: 강한 모순만 실패) (#157)')
  .description('적대적 자기검증 — latest.json ↔ goal 완료조건 교차검증 (거짓완료 의심 탐지, 보장 아님)')
  .action(async (opts: { id?: string; strict?: boolean }) => { await review(opts) })

program
  .command('receipt')
  .alias('증거영수증')
  .option('--json', '영수증 JSON 을 stdout 으로 출력 (CI/기계용 — block 이면 exit 1)')
  .option('--mark-start', '현재 HEAD 를 작업시작 기준선으로 기록 (이후 stale 비교 기준)')
  .option('--since <sha>', 'stale 비교 기준 SHA 를 명시 (.base-sha 무시)')
  .description('증거 영수증 — 4대 기계증거(종료코드·dirty·stale·diff-cover)로 거짓완료 판정 (.vhk/receipts/)')
  .action(async (opts: { json?: boolean; markStart?: boolean; since?: string }) => { await receipt(opts) })

// prev 기본 [] — default 미지정이라 옵션 미제공 시 opts 에 키 자체가 없음(undefined = 보존 신호).
const collectGlob = (v: string, prev: string[] = []): string[] => prev.concat([v])
const missionCmd = program
  .command('mission')
  .alias('미션')
  .description('미션 계약 — 작업 목표·허용/금지 범위 선언·검증 (scope 가드, .vhk/mission.json)')
  .action(async () => { await missionShow() })

missionCmd
  .command('set')
  .option('--objective <text>', '미션 목표(objective)')
  // default 미지정 — 옵션 안 주면 opts.scope/forbidden 이 undefined → 기존 값 보존(빈 배열로 안 덮음).
  .option('--scope <glob>', '허용 경로 glob (반복 가능, 제공 시 교체)', collectGlob)
  .option('--forbidden <glob>', '금지 경로 glob (반복 가능, 제공 시 교체)', collectGlob)
  .option('--clear-scope', 'scope 를 비움(명시적)')
  .option('--clear-forbidden', 'forbidden 을 비움(명시적)')
  .option('-y, --yes', '대화형 프롬프트 스킵 (비대화형)')
  .description('미션 계약 선언/갱신 (옵션 미지정 시 기존 scope/forbidden 보존)')
  .action(async (opts: { objective?: string; scope?: string[]; forbidden?: string[]; clearScope?: boolean; clearForbidden?: boolean; yes?: boolean }) => { await missionSet(opts) })

// #327: bare `vhk mission` 의 default action(missionShow)을 명시 서브커맨드로도 노출.
//        미등록 시 'show' 가 mission(0-arity)의 위치인자로 처리돼 cryptic 'too many arguments' 에러.
missionCmd
  .command('show')
  .description('현재 미션 계약 출력 (bare `vhk mission` 과 동일)')
  .action(async () => { await missionShow() })

missionCmd
  .command('check')
  .description('변경 파일이 계약(scope/forbidden) 안인지 검증 — forbidden 위반 시 exit 1')
  .action(async () => { await missionCheck() })

missionCmd
  .command('clear')
  .description('미션 계약 삭제 (.vhk/mission.json)')
  .action(async () => { await missionClear() })

program
  .command('context-show')
  .alias('맥락보기')
  .description('현재 컨텍스트 파일 내용 출력')
  .action(async () => { await contextShow() })

const memoryCmd = program
  .command('memory')
  .alias('기억')
  .description('기억 관리 v2 (decisions/failures/successes 4버킷) — add/list/remove/archive/resolve/unarchive/migrate')
  .action(async () => { await memoryList() })

memoryCmd
  .command('add [content]')
  // #148: 대시(--)로 시작하는 본문은 positional 로 못 넘긴다(commander 가 옵션으로 파싱) →
  //       `--content=<본문>` 폴백 제공. 예: vhk memory add --content=--on-accent ... --type decision
  .option('--content <text>', '본문 (대시 시작 등 positional 불가 시) — 예: --content=--on-accent ...')
  .option('--type <type>', '버킷: decision|failure|success (기본 decision)')
  .option('--tags <tags>', '태그 (쉼표 구분)')
  .option('--why <why>', '원인 (failure/success)')
  .option('--lesson <lesson>', '교훈 (failure)')
  .description('기억 저장 (--type 으로 결정/실패/성공 구분)')
  .action(async (content: string | undefined, opts: { content?: string; type?: string; tags?: string; why?: string; lesson?: string }) => {
    const body = content ?? opts.content ?? ''
    const tags = opts.tags ? opts.tags.split(',').map((s) => s.trim()) : undefined
    // 잘못된 --type 은 강등하지 않고 그대로 넘긴다 — memoryAdd 가 검증·거부(입력 유실 방지).
    // 빈 본문(positional·--content 둘 다 없음)도 memoryAdd 가 안내+exit 1 처리.
    await memoryAdd(body, { type: opts.type, tags, why: opts.why, lesson: opts.lesson })
  })

memoryCmd
  .command('list')
  .alias('목록')
  .option('--type <type>', '버킷 필터: decision|failure|success')
  .option('--all', '보관(archived)·해결(resolved) 포함')
  .description('저장된 기억 목록 (기본 활성만)')
  .action(async (opts: { type?: string; all?: boolean }) => {
    const type = (opts.type === 'decision' || opts.type === 'failure' || opts.type === 'success' ? opts.type : undefined)
    await memoryList({ type, all: opts.all })
  })

memoryCmd
  .command('remove <index>')
  .alias('삭제')
  .description('기억 삭제 (1부터 시작하는 번호)')
  .action(async (index: string) => { await memoryRemove(index) })

memoryCmd
  .command('archive <index>')
  .alias('보관')
  .description('기억 보관 (활성→archived, 패턴/진화에서 제외)')
  .action(async (index: string) => { await memoryArchive(index) })

memoryCmd
  .command('resolve <index>')
  .alias('해결')
  .description('기억 해결 표시 (활성→resolved, 패턴/진화에서 제외)')
  .action(async (index: string) => { await memoryResolve(index) })

memoryCmd
  .command('unarchive <index>')
  .alias('복구')
  .description('보관/해결 항목을 다시 활성으로 복구 (archive/resolve 역전)')
  .action(async (index: string) => { await memoryUnarchive(index) })

memoryCmd
  .command('migrate')
  .alias('마이그레이션')
  .description('memory.json v1 → v2 마이그레이션 (기존 v1 있으면 .v1.bak 원본 백업, 멱등)')
  .action(async () => { await memoryMigrate() })

memoryCmd
  .command('eval')
  .alias('검증')
  .option('--init', '사용 로그의 실쿼리로 대화형 라벨링 → 평가셋 생성')
  .description('recall 회상 품질 측정 (Recall@5/MRR + Kill-gate 판정, RFC 0049)')
  .action(async (opts: { init?: boolean }) => { await memoryEval({ init: opts.init }) })

program
  .command('recall [query...]')
  .alias('회상')
  .description('기억 회상 — 자연어로 관련 결정·실패·교훈 검색 (키워드, RFC 0049)')
  .action(async (query: string[]) => { await memoryRecall((query ?? []).join(' ')) })

program
  .command('brief')
  .alias('브리핑')
  .description('프로젝트 상태 요약 보고서 생성 (.vhk/brief.md)')
  .action(async () => { await brief() })

program
  .command('loop-brief')
  .alias('루프브리핑')
  .description('루프 1틱 앵커 생성 (.vhk/loop-brief.md) — 의도+goal1+교훈+STOP')
  .action(() => { loopBrief() })

program
  .command('remind')
  .alias('리마인드')
  .description('치명 규칙 재주입 (.vhk/remind.md) — RULES.md NON-NEGOTIABLE/Forbidden 압축')
  .action(() => { remind() })

program
  .command('content')
  .alias('콘텐츠')
  .description('콘텐츠 초안 프롬프트 생성 (.vhk/content-prompt.md) — 풀사이클 뒷단(콘텐츠/마케팅), 초안만')
  .action(() => { content() })

program
  .command('launch')
  .alias('런칭')
  .description('런칭 게시물 프롬프트 생성 (.vhk/launch-prompt.md) — 풀사이클 뒷단(런칭), 초안만(게시·발송 0)')
  .action(() => { launch() })

program
  .command('ops')
  .alias('운영')
  .description('운영 회고 프롬프트 생성 (.vhk/ops-prompt.md) — 풀사이클 뒷단(운영), 초안만(중단·삭제 0)')
  .action(() => { ops() })

program
  .command('sell')
  .alias('판매')
  .description('판매 카피 프롬프트 생성 (.vhk/sell-prompt.md) — 풀사이클 뒷단(판매), 초안만(결제·과금 0)')
  .action(() => { sell() })

// AI 작업 세션 이어받기/인수인계 — 상태 수집 + Claude 에게 줄 프롬프트를 클립보드에 복사.
const workCmd = program
  .command('work')
  .alias('작업')
  .description('AI 작업 시작/이어하기 — 시작 프롬프트 생성 후 클립보드 복사')
  .action(async () => { await work() })

workCmd
  .command('handoff')
  .alias('인수인계')
  .description('작업 중단 정리 — 인수인계 프롬프트 생성 후 클립보드 복사')
  .action(async () => { await workHandoff() })

// 사용자 규칙 파일을 프로세스 재시작 없이 선택하는 홈 설정.
const configCmd = program
  .command('config')
  .alias('설정')
  .description('vhk 사용자 설정 (set-rules-file)')
  .action(() => { configCmd.help() })

configCmd
  .command('set-rules-file <path>')
  .alias('규칙파일')
  .description('사용자 규칙 YAML 파일을 ~/.vhk/config.json에 저장')
  .action(async (path: string) => { await configSetRulesFile(path) })

configCmd
  .command('set-brain-root <path>')
  .description('[deprecated: v3.0 제거] 기존 brain root 저장 — set-rules-file 사용 권장')
  .action(async (path: string) => { await configSetBrainRoot(path) })

const goalCmd = program
  .command('goal')
  .alias('목표')
  .description('Goal 단계별 미션 관리 (init / list / next / peek / check / done / sync / drift)')
  .action(async () => { await goalList() })

goalCmd
  .command('list')
  .alias('목록')
  .description('goals/*.md 목록 (id, status, priority, title)')
  .action(async () => { await goalList() })

goalCmd
  .command('next')
  .alias('다음')
  .description('active goal 자동 선택 → docs/state/next-task.md 갱신 (덮어쓰기 전 자동 백업)')
  .action(async () => { await goalNext() })

goalCmd
  .command('peek')
  .alias('미리보기')
  .description('active goal 조회만 — next-task.md 미변경 (읽기 전용)')
  .action(async () => { await goalPeek() })

goalCmd
  .command('init')
  .alias('초기화')
  .description('현재 프로젝트에 goals/ + docs/state/ 스캐폴딩 (기존 파일 보존)')
  .action(async () => { await goalInit() })

goalCmd
  .command('check')
  .alias('검증')
  .option('--id <id>', 'goal id 지정 (생략 시 active goal)')
  .option('--force', 'DONE goal 도 게이트 재실행 (#155 — 기본은 DONE 스킵)')
  .description('scripts/check-goal-<id>.{mjs,sh} 실행 + exit code 전달 (.mjs 우선)')
  .action(async (opts: { id?: string; force?: boolean }) => { await goalCheck(opts) })

goalCmd
  .command('done')
  .alias('완료')
  .option('--id <id>', 'goal id 지정 (생략 시 active goal)')
  .description('게이트 재검증 → 통과 시 frontmatter status=DONE 으로 전이')
  .action(async (opts: { id?: string }) => { await goalDone(opts) })

goalCmd
  .command('sync')
  .alias('동기화')
  .description('goals/*.md 스캔 → 누락된 check-goal-<id>.mjs 게이트 스크립트 백필 (idempotent)')
  .action(async () => { await goalSync() })

goalCmd
  .command('drift')
  .alias('드리프트')
  .description('goal 상태↔코드 드리프트 점검 — 구현됐는데 NOT_STARTED 인 goal 탐지 (read-only, 발견 시 exit 1)')
  .action(async () => { await goalDrift() })

goalCmd
  .command('migrate')
  .alias('마이그레이트')
  .option('--dry-run', '변경 미리보기만 (파일 미수정)')
  .description('goal frontmatter 표준화 — type:goal · legacy status 정규화 (idempotent)')
  .action(async (opts: { dryRun?: boolean }) => { await goalMigrate(opts) })

program
  // #147: variadic — 따옴표 없는 다단어 본문도 받는다 (vhk blocker sync 중단 증상). join 으로 원문 복원.
  .command('blocker <description...>')
  .alias('블로커')
  .option('--dry-run', '미리보기만 — blockers.md/HARD_STOP 변경 없음 (#159)')
  .description('블로커 기록 → docs/state/blockers.md append (3건 누적 시 HARD_STOP 자동 생성). [dogfood] 태그는 임계값 제외.')
  .action(async (description: string[], opts: { dryRun?: boolean }) => { await blocker(description.join(' '), { dryRun: opts?.dryRun }) })

program
  // #147: variadic — 따옴표 없는 다단어 교훈도 받는다 (vhk learn dogfood lesson without sync keyword).
  .command('learn <lesson...>')
  .alias('교훈')
  .description('교훈 기록 → memory v2 failures.lesson 단일 SoT (v2.0 통합 — vhk memory list 로 확인)')
  .action(async (lesson: string[]) => { await learn(lesson.join(' ')) })

program
  // N3: variadic — 따옴표 없는 다단어 성공기록도 받는다 (learn 과 대칭).
  .command('win <content...>')
  .alias('성공')
  .description('성공 기록 → memory successes (learn 의 성공 쌍둥이 — reinforce evolve 입력)')
  .action(async (content: string[]) => { await win(content.join(' ')) })

program
  // 이슈 #373: vhk-auto SKILL.md 루프 전용 — 자율성완주율(런 시작 대비 사람개입 없는 종결) 계측.
  .command('autonomy-log')
  .alias('자율기록')
  .option('--event <event>', 'start|complete|hardstop|blocked')
  .option('--goal <n>', 'goal id 지정 (생략 시 active goal 자동감지)')
  .option('--run-id <id>', '종결 이벤트(complete/hardstop/blocked)에 필요 — start 가 발급한 runId')
  .option('--ticks <n>', '이 런의 루프 tick 수')
  .option('--interventions <n>', '이 런의 사람 개입 횟수')
  .option('--review-rejected', 'hardstop 이 적대리뷰(critic) 거부로 인한 것인지')
  .description('자율 루프 런(run) 시작/종결 기록 → .vhk/events/autonomy-run.jsonl (완주율 계측, #373)')
  .action(
    async (opts: {
      event?: string
      goal?: string
      runId?: string
      ticks?: string
      interventions?: string
      reviewRejected?: boolean
    }) => {
      const KNOWN_EVENTS = new Set(['start', 'complete', 'hardstop', 'blocked'])
      if (!opts.event || !KNOWN_EVENTS.has(opts.event)) {
        console.error(`❌ --event 는 start|complete|hardstop|blocked 중 하나여야 합니다 (입력값: ${opts.event ?? '(없음)'})`)
        process.exitCode = 1
        return
      }
      // #317 과 동일 가드: 'abc'→NaN, ' 1'(공백패딩)→조용히 1 로 오염되는 입력을 Number() 전에 차단.
      const goalParsed = parseAutonomyIntArg(opts.goal)
      const ticksParsed = parseAutonomyIntArg(opts.ticks)
      const interventionsParsed = parseAutonomyIntArg(opts.interventions)
      if (
        goalParsed === INVALID_AUTONOMY_ARG ||
        ticksParsed === INVALID_AUTONOMY_ARG ||
        interventionsParsed === INVALID_AUTONOMY_ARG
      ) {
        console.error(
          `❌ --goal/--ticks/--interventions 는 숫자만 허용합니다 (goal=${opts.goal ?? ''} ticks=${opts.ticks ?? ''} interventions=${opts.interventions ?? ''})`
        )
        process.exitCode = 1
        return
      }
      await autonomyLog({
        event: opts.event as 'start' | 'complete' | 'hardstop' | 'blocked',
        goal: goalParsed,
        runId: opts.runId,
        ticks: ticksParsed,
        interventions: interventionsParsed,
        reviewRejected: opts.reviewRejected,
      })
    }
  )

program
  // 트랙 A(신뢰): 2026-07-01 밤샘루프 무감지 사건 재발 방지 — 경량 폴러(에이전트 아님).
  .command('watch')
  .alias('감시')
  .description('무인 세션 정지 감시 — 세션 로그 idle 초과 시 텔레그램·콘솔 알림 (수준 2)')
  .option('--idle-min <min>', 'idle 판정 기준 분 (기본 15)')
  .option('--interval <sec>', '폴링 주기 초 (기본 60)')
  .option('--window <min>', '감시 편입 활성 윈도우 분 (기본 30)')
  .option('--once', '1회 점검 후 종료 (상태 확인용)')
  .action(async (opts: { idleMin?: string; interval?: string; window?: string; once?: boolean }) => {
    await watch(opts)
  })

program
  .command('resume')
  .alias('재개')
  .option('--confirm', '사람 확인 — 자동 호출 금지 (Forbidden 위반)')
  .description('.vhk/HARD_STOP 해제 (사용자가 사유 확인 후 --confirm 필요)')
  .action(async (opts: { confirm?: boolean }) => { await guardCliDefer('resume', opts?.confirm === true, () => resume(opts)) })

const patternCmd = program
  .command('pattern')
  .alias('패턴')
  .description('반복 패턴 감지·목록·dismiss (avoid/reinforce 후보) — Goal 19')
  .action(async () => { await patternList() })

patternCmd
  .command('detect')
  .alias('감지')
  .option('--min <n>', '임계 횟수 (기본 3)', '3')
  .option('--json', 'JSON 출력 (CI/MCP용)')
  .description('active failures+successes 2축 분석 → patterns[] 갱신')
  .action(async (opts: { min?: string; json?: boolean }) => { await patternDetect(opts) })

patternCmd
  .command('list')
  .alias('목록')
  .option('--kind <kind>', 'avoid|reinforce 필터')
  .option('--all', '보관(archived) 포함')
  .option('--json', 'JSON 출력 (CI/MCP용)')
  .description('패턴 후보 목록 (기본 활성)')
  .action(async (opts: { kind?: string; all?: boolean; json?: boolean }) => { await patternList(opts) })

patternCmd
  .command('dismiss <id>')
  .alias('보관')
  .description('오탐 패턴 dismiss (→archived, 재제안 안 됨)')
  .action(async (id: string) => { await patternDismiss(id) })

const evolveCmd = program
  .command('evolve')
  .alias('진화')
  .description('패턴 → 룰 후보 제안·반영·undo (Evolution Loop 도미노 4) — apply/undo는 TTY 필수')
  .action(async () => { await evolveList() })

evolveCmd
  .command('suggest')
  .alias('제안')
  .option('--json', 'JSON 출력 (CI/MCP용)')
  .description('active avoid 패턴 → 룰 초안 후보 생성·큐 적재')
  .action(async (opts: { json?: boolean }) => { await evolveSuggest(opts) })

evolveCmd
  .command('negatives')
  .alias('부정예시')
  .description('실패 패턴 → RULES.md ❌ 예시 후보 (.vhk/negative-candidates.md) — 자동 편집 0, 후보 제안만')
  .action(() => { evolveNegatives() })

evolveCmd
  .command('seed')
  .alias('씨앗')
  .option('--write', 'memory.patterns 에 실제 병합(기본은 dry-run 미리보기만)')
  .option('--json', 'JSON 출력 (CI/MCP용)')
  .description('cold-start 역채굴 — PAT·failures·TS → memory.patterns 채굴(.vhk/seed-candidates.md 미리보기, --write 로 실제 반영)')
  .action(async (opts: { write?: boolean; json?: boolean }) => { await evolveSeed(opts) })

evolveCmd
  .command('list')
  .alias('목록')
  .option('--status <status>', 'pending|rejected|applied 필터')
  .option('--json', 'JSON 출력 (CI/MCP용)')
  .description('진화 후보 목록')
  .action(async (opts: { status?: string; json?: boolean }) => { await evolveList(opts) })

evolveCmd
  .command('digest')
  .alias('묶음')
  .description('진화 후보 묶음 초안 — 신뢰도별 정렬 (읽기 전용·자동 반영 0, PR 초안용)')
  .action(async () => { await evolveDigest() })

evolveCmd
  .command('apply <id>')
  .alias('반영')
  .description('후보 TTY 확인 → RULES.md append → sync 재생성 (대화형 필수)')
  .action(async (id: string) => { await evolveApply(id) })

evolveCmd
  .command('reject <id> [reason]')
  .alias('기각')
  .description('후보 기각 (재제안 억제) — [reason] 선택: 기각 사유 기록(#374 효과측정)')
  .action(async (id: string, reason: string | undefined) => { await evolveReject(id, reason) })

evolveCmd
  .command('undo')
  .alias('되돌리기')
  .description('최근 apply 1건 되돌리기(.bak 복원 + sync — 대화형 필수)')
  .action(async () => { await evolveUndo() })

const seoCmd = program
  .command('seo')
  .description('SEO·수익 대시보드 — init: 사이트 등록 + 자격증명 보관 (submit/check/report 후속 goal)')
  .action(async () => { runSeo() })

seoCmd
  .command('init')
  .option('--domain <domain>', '관리할 사이트 도메인 (비대화형 필수)')
  .option('--yes', '비대화형 — 프롬프트 없이 진행 (MCP/CI 안전)')
  .description('사이트 등록(.vhk/seo/config.json) + 5개 서비스 자격증명 참조 보관 (값은 .env)')
  .action(async (opts: { domain?: string; yes?: boolean }) => { await seoInit(opts) })

seoCmd
  .command('submit')
  .option('--yes', '비대화형')
  .description('사이트맵(GSC·Bing) 제출 + IndexNow 핑 (구글 Indexing API 미사용)')
  .action(async (opts: { yes?: boolean }) => { await seoSubmit(opts) })

seoCmd
  .command('check')
  .option('--yes', '비대화형')
  .description('색인·트래픽(GSC+GA4) + 수익·빙(AdSense v2+Bing) 수집 → latest.json')
  .action(async (opts: { yes?: boolean }) => { await seoCheck(opts) })

seoCmd
  .command('report')
  .option('--open', '생성 후 기본 브라우저로 열기 (비대화형 자동 스킵)')
  .option('--yes', '비대화형')
  .description('latest.json → 무빌드 오프라인 HTML 대시보드(4블록)')
  .action(async (opts: { open?: boolean; yes?: boolean }) => { await seoReport(opts) })

seoCmd
  .command('automate')
  .option('--yes', '비대화형')
  .description('report 결과 Notion 적재 + 스케줄러 도우미 + 확장 슬롯')
  .action(async (opts: { yes?: boolean }) => { await seoAutomate(opts) })

program.on('command:*', (operands: string[]) => {
  const unknown = operands[0] ?? ''
  const rest = operands.slice(1)
  const input = [unknown, ...rest].join(' ').trim()
  // EventEmitter 핸들러는 반환 Promise 를 무시 → reject 시 unhandled. void+catch 로 명시 처리.
  void runNaturalLanguageRoute(input).catch((err) => {
    console.error(chalk.red(`\n  ❌ ${err instanceof Error ? err.message : String(err)}\n`))
    process.exitCode = 1
  })
})

program.action(async () => {
  // #333: 인자 없는 `vhk` 의 기본 액션은 대화형 inquirer 메뉴다. 비-TTY(파이프/CI/headless)에선
  //       메뉴를 띄울 수 없으므로(ANSI 잔상·EOF 크래시) --help 로 폴백한다. 다른 대화형 명령이
  //       쓰는 isInteractive() 와 동일 축(stdin.isTTY + VHK_FORCE_INTERACTIVE 탈출구)으로 판정.
  //       help 는 정상 안내라 exit 0(미인식 실패 아님).
  if (!isInteractive()) {
    program.outputHelp()
    return
  }
  // 헤더: 현재 버전(즉시·네트워크 0) + 업데이트 알림(캐시 기반 "가끔 자동 확인") + 직접입력 안내.
  const info = getUpdateInfo()
  // 메뉴 헤더는 브랜드 태그라인(짧은 별칭) — npm 제품 설명(package.json.description, --help 노출)과
  // 의도적으로 다른 층위다(Goal 81). 태그라인은 여기 단일 표기, 제품 설명은 getVhkDescription() 주입.
  console.log('\n🎯 VHK — 바이브코딩 프로젝트 코치  ' + chalk.dim(`v${info.current}`))
  if (info.updateAvailable && info.latest) {
    console.log(chalk.yellow(`🆕 업데이트 가능: v${info.latest}`) + chalk.dim('  →  vhk update'))
  }
  const sample = QUICK_ACTIONS[0]?.say ?? '상태 알려줘'
  console.log(
    chalk.dim('💬 명령 직접 입력도 돼요 — 예: ') + chalk.cyan('vhk status') +
    chalk.dim('  ·  자연어 OK: ') + chalk.cyan(`"${sample}"`)
  )
  console.log('')

  const choices = [
    { name: '🚀 작업 시작/이어하기 (work)', value: 'work' },
    { name: '💡 새 아이디어 검증하기', value: 'gate' },
    { name: '🆕 새 프로젝트 시작 마법사 (start)', value: 'start' },
    { name: '🎯 다음 목표 보기 (goal)', value: 'goal-next' },
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
    { name: '⏸️  작업 중단 정리 (handoff)', value: 'work-handoff' },
  ]

  const { choice } = await prompt<{ choice: string }>([{
    type: 'list',
    name: 'choice',
    message: '뭘 도와드릴까요?',
    pageSize: choices.length, // 스크롤 잔상/잘림 방지(Windows conhost): 한 화면에 전부
    loop: false,
    choices,
  }])

  switch (choice) {
    case 'work':
      return work()
    case 'work-handoff':
      return workHandoff()
    case 'goal-next':
      return goalNext()
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
      return guardCli('sync', false, () => sync())
    case 'doctor':
      return doctor()
    case 'ship':
      return ship()
    case 'save':
      return guardCli('save', false, () => save())
    case 'undo':
      return guardCliDefer('undo', false, () => undo())
    case 'status':
      return status()
    case 'diff':
      return diff()
  }
})

// 메인 모듈로 직접 실행될 때만 파싱한다(import 되면 program 만 노출).
// env 가 아니라 import.meta.url ↔ argv[1] 비교라, VITEST 환경을 물려받은 spawn 자식도 정상 실행.
const getRealPath = (p: string) => {
  try {
    return fs.realpathSync(p)
  } catch {
    return p
  }
}

const isMainModule =
  !!process.argv[1] &&
  getRealPath(fileURLToPath(import.meta.url)) === getRealPath(process.argv[1])

// #287: stdout/stderr 의 소비자(예: PowerShell `... | Select -First N`)가 출력을 다 읽기 전에
//       파이프를 닫으면 후속 write 가 EPIPE 를 던진다. 미처리 시 exit 255 로 죽고, 그 throw 가
//       부수효과(상태 write)보다 먼저 나면 상태 전이까지 누락된다(본 이슈). EPIPE 는 정상 종료(0)로
//       흡수한다 — 각 커맨드가 부수효과를 출력보다 먼저 수행하므로(goalDone 참조) 파이프가 끊겨도
//       디스크 상태는 안전하다.
const isEpipeError = (err: unknown): boolean =>
  err instanceof Error && (err as NodeJS.ErrnoException).code === 'EPIPE'

if (isMainModule) {
  // POSIX 는 파이프 write 가 비동기 → EPIPE 가 'error' 이벤트로 온다(여기서 흡수). Windows 는 동기 →
  // throw 되어 아래 try/catch 로 잡힌다. 양쪽 모두 0 종료. (isMainModule 안에서만 등록 = 테스트 격리.)
  const swallowEpipe = (stream: NodeJS.WriteStream): void => {
    stream.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EPIPE') process.exit(0)
      throw err
    })
  }
  swallowEpipe(process.stdout)
  swallowEpipe(process.stderr)
  // VHK-014: parseAsync 를 try/catch 로 감싸 unsettled top-level await 경고 제거 +
  // 비-TTY/EOF 프롬프트 크래시(ERR_USE_AFTER_CLOSE)를 friendly 종료로 처리.
  try {
    // 드리프트 3종(#314·#344·#345): 등록 명령에 잘못된 인자 조합 → raw 영어 에러/cross-misroute 대신
    // 한국어 친절 안내 + exit 1(미인식과 동일 실패 신호 — 조용한 성공 위장 차단).
    const usageMsg = detectInvalidCommandUsage(process.argv)
    if (usageMsg !== null) {
      console.error(chalk.yellow(`\n  ❓ ${usageMsg}\n`))
      process.exitCode = 1
    } else {
      const nlInput = detectNaturalLanguageInput(process.argv)
      if (nlInput !== null) {
        await runNaturalLanguageRoute(nlInput)
      } else {
        await program.parseAsync(process.argv)
      }
    }
  } catch (err) {
    if (isEpipeError(err)) {
      // #287: 동기 write(Windows 파이프)에서 throw 된 EPIPE. 여기서 console.error 재시도는 같은
      //       끊긴 파이프(2>&1)라 또 EPIPE → exit 255 의 원흉. 메시지 없이 정상 종료(0)한다.
      process.exit(0)
    }
    if (isPromptAbortError(err)) {
      // #153: 비-TTY 프롬프트 중단도 TTY_REQUIRED 전용 코드(2)로 — generic 실패와 구분.
      console.error(chalk.yellow('\n  ⚠️  TTY_REQUIRED — 대화형 입력이 취소/종료됐습니다 (비대화형 환경 불가).'))
      process.exitCode = TTY_REQUIRED_EXIT_CODE
    } else {
      console.error(chalk.red(`\n❌ ${err instanceof Error ? err.message : String(err)}`))
      process.exitCode = 1
    }
  }
}

export { program }
