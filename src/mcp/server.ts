import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { safeExecFile, NETWORK_EXEC_TIMEOUT_MS } from '../lib/exec.js'
import { parseEnvKeys } from '../commands/env.js'
import { detectPlatform } from '../commands/deploy.js'
import { bumpVersion } from '../commands/publish.js'
import { detectCurrentPM, parseAuditOutput, runAuditJson } from '../commands/audit.js'
import { readJsonFile } from '../lib/read-json.js'
import { filterSevereFindings, scanProjectForSecrets } from '../lib/scan-secrets.js'
import { getVhkVersion } from '../lib/version.js'

// package.json 의 version 을 런타임에 읽음 (lib/version 재사용) — drift 방지.
// dist/index.js 와 dist/mcp/index.js 둘 다 lib/version 의 candidate 경로로 해석됨.
const SERVER_VERSION = getVhkVersion()

function isGitRepo(): boolean {
  return safeExecFile('git', ['rev-parse', '--is-inside-work-tree']).ok
}

// ANSI escape sequence (color / cursor / formatting). MCP 클라이언트 일부가
// raw escape 를 그대로 노출해서 가독성 깨짐 → defensive strip.
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1B\[[0-9;?]*[ -/]*[@-~]/g

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '')
}

// vhk CLI 자체를 서브프로세스로 호출해서 결과를 MCP content로 변환.
// MCP 모드에서는 inquirer/ora 프롬프트가 동작하지 않으므로 비대화형 커맨드만 위임.
// chalk 가 색을 안 쓰도록 FORCE_COLOR=0 + NO_COLOR=1 강제 + 잔여 ANSI 는 regex strip.
function runVhkCli(
  args: string[],
  headline: string
): { content: [{ type: 'text'; text: string }] } {
  const result = safeExecFile('vhk', args, { env: { FORCE_COLOR: '0', NO_COLOR: '1' } })
  const body = stripAnsi(result.out || (result.ok ? '' : `(stdout 없음)\n${result.err}`))
  const prefix = result.ok ? `✅ ${headline}` : `❌ ${headline} 실패`
  return { content: [{ type: 'text', text: `${prefix}\n${body}`.trim() }] }
}

export function createVhkMcpServer(): McpServer {
  const server = new McpServer({
    name: 'vhk',
    version: SERVER_VERSION,
  })

  // ─── save ───────────────────────────────────────────────
  server.registerTool(
    'save',
    {
      description: '변경사항 저장 (git add → commit → push)',
      inputSchema: {
        message: z.string().optional().describe('커밋 메시지 (비우면 자동 생성)'),
      },
    },
    async ({ message }) => {
      if (!isGitRepo()) {
        return { content: [{ type: 'text', text: '❌ git 저장소가 아닙니다.' }] }
      }

      const status = safeExecFile('git', ['status', '--porcelain'])
      if (!status.ok) {
        return { content: [{ type: 'text', text: `❌ git status 실패: ${status.err}` }] }
      }
      if (!status.out) {
        return { content: [{ type: 'text', text: '📭 저장할 변경사항이 없습니다.' }] }
      }

      const files = status.out.split('\n')

      // MCP 모드는 inquirer 프롬프트가 동작하지 않으므로 CLI 의 확인 단계 없이
      // severe(critical/high) 시크릿이 발견되면 commit 자체를 거부한다.
      // 사용자가 CLI 에서 `vhk save` 를 실행해 명시적으로 진행 의사를 표현해야 함.
      const severe = filterSevereFindings(scanProjectForSecrets(process.cwd()).findings)
      if (severe.length > 0) {
        const preview = severe
          .slice(0, 5)
          .map((f) => `  ${f.file}:${f.line} — ${f.patternName}`)
          .join('\n')
        const more =
          severe.length > 5 ? `\n  ... 외 ${severe.length - 5}건` : ''
        return {
          content: [
            {
              type: 'text',
              text:
                `🛑 시크릿 의심 ${severe.length}건 발견 — MCP 모드에서는 commit 거부.\n` +
                `${preview}${more}\n\n` +
                `해결: 시크릿을 제거하거나 .gitignore 처리 후, 의식적으로 진행하려면 터미널에서 \`vhk save\` (CLI 확인 프롬프트 통과 후 진행 가능).`,
            },
          ],
        }
      }

      const now = new Date()
      const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      const commitMsg = message?.trim() || `✨ vhk save: ${ts}`

      const add = safeExecFile('git', ['add', '.'])
      if (!add.ok) {
        return { content: [{ type: 'text', text: `❌ git add 실패: ${add.err}` }] }
      }
      const commit = safeExecFile('git', ['commit', '-m', commitMsg])
      if (!commit.ok) {
        return { content: [{ type: 'text', text: `❌ commit 실패: ${commit.err}` }] }
      }

      const push = safeExecFile('git', ['push'])
      const pushResult = push.ok ? '+ 원격 업로드 완료' : '(원격 저장소 없거나 push 실패 → 스킵)'

      return {
        content: [
          {
            type: 'text',
            text: `✅ ${files.length}개 파일 저장 완료! ${pushResult}\n커밋: ${commitMsg}`,
          },
        ],
      }
    }
  )

  // ─── undo ───────────────────────────────────────────────
  server.registerTool('undo', { description: '최근 커밋 되돌리기 (soft reset, 변경사항은 유지)' }, async () => {
    if (!isGitRepo()) {
      return { content: [{ type: 'text', text: '❌ git 저장소가 아닙니다.' }] }
    }

    const last = safeExecFile('git', ['log', '--oneline', '-1'])
    if (!last.ok || !last.out) {
      return { content: [{ type: 'text', text: '📭 되돌릴 커밋이 없습니다.' }] }
    }

    const reset = safeExecFile('git', ['reset', '--soft', 'HEAD~1'])
    if (!reset.ok) {
      return { content: [{ type: 'text', text: `❌ reset 실패: ${reset.err}` }] }
    }

    return {
      content: [
        {
          type: 'text',
          text: `✅ 되돌리기 완료!\n취소된 커밋: ${last.out}\n💡 변경사항은 스테이징 영역에 남아있습니다.`,
        },
      ],
    }
  })

  // ─── status ─────────────────────────────────────────────
  server.registerTool('status', { description: '프로젝트 상태 대시보드 (브랜치/변경사항/최근 커밋)' }, async () => {
    const lines: string[] = []

    if (existsSync('package.json')) {
      try {
        const pkg = readJsonFile<{ name?: string; version?: string }>('package.json')
        lines.push(`📦 프로젝트: ${pkg.name ?? '(이름 없음)'} v${pkg.version ?? '?'}`)
      } catch {
        // skip
      }
    }

    if (!isGitRepo()) {
      lines.push('⚠️  git 저장소가 아닙니다')
      return { content: [{ type: 'text', text: lines.join('\n') }] }
    }

    const branch = safeExecFile('git', ['branch', '--show-current'])
    if (branch.ok) lines.push(`🌿 브랜치: ${branch.out || '(detached)'}`)

    const status = safeExecFile('git', ['status', '--porcelain'])
    if (status.ok) {
      if (!status.out) {
        lines.push('📝 변경사항: ✅ 깨끗함')
      } else {
        const fileLines = status.out.split('\n')
        const staged = fileLines.filter((l) => l[0] !== ' ' && l[0] !== '?').length
        const unstaged = fileLines.filter((l) => l[1] === 'M' || l[1] === 'D').length
        const untracked = fileLines.filter((l) => l.startsWith('??')).length
        const parts: string[] = []
        if (staged) parts.push(`스테이징 ${staged}개`)
        if (unstaged) parts.push(`수정 ${unstaged}개`)
        if (untracked) parts.push(`새파일 ${untracked}개`)
        lines.push(`📝 변경사항: ${parts.join(', ')}`)
      }
    }

    const log = safeExecFile('git', ['log', '--oneline', '-3'])
    if (log.ok && log.out) {
      lines.push('📜 최근 커밋:')
      log.out.split('\n').forEach((l) => lines.push(`   ${l}`))
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] }
  })

  // ─── diff ───────────────────────────────────────────────
  server.registerTool('diff', { description: '변경사항 확인 (staged/unstaged/새파일 + 총 변경 요약)' }, async () => {
    if (!isGitRepo()) {
      return { content: [{ type: 'text', text: '❌ git 저장소가 아닙니다.' }] }
    }

    const unstaged = safeExecFile('git', ['diff', '--stat'])
    const staged = safeExecFile('git', ['diff', '--cached', '--stat'])
    const untracked = safeExecFile('git', ['ls-files', '--others', '--exclude-standard'])

    const unstagedOut = unstaged.ok ? unstaged.out : ''
    const stagedOut = staged.ok ? staged.out : ''
    const untrackedOut = untracked.ok ? untracked.out : ''

    if (!unstagedOut && !stagedOut && !untrackedOut) {
      return { content: [{ type: 'text', text: '✅ 변경사항 없음! 깨끗합니다.' }] }
    }

    const lines: string[] = []
    if (stagedOut) {
      lines.push('📦 커밋 대기 (staged):')
      lines.push(stagedOut)
    }
    if (unstagedOut) {
      lines.push('✏️ 수정됨 (unstaged):')
      lines.push(unstagedOut)
    }
    if (untrackedOut) {
      const files = untrackedOut.split('\n')
      lines.push(`➕ 새 파일 (${files.length}개):`)
      files.forEach((f) => lines.push(`   + ${f}`))
    }

    const numstat = safeExecFile('git', ['diff', '--numstat', 'HEAD'])
    if (numstat.ok && numstat.out) {
      let totalAdd = 0
      let totalDel = 0
      let fileCount = 0
      numstat.out.split('\n').forEach((line) => {
        const [add, del] = line.split('\t')
        totalAdd += parseInt(add, 10) || 0
        totalDel += parseInt(del, 10) || 0
        fileCount += 1
      })
      lines.push(`\n📊 총 변경: ${fileCount}개 파일, +${totalAdd}줄 -${totalDel}줄`)
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] }
  })

  // ─── ship ───────────────────────────────────────────────
  // TODO(v0.6.1): execa로 비동기 전환 — ship 장시간 블로킹 방지
  server.registerTool('ship', { description: '배포 체크리스트 실행 (빌드 + 테스트 + 버전 + git 상태)' }, async () => {
    const checks: string[] = []

    const build = safeExecFile('pnpm', ['build'])
    checks.push(build.ok ? '✅ 빌드 성공' : '❌ 빌드 실패')

    const test = safeExecFile('pnpm', ['test', '--run'])
    checks.push(test.ok ? '✅ 테스트 통과' : '❌ 테스트 실패')

    if (existsSync('package.json')) {
      try {
        const pkg = readJsonFile<{ version?: string }>('package.json')
        checks.push(`📦 버전: ${pkg.version}`)
      } catch {
        // skip
      }
    }

    if (isGitRepo()) {
      const status = safeExecFile('git', ['status', '--porcelain'])
      if (status.ok) {
        if (status.out) {
          checks.push(`⚠️ 커밋되지 않은 변경사항 ${status.out.split('\n').length}개`)
        } else {
          checks.push('✅ 워킹 디렉토리 깨끗함')
        }
      }
    }

    return { content: [{ type: 'text', text: '🚀 배포 체크리스트\n' + checks.join('\n') }] }
  })

  // ─── doctor ─────────────────────────────────────────────
  server.registerTool('doctor', { description: '개발 환경 점검 (Node/Git/npm/pnpm/TypeScript)' }, async () => {
    const checks: string[] = []

    const node = safeExecFile('node', ['--version'])
    checks.push(node.ok ? `✅ Node.js: ${node.out}` : '❌ Node.js: 설치 안 됨')

    const git = safeExecFile('git', ['--version'])
    checks.push(git.ok ? `✅ Git: ${git.out}` : '❌ Git: 설치 안 됨')

    const pnpm = safeExecFile('pnpm', ['--version'])
    checks.push(pnpm.ok ? `✅ pnpm: v${pnpm.out}` : '⚠️ pnpm: 설치 안 됨')

    const npm = safeExecFile('npm', ['--version'])
    checks.push(npm.ok ? `✅ npm: v${npm.out}` : '❌ npm: 설치 안 됨')

    const tsc = safeExecFile('npx', ['tsc', '--version'])
    checks.push(tsc.ok ? `✅ TypeScript: ${tsc.out}` : '⚠️ TypeScript: 프로젝트에 없음')

    return { content: [{ type: 'text', text: '🩺 환경 점검 결과\n' + checks.join('\n') }] }
  })

  // ─── check ──────────────────────────────────────────────
  server.registerTool('check', { description: '프로젝트 구조 점검 (필수 파일 + VHK 하네스 파일)' }, async () => {
    const required = ['package.json', 'tsconfig.json', 'README.md', '.gitignore']
    const recommended = ['CLAUDE.md', '.cursorrules', 'docs/PRD.md', 'docs/ARCHITECTURE.md']

    const lines: string[] = ['🔍 프로젝트 점검', '', '필수:']
    required.forEach((f) => {
      lines.push(`  ${existsSync(f) ? '✅' : '❌'} ${f}`)
    })
    lines.push('', '권장 (VHK 하네스):')
    recommended.forEach((f) => {
      lines.push(`  ${existsSync(f) ? '✅' : '⚠️'} ${f}`)
    })

    return { content: [{ type: 'text', text: lines.join('\n') }] }
  })

  // ─── recap ──────────────────────────────────────────────
  server.registerTool(
    'recap',
    {
      description: '최근 작업 요약 (커밋 히스토리 기반, 날짜 포함)',
      inputSchema: {
        count: z.number().optional().describe('표시할 커밋 수 (기본: 10)'),
      },
    },
    async ({ count }) => {
      if (!isGitRepo()) {
        return { content: [{ type: 'text', text: '❌ git 저장소가 아닙니다.' }] }
      }
      const n = count && count > 0 ? Math.floor(count) : 10
      const log = safeExecFile('git', ['log', '--format=%h %ad %s', '--date=short', `-${n}`])
      if (!log.ok) {
        return { content: [{ type: 'text', text: `❌ git log 실패: ${log.err}` }] }
      }
      if (!log.out) {
        return { content: [{ type: 'text', text: '📭 커밋 히스토리가 없습니다.' }] }
      }
      return { content: [{ type: 'text', text: `📋 최근 작업 (${n}개):\n${log.out}` }] }
    }
  )

  // ─── env ────────────────────────────────────────────────
  server.registerTool(
    'env',
    {
      description: '.env → .env.example 동기화 + .gitignore에 .env 자동 추가',
    },
    async () => {
      if (!existsSync('.env')) {
        return { content: [{ type: 'text', text: '⚠️  .env 파일이 없습니다. 먼저 .env를 만들어주세요.' }] }
      }
      const keys = parseEnvKeys(readFileSync('.env', 'utf-8'))
      if (keys.length === 0) {
        return { content: [{ type: 'text', text: '📭 .env에 환경변수가 없습니다.' }] }
      }
      const exampleContent = keys.map((k) => `${k}=`).join('\n') + '\n'
      writeFileSync('.env.example', exampleContent, 'utf-8')

      // gitignore 보장
      const gitignoreLines: string[] = []
      if (existsSync('.gitignore')) {
        const content = readFileSync('.gitignore', 'utf-8')
        if (!content.split('\n').some((l) => l.trim() === '.env')) {
          appendFileSync('.gitignore', '\n.env\n')
          gitignoreLines.push('🔒 .gitignore에 .env 추가됨')
        }
      } else {
        writeFileSync('.gitignore', '.env\nnode_modules/\ndist/\n')
        gitignoreLines.push('🔒 .gitignore 생성 (.env 포함)')
      }

      const lines = [`✅ .env.example 생성 (${keys.length}개 키)`, ...keys.map((k) => `   ${k}`)]
      if (gitignoreLines.length) lines.push('', ...gitignoreLines)
      return { content: [{ type: 'text', text: lines.join('\n') }] }
    }
  )

  // ─── env-check ──────────────────────────────────────────
  server.registerTool(
    'env-check',
    {
      description: '필수 환경변수 누락 검사 (.env.example 기준)',
    },
    async () => {
      if (!existsSync('.env.example')) {
        return { content: [{ type: 'text', text: '⚠️  .env.example이 없습니다. 먼저 env 도구를 실행하세요.' }] }
      }
      const requiredKeys = parseEnvKeys(readFileSync('.env.example', 'utf-8'))
      const currentKeys = existsSync('.env')
        ? parseEnvKeys(readFileSync('.env', 'utf-8'))
        : []

      const missing = requiredKeys.filter((k) => !currentKeys.includes(k))
      const extra = currentKeys.filter((k) => !requiredKeys.includes(k))

      const lines: string[] = [`📋 필수 환경변수: ${requiredKeys.length}개`]
      if (missing.length === 0) {
        lines.push('✅ 모든 필수 환경변수가 설정되어 있습니다!')
      } else {
        lines.push(`❌ 누락된 환경변수 (${missing.length}개):`)
        missing.forEach((k) => lines.push(`   • ${k}`))
      }
      if (extra.length > 0) {
        lines.push(`💡 .env.example에 없는 추가 변수 (${extra.length}개):`)
        extra.forEach((k) => lines.push(`   • ${k}`))
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] }
    }
  )

  // ─── sync ───────────────────────────────────────────────
  server.registerTool(
    'sync',
    { description: 'RULES.md → .cursorrules + CLAUDE.md 자동 동기화' },
    async () => runVhkCli(['sync'], 'sync')
  )

  // ─── secure ─────────────────────────────────────────────
  server.registerTool(
    'secure',
    { description: '시크릿/환경변수 보안 스캔 (.env 노출 + 키 패턴 탐지)' },
    async () => runVhkCli(['secure'], 'secure')
  )

  // ─── audit ──────────────────────────────────────────────
  server.registerTool(
    'audit',
    {
      description:
        'npm/pnpm/yarn 보안 취약점 감사 — 요약만 (MCP 모드: 실제 fix 미수행, `vhk audit` 안내)',
    },
    async () => {
      // CLI `vhk audit` 는 critical/high 발견 시 inquirer prompt 로 fix 여부를 묻는다.
      // MCP 는 TTY 없어 prompt 가 영구 hang → CLI 위임 금지. 여기서 직접 audit JSON 만 호출.
      const pm = detectCurrentPM()
      const output = runAuditJson(pm)
      const summary = parseAuditOutput(output, pm)
      if (summary.total === 0) {
        return {
          content: [{ type: 'text', text: `🎉 ${pm}: 취약점 0건.` }],
        }
      }
      const breakdown = [
        summary.critical > 0 ? `🔴 critical ${summary.critical}` : null,
        summary.high > 0 ? `🟠 high ${summary.high}` : null,
        summary.moderate > 0 ? `🟡 moderate ${summary.moderate}` : null,
        summary.low > 0 ? `⚪ low ${summary.low}` : null,
      ]
        .filter(Boolean)
        .join('  ')
      return {
        content: [
          {
            type: 'text',
            text: `📦 PM: ${pm}\n📊 총 ${summary.total}건\n  ${breakdown}\n\n실제 fix 는 터미널에서: vhk audit (또는 ${pm} audit fix)`,
          },
        ],
      }
    }
  )

  // ─── harness ────────────────────────────────────────────
  server.registerTool(
    'harness',
    { description: 'lint + typecheck + test + build 통합 품질 점검' },
    async () => runVhkCli(['harness'], 'harness')
  )

  // ─── context ────────────────────────────────────────────
  server.registerTool(
    'context',
    { description: '프로젝트 맥락 파일(.vhk/context.md) 생성 — 기술 스택 + 디렉토리 + 명령어 + 결정사항' },
    async () => runVhkCli(['context'], 'context')
  )

  // ─── brief ──────────────────────────────────────────────
  server.registerTool(
    'brief',
    { description: '프로젝트 브리핑(.vhk/brief.md) 생성 — git 상태 + 결정사항 + 다음 단계 제안' },
    async () => runVhkCli(['brief'], 'brief')
  )

  // ─── deploy ─────────────────────────────────────────────
  // 실제 배포는 inquirer 프롬프트가 필수이므로 MCP 모드에서는 정보 조회만 제공.
  server.registerTool(
    'deploy',
    {
      description:
        '배포 플랫폼 자동 감지 + CLI 설치 확인 (MCP 모드: 실제 배포 미수행 — `vhk deploy` 안내)',
    },
    async () => {
      const platform = detectPlatform()
      if (!platform) {
        return {
          content: [
            {
              type: 'text',
              text: '❌ 배포 플랫폼 미감지 (vercel.json / netlify.toml / wrangler.toml 없음).\n플랫폼 설정 파일 추가 후 다시 시도.',
            },
          ],
        }
      }
      const cliCheck = safeExecFile(platform, ['--version'])
      const cliStatus = cliCheck.ok
        ? `✓ ${platform} CLI 설치됨 (${cliCheck.out})`
        : `✗ ${platform} CLI 미설치 — npm i -g ${platform}`
      return {
        content: [
          {
            type: 'text',
            text: `🚀 감지된 플랫폼: ${platform}\n${cliStatus}\n\n실제 배포는 터미널에서: vhk deploy`,
          },
        ],
      }
    }
  )

  // ─── publish ────────────────────────────────────────────
  // bump type + 최종 confirm 이 inquirer 필수 → MCP 는 dry-info 만 제공.
  server.registerTool(
    'publish',
    {
      description:
        '현재 버전 + bump 후보 표시 (MCP 모드: 실제 npm publish 미수행 — `vhk publish` 안내)',
    },
    async () => {
      if (!existsSync('package.json')) {
        return { content: [{ type: 'text', text: '❌ package.json 없음.' }] }
      }
      try {
        const pkg = readJsonFile<{ version?: string; name?: string }>('package.json')
        const v = pkg.version ?? '0.0.0'
        const lines = [
          `📦 ${pkg.name ?? '(이름 없음)'} 현재 v${v}`,
          `  patch → v${bumpVersion(v, 'patch')}`,
          `  minor → v${bumpVersion(v, 'minor')}`,
          `  major → v${bumpVersion(v, 'major')}`,
          '',
          '실제 배포는 터미널에서: vhk publish',
        ]
        return { content: [{ type: 'text', text: lines.join('\n') }] }
      } catch (e) {
        return {
          content: [{ type: 'text', text: `❌ package.json 파싱 실패: ${String(e)}` }],
        }
      }
    }
  )

  // ─── migrate ────────────────────────────────────────────
  // 전환 = lock/node_modules 삭제 + install. 실수 시 영향 큼 → MCP 는 진단만.
  server.registerTool(
    'migrate',
    {
      description:
        '패키지 매니저 감지 + 전환 후보 가용성 (MCP 모드: 실제 전환 미수행 — `vhk migrate <target>` 안내)',
    },
    async () => {
      const current = existsSync('pnpm-lock.yaml')
        ? 'pnpm'
        : existsSync('yarn.lock')
          ? 'yarn'
          : existsSync('package-lock.json')
            ? 'npm'
            : null
      const candidates = (['npm', 'yarn', 'pnpm'] as const).filter((pm) => pm !== current)
      const lines = [`현재 PM: ${current ?? '감지 불가 (lock 파일 없음)'}`]
      for (const pm of candidates) {
        const r = safeExecFile(pm, ['--version'])
        lines.push(`  ${pm}: ${r.ok ? `✓ v${r.out}` : '✗ 미설치'}`)
      }
      lines.push('', '실제 전환은 터미널에서: vhk migrate <pnpm|npm|yarn>')
      return { content: [{ type: 'text', text: lines.join('\n') }] }
    }
  )

  // ─── update ─────────────────────────────────────────────
  // npm update -g 는 글로벌 영향. MCP 는 버전 비교만 (--check 의미).
  server.registerTool(
    'update',
    {
      description:
        'VHK 현재/최신 버전 비교 (MCP 모드: --check 만 — 실제 업데이트 미수행)',
    },
    async () => {
      const cur = safeExecFile('vhk', ['--version'])
      // 네트워크 호출 — MCP 모드에서 레지스트리 장애 시 stdio 핸들러 hang 방지.
      const latest = safeExecFile('npm', ['view', '@byh3071/vhk', 'version'], {
        timeoutMs: NETWORK_EXEC_TIMEOUT_MS,
      })
      const lines = [
        `현재: ${cur.ok ? `v${cur.out.replace(/^v/, '')}` : '확인 실패'}`,
        `최신: ${latest.ok ? `v${latest.out.replace(/^v/, '')}` : '확인 실패 (네트워크 또는 npm registry)'}`,
      ]
      if (cur.ok && latest.ok) {
        const same = cur.out.replace(/^v/, '') === latest.out.replace(/^v/, '')
        lines.push(
          same
            ? '✓ 최신 버전입니다.'
            : '⬆️  업데이트 가능. 터미널에서: vhk update (또는 npm update -g @byh3071/vhk)'
        )
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] }
    }
  )

  // ─── ref-list ───────────────────────────────────────────
  server.registerTool(
    'ref-list',
    { description: '저장된 레퍼런스 URL 목록 보기 (add/open 은 인자/대화형 → CLI 전용)' },
    async () => runVhkCli(['ref', 'list'], 'ref list')
  )

  // ─── memory-list ────────────────────────────────────────
  server.registerTool(
    'memory-list',
    { description: '저장된 결정사항(memory) 목록 보기 (add/remove 는 인자 필요 → CLI 전용)' },
    async () => runVhkCli(['memory', 'list'], 'memory list')
  )

  // ─── context-show ───────────────────────────────────────
  server.registerTool(
    'context-show',
    { description: '.vhk/context.md 파일 내용 보기 (없으면 `vhk context` 안내)' },
    async () => runVhkCli(['context-show'], 'context-show')
  )

  // ─── mcp-init ───────────────────────────────────────────
  server.registerTool(
    'mcp-init',
    { description: '.cursor/mcp.json 생성/갱신 — vhk MCP 서버 등록 (Cursor 재시작 필요)' },
    async () => runVhkCli(['mcp-init'], 'mcp-init')
  )

  return server
}

export async function startMcpServer(): Promise<void> {
  const server = createVhkMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
