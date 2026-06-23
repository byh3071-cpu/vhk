import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { safeExecFile, NETWORK_EXEC_TIMEOUT_MS } from '../lib/exec.js'
import * as gitSession from '../lib/git-session.js'
import { isGitRepo } from '../lib/git-repo.js'
import { parseEnvKeys } from '../commands/env.js'
import { resolveDeployTarget } from '../commands/deploy.js'
import { bumpVersion } from '../commands/publish.js'
import { detectCurrentPM, parseAuditOutputDetailed, runAuditJson } from '../commands/audit.js'
import { readJsonFile } from '../lib/read-json.js'
import { isHardStopActive, readHardStopReason } from '../lib/state-files.js'
import { filterSevereFindings, scanProjectForSecrets } from '../lib/scan-secrets.js'
import { getVhkVersion } from '../lib/version.js'
import { resolveVhkCliInvocation, composeInvocation, type VhkCliInvocation } from './cli-path.js'

// package.json 의 version 을 런타임에 읽음 (lib/version 재사용) — drift 방지.
// dist/index.js 와 dist/mcp/index.js 둘 다 lib/version 의 candidate 경로로 해석됨.
const SERVER_VERSION = getVhkVersion()

// goal 70: MCP 고위험 도구 옵트인 정책의 단일 SoT(risk_level).
// 상태변경·바깥행동(save=commit/push, undo=reset)을 하는 네이티브 핸들러는
// confirm:true 명시 전 실제 실행을 거부하고 미리보기만 반환한다(PAT-003 — 되돌릴 수 없는 작업).
// runVhkCli 위임 도구는 CLI guardCli 가 별도로 가드하므로 여기 포함하지 않는다.
export const HIGH_RISK_MCP_TOOLS = new Set<string>(['save', 'undo'])

// Goal 48: 세션 git 동작은 src/lib/git-session 의 함수를 공유한다(인라인 재구현 금지).
// 레포 감지는 git-repo.isGitRepo(Goal 46 sync SoT)로 위임 — MCP 전용 재정의 제거.

// Goal 41: MCP surface HARD_STOP 가드. CLI 의 ensureNotHardStopped 는 console.error +
// process.exitCode 를 쓰는데, MCP stdio 서버는 stdout/stderr 가 JSON-RPC 채널이라 부적합
// (로그 출력이 프로토콜 오염) → 대신 content 응답을 반환한다. 상태변경 툴을 *재구현*해
// CLI 의 guardCli chokepoint 를 우회하는 MCP 전용 핸들러(save/undo/env)에만 적용.
// runVhkCli 위임 툴은 CLI 서브프로세스가 guardCli 를 그대로 거치므로 별도 가드 불필요.
function hardStopBlocked(action: string): { content: [{ type: 'text'; text: string }] } | null {
  if (!isHardStopActive()) return null
  const reason = readHardStopReason()
  const text =
    `🛑 HARD STOP 활성 — '${action}' 을(를) 실행하지 않았습니다.` +
    (reason ? `\n사유: ${reason.replace(/\s*\n\s*/g, ' ')}` : '') +
    `\n해제: vhk resume --confirm (사람이 직접 실행)`
  return { content: [{ type: 'text', text }] }
}

// ANSI escape sequence (color / cursor / formatting). MCP 클라이언트 일부가
// raw escape 를 그대로 노출해서 가독성 깨짐 → defensive strip.
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1B\[[0-9;?]*[ -/]*[@-~]/g

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '')
}

// CLI 실행 경로는 1회 해석 후 캐시 — 전역 vhk 없으면 로컬 dist/index.js 로 fallback.
let cachedCli: VhkCliInvocation | null = null
function getVhkCli(): VhkCliInvocation {
  return (cachedCli ??= resolveVhkCliInvocation())
}

// vhk CLI 자체를 서브프로세스로 호출해서 결과를 MCP content로 변환.
// MCP 모드에서는 inquirer/ora 프롬프트가 동작하지 않으므로 비대화형 커맨드만 위임.
// chalk 가 색을 안 쓰도록 FORCE_COLOR=0 + NO_COLOR=1 강제 + 잔여 ANSI 는 regex strip.
// 가드 차단은 CLI exit 0 으로 끝난다 — 출력 문구로 식별해 "✅" 거짓 성공 헤드라인을 막는다(리뷰 A1-03).
// safety-guard 의 차단 메시지 3종(no-confirm/preview/lite-noninteractive)이 이 문구를 공통 포함.
export function isGuardBlockedOutput(body: string): boolean {
  return /위험 작업\(/.test(body) && body.includes('실행하지 않았습니다')
}

// #340: NL 라우터 미인식 폴백(nlp-run: '❓ … 무슨 뜻인지 모르겠어요')은 exit 0 으로 끝나
// runVhkCli 가 ✅ 거짓 성공으로 위장한다 — 미인식 문구를 감지해 실패 신호로 표면화.
export function isNotMatchedOutput(body: string): boolean {
  return body.includes('무슨 뜻인지 모르겠어요')
}

function runVhkCli(
  args: string[],
  headline: string
): { content: [{ type: 'text'; text: string }] } {
  const { bin, args: fullArgs } = composeInvocation(getVhkCli(), args)
  const result = safeExecFile(bin, fullArgs, {
    env: { FORCE_COLOR: '0', NO_COLOR: '1' },
  })
  const body = stripAnsi(result.out || (result.ok ? '' : `(stdout 없음)\n${result.err}`))
  const prefix = result.ok
    ? isGuardBlockedOutput(body)
      ? `⛔ ${headline} 실행 안 됨 (가드 차단 — 승인 필요)`
      : isNotMatchedOutput(body)
        ? `❓ ${headline} 미인식 — 명령을 인식하지 못했습니다`
        : `✅ ${headline}`
    : `❌ ${headline} 실패`
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
      description: '변경사항 저장 (git add → commit → push). 기본은 미리보기 — confirm:true 일 때만 실제 실행(고위험 옵트인).',
      inputSchema: {
        message: z.string().optional().describe('커밋 메시지 (비우면 자동 생성)'),
        confirm: z
          .boolean()
          .optional()
          .describe('true 일 때만 실제 commit/push 실행 (기본 false = 미리보기만 — goal 70 고위험 옵트인)'),
      },
    },
    async ({ message, confirm }) => {
      const blocked = hardStopBlocked('save') // Goal 41: HARD_STOP 활성 시 commit/push 차단
      if (blocked) return blocked
      if (!isGitRepo()) {
        return { content: [{ type: 'text', text: '❌ git 저장소가 아닙니다.' }] }
      }

      const status = gitSession.statusPorcelain()
      if (!status.ok) {
        return { content: [{ type: 'text', text: `❌ git status 실패: ${status.err}` }] }
      }
      if (!status.out) {
        return { content: [{ type: 'text', text: '📭 저장할 변경사항이 없습니다.' }] }
      }

      // statusPorcelain 은 raw(후행 개행 포함) → 빈 줄 제거 후 파일 카운트.
      const files = status.out.split('\n').filter(Boolean)

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

      // goal 70: 고위험 옵트인 — confirm:true 없으면 commit/push 하지 않고 미리보기만.
      // 에이전트가 사람 승인 없이 원격에 push 하는 것을 차단(undo 와 동일 패턴, HIGH_RISK_MCP_TOOLS).
      if (!confirm) {
        return {
          content: [
            {
              type: 'text',
              text:
                `🔎 미리보기 — 저장 예정 ${files.length}개 파일:\n${files.map((f) => `  ${f}`).join('\n')}\n` +
                `커밋 메시지: ${commitMsg}\n` +
                `이후 원격 push 까지 진행됩니다.\n\n` +
                `실제로 저장하려면 confirm: true 로 다시 호출하세요.\n` +
                `또는 터미널에서 \`vhk save\` (CLI 확인 프롬프트).`,
            },
          ],
        }
      }

      const add = gitSession.stageAll()
      if (!add.ok) {
        return { content: [{ type: 'text', text: `❌ git add 실패: ${add.err}` }] }
      }
      const commitRes = gitSession.commit(commitMsg)
      if (!commitRes.ok) {
        return { content: [{ type: 'text', text: `❌ commit 실패: ${commitRes.err}` }] }
      }

      const pushRes = gitSession.push()
      const pushResult = pushRes.ok ? '+ 원격 업로드 완료' : '(원격 저장소 없거나 push 실패 → 스킵)'

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
  // 안전화: 에이전트 채팅창에서 즉시 git reset 은 위험 → 기본 dry-run.
  // 되돌릴 대상을 먼저 보고하고, confirm:true 일 때만 실제 reset 실행.
  server.registerTool(
    'undo',
    {
      description: '최근 커밋 되돌리기 (soft reset). 기본은 미리보기 — confirm:true 일 때만 실제 실행.',
      inputSchema: {
        confirm: z
          .boolean()
          .optional()
          .describe('true 일 때만 실제 git reset 실행 (기본 false = 미리보기만)'),
      },
    },
    async ({ confirm }) => {
      const blocked = hardStopBlocked('undo') // Goal 41: HARD_STOP 활성 시 되돌리기(상태변경) 차단
      if (blocked) return blocked
      if (!isGitRepo()) {
        return { content: [{ type: 'text', text: '❌ git 저장소가 아닙니다.' }] }
      }

      const last = gitSession.recentCommits(1)
      if (!last.ok || !last.out) {
        return { content: [{ type: 'text', text: '📭 되돌릴 커밋이 없습니다.' }] }
      }

      // 기본 dry-run — 명시적 confirm 없이는 reset 하지 않는다.
      if (!confirm) {
        return {
          content: [
            {
              type: 'text',
              text:
                `🔎 미리보기 — 되돌릴 커밋:\n${last.out}\n\n` +
                `실제로 되돌리려면 confirm: true 로 다시 호출하세요.\n` +
                `(soft reset — 변경사항은 스테이징 영역에 보존됩니다.)\n` +
                `또는 터미널에서 \`vhk undo\` (대화형 확인).`,
            },
          ],
        }
      }

      const reset = gitSession.softReset(1)
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
    }
  )

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

    const branch = gitSession.currentBranch()
    if (branch.ok) lines.push(`🌿 브랜치: ${branch.out || '(detached)'}`)

    const status = gitSession.statusPorcelain()
    if (status.ok) {
      if (!status.out) {
        lines.push('📝 변경사항: ✅ 깨끗함')
      } else {
        // statusPorcelain 은 raw(후행 개행 포함) → 빈 줄 제거 후 코드 파싱.
        const fileLines = status.out.split('\n').filter(Boolean)
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

    const log = gitSession.recentCommits(3)
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

    const unstaged = gitSession.unstagedStat()
    const staged = gitSession.stagedStat()
    const untracked = gitSession.untrackedFiles()

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

    const numstat = gitSession.numstatHead()
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
      const status = gitSession.statusPorcelain()
      if (status.ok) {
        if (status.out) {
          checks.push(`⚠️ 커밋되지 않은 변경사항 ${status.out.split('\n').filter(Boolean).length}개`)
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

    const git = gitSession.gitVersion()
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
  // #161: CLI `vhk check`(RULES.md 규칙 엔진)로 위임 — 옛 static 파일 체크리스트는 CLI 와
  // 의미가 달라 에이전트에 거짓 신호를 줬다(harness/secure 와 동일하게 CLI 단일 출처로 통일).
  server.registerTool(
    'check',
    { description: '프로젝트 규칙 점검 (vhk check — RULES.md 규칙 엔진, CLI 와 동일)' },
    async () => runVhkCli(['check'], 'check')
  )

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
      const log = gitSession.recapLog(n)
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
      const blocked = hardStopBlocked('env') // Goal 41: HARD_STOP 활성 시 .env.example/.gitignore 쓰기 차단
      if (blocked) return blocked
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
    {
      description:
        'RULES.md → Cursor·Claude·Windsurf·Copilot·Antigravity·AGENTS.md 규칙 동기화. ' +
        '덮어쓰기 전 기존 파일을 자동 백업하므로 안전하며, 되돌리려면 사용자에게 `vhk restore` 를 안내하세요.',
    },
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
      const { summary, indeterminate } = parseAuditOutputDetailed(output, pm)
      // #341: 감사 불가(ENOLOCK·빈/형식불량 출력)를 0건으로 단정 금지 — CLI 와 동일하게 '결과 불명' 구분.
      if (indeterminate) {
        return {
          content: [{ type: 'text', text: `⚠️ ${pm}: 감사 결과를 해석하지 못했습니다 (결과 불명). \`vhk audit\` 로 확인하세요.` }],
        }
      }
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

  // ─── loop-brief ─────────────────────────────────────────
  server.registerTool(
    'loop-brief',
    { description: '루프 1틱 앵커(.vhk/loop-brief.md) 생성 — 의도(VISION)+활성goal+관련교훈+STOP조건' },
    async () => runVhkCli(['loop-brief'], 'loop-brief')
  )

  // ─── remind ─────────────────────────────────────────────
  server.registerTool(
    'remind',
    { description: '치명 규칙 재주입(.vhk/remind.md) 생성 — RULES.md NON-NEGOTIABLE/Forbidden 섹션 압축(긴 세션 컴팩션 대비)' },
    async () => runVhkCli(['remind'], 'remind')
  )

  // ─── content ────────────────────────────────────────────
  server.registerTool(
    'content',
    { description: '콘텐츠 초안 프롬프트(.vhk/content-prompt.md) 생성 — 풀사이클 뒷단(콘텐츠/마케팅), 초안만(게시·발송 0)' },
    async () => runVhkCli(['content'], 'content')
  )

  // ─── launch ─────────────────────────────────────────────
  server.registerTool(
    'launch',
    { description: '런칭 게시물 프롬프트(.vhk/launch-prompt.md) 생성 — 풀사이클 뒷단(런칭), 초안만(게시·발송 0)' },
    async () => runVhkCli(['launch'], 'launch')
  )

  // ─── ops ────────────────────────────────────────────────
  server.registerTool(
    'ops',
    { description: '운영 회고 프롬프트(.vhk/ops-prompt.md) 생성 — 풀사이클 뒷단(운영), 초안만(중단·삭제 0)' },
    async () => runVhkCli(['ops'], 'ops')
  )

  // ─── sell ───────────────────────────────────────────────
  server.registerTool(
    'sell',
    { description: '판매 카피 프롬프트(.vhk/sell-prompt.md) 생성 — 풀사이클 뒷단(판매), 초안만(결제·과금 0)' },
    async () => runVhkCli(['sell'], 'sell')
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
      // #152: resolveDeployTarget 로 CLI 와 동일 감지(Cloudflare Pages/Workers 구분). 과거엔
      // platform 키('cloudflare')를 CLI 명령으로 오용해 `cloudflare --version`(존재X)로 항상 실패했음.
      const target = resolveDeployTarget()
      if (!target) {
        return {
          content: [
            {
              type: 'text',
              text: '❌ 배포 플랫폼 미감지 (vercel.json / netlify.toml / wrangler.toml 없음).\n플랫폼 설정 파일 추가 후 다시 시도.',
            },
          ],
        }
      }
      const { config } = target
      const cliCheck = safeExecFile(config.command, config.checkArgs)
      const cmdLabel = `${config.command} ${config.commandArgs.join(' ')}`
      const cliStatus = cliCheck.ok
        ? `✓ CLI 사용 가능 (${cliCheck.out.split('\n')[0]})`
        : `✗ CLI 미설치 — ${config.installHint}`
      return {
        content: [
          {
            type: 'text',
            text: `🚀 감지된 플랫폼: ${config.name}\n배포 명령: ${cmdLabel}\n${cliStatus}\n\n실제 배포는 터미널에서: vhk deploy`,
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
    {
      description:
        'memory v2 활성 기억 목록 (decisions/failures/successes — 기본 active 만). add/remove/archive/resolve/unarchive/migrate 는 인자·쓰기 → CLI 전용',
    },
    async () => runVhkCli(['memory', 'list'], 'memory list')
  )

  // ─── learn ──────────────────────────────────────────────
  // 교훈 기록은 인자 1개(lesson)뿐이고 inquirer/process.exit 미사용 → MCP 안전(쓰기 도구).
  server.registerTool(
    'learn',
    {
      description: '교훈 1줄 기록 → memory v2 failures.lesson (단일 SoT, Evolution Loop 폐회로)',
      inputSchema: { lesson: z.string().describe('기록할 교훈 한 줄') },
    },
    async ({ lesson }) => runVhkCli(['learn', lesson], 'learn')
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

  // ─── pattern-detect ──────────────────────────────────────
  server.registerTool(
    'pattern-detect',
    {
      description: 'active failures+successes 2축 분석 → avoid/reinforce 후보 감지 · patterns[] 갱신 (Goal 19)',
      inputSchema: {
        min: z.number().int().min(1).optional().describe('임계 횟수 (기본 3)'),
      },
    },
    async ({ min }) => {
      const args = ['pattern', 'detect', '--json']
      if (min !== undefined) args.push('--min', String(min))
      return runVhkCli(args, 'pattern detect')
    }
  )

  // ─── pattern-list ────────────────────────────────────────
  server.registerTool(
    'pattern-list',
    {
      description: '패턴 후보 목록 조회 (avoid/reinforce · 활성 기본) — Goal 19',
      inputSchema: {
        kind: z.enum(['avoid', 'reinforce']).optional().describe('종류 필터'),
        all: z.boolean().optional().describe('보관(archived) 포함'),
      },
    },
    async ({ kind, all }) => {
      const args = ['pattern', 'list', '--json']
      if (kind) args.push('--kind', kind)
      if (all) args.push('--all')
      return runVhkCli(args, 'pattern list')
    }
  )

  // ─── evolve-suggest ──────────────────────────────────────
  server.registerTool(
    'evolve-suggest',
    {
      description: 'active avoid 패턴 → 룰 초안 후보 생성·큐 적재 (Goal 20)',
      inputSchema: {},
    },
    async () => runVhkCli(['evolve', 'suggest', '--json'], 'evolve suggest')
  )

  // ─── evolve-list ─────────────────────────────────────────
  server.registerTool(
    'evolve-list',
    {
      description: '진화 후보 목록 조회 (pending|rejected|applied — Goal 20)',
      inputSchema: {
        status: z.enum(['pending', 'rejected', 'applied']).optional().describe('상태 필터'),
      },
    },
    async ({ status }) => {
      const args = ['evolve', 'list', '--json']
      if (status) args.push('--status', status)
      return runVhkCli(args, 'evolve list')
    }
  )

  return server
}

// #342 #343: MCP 도구 수 단일 SoT — 실 등록 도구를 런타임에 읽어 length 파생.
//   과거엔 도구 수가 surface 마다(help 'MCP N tools'·mcp 명령 설명) 따로 하드코딩돼 드리프트.
//   registerTool 은 명령형 호출이라 선언적 배열이 없으므로, 빌드된 서버의 등록 맵에서 셋을 읽는다.
//   SDK 는 public introspection API 가 없어 _registeredTools(private) 접근이 불가피 →
//   접근 지점을 이 한 곳에 격리(SDK 메이저 업그레이드 시 여기만 패치). tests/helpers/mcp-introspect 와 동일 형태.
interface ToolRegistryShape {
  _registeredTools: Record<string, unknown>
}

export function getMcpToolNames(): string[] {
  const server = createVhkMcpServer() as unknown as ToolRegistryShape
  return Object.keys(server._registeredTools)
}

export function getMcpToolCount(): number {
  return getMcpToolNames().length
}

export async function startMcpServer(): Promise<void> {
  const server = createVhkMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
