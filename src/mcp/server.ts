import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { existsSync, readFileSync } from 'node:fs'
import { safeExecFile } from '../lib/exec.js'

const SERVER_VERSION = '0.6.0'

function isGitRepo(): boolean {
  return safeExecFile('git', ['rev-parse', '--is-inside-work-tree']).ok
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
        const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
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
        const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
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

  return server
}

export async function startMcpServer(): Promise<void> {
  const server = createVhkMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
