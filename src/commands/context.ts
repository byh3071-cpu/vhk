import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { readJsonFile } from '../lib/read-json.js'
import { listGoals } from '../lib/goal-frontmatter.js'
import { selectActiveId } from './goal.js'
import { getRecentLearnings, isHardStopActive } from '../lib/state-files.js'
import { gitOut } from '../lib/git-repo.js'
import { CONTEXT_GIT_MARKER } from '../lib/drift.js'

const CONTEXT_PATH = '.vhk/context.md'

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.next',
  '.nuxt',
  '.output',
  'coverage',
  '.cache',
  '.turbo',
  '.vhk',
])

function buildTree(dir: string, prefix = '', maxDepth = 3, depth = 0): string[] {
  if (depth >= maxDepth) return []
  const lines: string[] = []
  try {
    const entries = readdirSync(dir) as string[]
    const filtered = entries.filter(
      (e) => (!e.startsWith('.') || e === '.env.example') && !IGNORE_DIRS.has(e)
    )

    filtered.forEach((entry, index) => {
      const isLast = index === filtered.length - 1
      const connector = isLast ? '└── ' : '├── '
      const fullPath = join(dir, entry)
      const stat = statSync(fullPath)
      const isDir = stat.isDirectory()
      lines.push(`${prefix}${connector}${entry}${isDir ? '/' : ''}`)
      if (isDir) {
        const nextPrefix = prefix + (isLast ? '    ' : '│   ')
        lines.push(...buildTree(fullPath, nextPrefix, maxDepth, depth + 1))
      }
    })
  } catch {
    // dir 없음 또는 권한 X
  }
  return lines
}

type DepMap = Record<string, string>

function extractTechStack(): Record<string, string> {
  const stack: Record<string, string> = {}
  try {
    // PowerShell `Out-File -Encoding utf8`로 만든 package.json은 BOM 포함 → readJsonFile로 stripBom.
    const pkg = readJsonFile<{
      name?: string
      version?: string
      dependencies?: DepMap
      devDependencies?: DepMap
    }>('package.json')
    const all: DepMap = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }

    if (all.next) stack['프레임워크'] = `Next.js ${all.next}`
    else if (all.nuxt) stack['프레임워크'] = `Nuxt ${all.nuxt}`
    else if (all.react) stack['프레임워크'] = `React ${all.react}`
    else if (all.vue) stack['프레임워크'] = `Vue ${all.vue}`
    else if (all.svelte) stack['프레임워크'] = `Svelte ${all.svelte}`

    if (all.typescript) stack['언어'] = `TypeScript ${all.typescript}`
    if (all.tailwindcss) stack['스타일'] = `Tailwind CSS ${all.tailwindcss}`

    if (all.tsup) stack['빌드'] = 'tsup'
    else if (all.vite) stack['빌드'] = `Vite ${all.vite}`
    else if (all.webpack) stack['빌드'] = 'webpack'

    if (all.vitest) stack['테스트'] = 'vitest'
    else if (all.jest) stack['테스트'] = 'jest'

    if (all.commander) stack['CLI'] = 'commander'
    if (all.inquirer) stack['인터랙티브'] = 'inquirer'

    if (existsSync('pnpm-lock.yaml')) stack['패키지 매니저'] = 'pnpm'
    else if (existsSync('yarn.lock')) stack['패키지 매니저'] = 'yarn'
    else stack['패키지 매니저'] = 'npm'

    if (pkg.name) stack['패키지 이름'] = pkg.name
    if (pkg.version) stack['버전'] = pkg.version
  } catch {
    // package.json 없음
  }
  return stack
}

function getVhkCommands(): string[] {
  return [
    'gate — 아이디어 검증',
    'init — 프로젝트 초기화',
    'recap — 세션 요약 저장',
    'sync — 규칙 파일 동기화',
    'check — 규칙 점검',
    'secure — 보안 스캔',
    'ship — 배포 체크 + 회고',
    'doctor — 환경 진단',
    'save — git 저장 (add+commit+push)',
    'undo — 최근 커밋 되돌리기',
    'status — git 상태 확인',
    'diff — git 변경 사항 요약',
    'deploy — 프로덕션 배포',
    'env — 환경변수 관리',
    'publish — npm 배포 자동화',
    'design — 디자인 토큰 생성',
    'design-palette — 컬러 팔레트 선택',
    'theme — 다크/라이트 모드',
    'ref add|list|open — 레퍼런스 URL 관리',
    'harness — 통합 품질 점검',
    'audit — 보안 취약점 감사',
    'migrate — 패키지 매니저 전환',
    'update — VHK CLI 셀프 업데이트',
    'context — 프로젝트 맥락 생성',
    'context-show — 맥락 파일 보기',
    'memory add|list|remove — 결정사항 기억',
    'brief — 프로젝트 요약 보고서',
    'mcp — MCP 서버 시작',
    'mcp-init — Cursor MCP 설정',
  ]
}

export async function context(): Promise<void> {
  console.log(chalk.bold('\n🧠 ' + t('context.title')))
  console.log(chalk.gray('─'.repeat(40)))

  const stack = extractTechStack()
  const tree = buildTree('.').join('\n')
  const commands = getVhkCommands()

  const lines: string[] = []
  lines.push('# 프로젝트 컨텍스트')
  lines.push('')
  lines.push('> 이 파일은 `vhk context`로 자동 생성되었습니다.')
  lines.push('> AI 어시스턴트에게 프로젝트 맥락을 제공합니다.')
  lines.push('')

  lines.push('## 기술 스택')
  lines.push('')
  for (const [key, value] of Object.entries(stack)) {
    lines.push(`- **${key}**: ${value}`)
  }
  lines.push('')

  lines.push('## 디렉토리 구조')
  lines.push('')
  lines.push('```')
  lines.push(tree)
  lines.push('```')
  lines.push('')

  lines.push('## VHK CLI 명령어')
  lines.push('')
  for (const cmd of commands) {
    lines.push(`- \`vhk ${cmd}\``)
  }
  lines.push('')

  if (existsSync('.vhk/memory.json')) {
    try {
      const memories = readJsonFile<Array<{ content: string; addedAt: string }>>(
        '.vhk/memory.json'
      )
      if (Array.isArray(memories) && memories.length > 0) {
        lines.push('## 저장된 결정사항')
        lines.push('')
        for (const m of memories) {
          const date = new Date(m.addedAt).toLocaleDateString('ko-KR')
          lines.push(`- ${m.content} _(${date})_`)
        }
        lines.push('')
      }
    } catch {
      // memory.json 파싱 실패 → 무시
    }
  }

  // Goal 2 (자율 루프): active goal + 최근 learnings 3건 자동 포함.
  // SoT 는 goals/<n>.md frontmatter + docs/state/learnings.md.
  const goals = listGoals('goals')
  const activeId = selectActiveId(goals)
  if (activeId !== null) {
    const active = goals.find((g) => g.frontmatter.id === activeId)
    if (active) {
      lines.push('## Active Goal')
      lines.push('')
      lines.push(`- **id**: ${activeId}`)
      lines.push(`- **title**: ${active.frontmatter.title ?? '(untitled)'}`)
      lines.push(`- **status**: ${active.frontmatter.status ?? 'NOT_STARTED'}`)
      lines.push(`- **priority**: ${active.frontmatter.priority ?? '--'}`)
      lines.push(`- **file**: ${active.filePath}`)
      lines.push('')
    }
  }

  const recent = getRecentLearnings(3)
  if (recent.length > 0) {
    lines.push('## Recent Learnings')
    lines.push('')
    for (const r of recent) lines.push(r)
    lines.push('')
  }

  if (isHardStopActive()) {
    lines.push('## ⚠️ HARD_STOP 활성')
    lines.push('')
    lines.push('`.vhk/HARD_STOP` 파일 존재 — 모든 자동화 중단 상태.')
    lines.push('해제: `vhk resume --confirm` (사람 확인 후만)')
    lines.push('')
  }

  lines.push('---')
  lines.push('')
  lines.push(`_생성: ${new Date().toLocaleString('ko-KR')}_`)
  // 드리프트 점검용 — 생성 시점 git HEAD sha. git 아니면 생략.
  try {
    const sha = gitOut(['rev-parse', 'HEAD'], process.cwd()).trim()
    if (sha) lines.push(`_${CONTEXT_GIT_MARKER}: ${sha}_`)
  } catch {
    /* git 아님 — 마커 생략 (드리프트 점검은 checked=false 로 skip) */
  }
  lines.push('')

  mkdirSync('.vhk', { recursive: true })
  writeFileSync(CONTEXT_PATH, lines.join('\n'), 'utf-8')

  console.log(chalk.green(`\n✅ ${CONTEXT_PATH} 생성 완료!`))
  console.log(chalk.gray(`   기술 스택 ${Object.keys(stack).length}개 감지`))
  console.log(chalk.gray('   AI 어시스턴트에게 이 파일을 참조하게 하세요.'))

  printNextStep({
    message: '컨텍스트 파일 생성 완료!',
    command: 'vhk context-show',
    cursorHint: '컨텍스트 보여줘',
  })
}

export async function contextShow(): Promise<void> {
  console.log(chalk.bold('\n📄 ' + t('context.showTitle')))
  console.log(chalk.gray('─'.repeat(40)))

  if (!existsSync(CONTEXT_PATH)) {
    console.log(chalk.yellow('\n⚠️  컨텍스트 파일이 없습니다.'))
    console.log(chalk.gray('   vhk context를 먼저 실행하세요.'))
    return
  }

  const content = readFileSync(CONTEXT_PATH, 'utf-8')
  console.log('\n' + content)
}
