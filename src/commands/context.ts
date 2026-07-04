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
import { readMemory, activeMemoryLines } from './memory.js'
import { listGoals } from '../lib/goal-frontmatter.js'
import { selectActiveId } from './goal.js'
import { getActiveBlockers, isHardStopActive } from '../lib/state-files.js'
import { gitOut } from '../lib/git-repo.js'
import { CONTEXT_GIT_MARKER } from '../lib/drift.js'
import { TOP_LEVEL_COMMANDS } from '../lib/command-registry.js'
import { loadCoreRuleset } from '../lib/core-rules.js'

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
    const entries = readdirSync(dir)
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
  // SoT(2층): 명령 목록은 command-registry.ts(TOP_LEVEL_COMMANDS) 단일 소스에서만 가져온다.
  // 과거엔 여기 명령을 하드코딩해 work/goal 등이 누락·드리프트됐다(영상의 "같은 진실을 또 정의" 안티패턴).
  // 출력 형태(`- \`vhk gate — ...\``)는 그대로 유지.
  return TOP_LEVEL_COMMANDS.map((c) => `${c.name} — ${c.desc}`)
}

/**
 * vhk context — LLM 부팅 컨텍스트(.vhk/context.md) 생성.
 * compact 모드(--compact): 토큰 절감형. 전체 명령 목록/깊은 트리 대신 Active Goal +
 * 최근 blockers + memory v2(결정/실패·교훈/성공) + 참조 문서 링크만 담는다. 기본(full)은 기존 호환 유지.
 */
export async function context(opts: { compact?: boolean } = {}): Promise<void> {
  const compact = opts.compact === true
  console.log(chalk.bold('\n🧠 ' + t('context.title')))
  console.log(chalk.gray('─'.repeat(40)))

  const stack = extractTechStack()
  const tree = buildTree('.', '', compact ? 2 : 3).join('\n')
  const commands = getVhkCommands()

  const lines: string[] = []
  lines.push('# 프로젝트 컨텍스트')
  lines.push('')
  lines.push('> 이 파일은 `vhk context`로 자동 생성되었습니다.')
  lines.push('> AI 어시스턴트에게 프로젝트 맥락을 제공합니다.')
  lines.push('')

  // SoT(2층) 원본 지도: "무엇을 고칠 때 어디를 고쳐야 하는가"를 AI·사람 모두에게 명시.
  // 규칙은 RULES.md 한 곳만 원본, 나머지는 vhk sync 파생본 — 중복 수정·드리프트 방지.
  lines.push('## 원본 지도 (Source of Truth)')
  lines.push('')
  lines.push('> 무엇을 고칠 땀 "원본" 한 곳만 고치세요. 나머지는 파생본이라 자동 생성됩니다.')
  lines.push('')
  lines.push('- **규칙(원본)**: `RULES.md` — 규칙은 여기 한 곳에서만 수정')
  lines.push('- **작업 상태**: `docs/state/next-task.md`, `docs/state/blockers.md`')
  lines.push('- **버전·릴리스**: `package.json`, `CHANGELOG.md`')
  lines.push('- **명령 목록**: `COMMANDS.md` (+ `vhk help`)')
  lines.push('- **파생본(직접 수정 금지)**: `.cursorrules`·`.windsurfrules`·`.github/copilot-instructions.md`·`AGENTS.md`·`GEMINI.md` 등 7종 + `CLAUDE.md` 규칙 영역 → `vhk sync` 로 생성')
  lines.push('')

  lines.push('## 기술 스택')
  lines.push('')
  for (const [key, value] of Object.entries(stack)) {
    lines.push(`- **${key}**: ${value}`)
  }
  lines.push('')

  const coreRules = loadCoreRuleset()
  const coreVersionLabel = coreRules.version === 'unknown' ? '버전 미상' : `v${coreRules.version}`
  lines.push('## 헌법(core-rules) 소스')
  lines.push('')
  lines.push(
    coreRules.source === 'live'
      ? `- live — PRIVATE_RULES_ROOT 라이브 상속 (${coreVersionLabel})`
      : `- bundled — 번들 스냅샷 (${coreVersionLabel}) · PRIVATE_RULES_ROOT 미설정 또는 라이브 파일 읽기 실패, 최신 아닐 수 있음`
  )
  lines.push('')

  lines.push('## 디렉토리 구조')
  lines.push('')
  lines.push('```text') // VHK-003: markdownlint MD040 — 펜스 언어 지정
  lines.push(tree)
  lines.push('```')
  lines.push('')

  // compact: 전체 명령 목록(~28줄)은 토큰만 먹으므로 한 줄 참조로 대체. full: 기존대로 전체.
  if (compact) {
    lines.push('## 명령어 (요약)')
    lines.push('')
    lines.push('- 전체 목록은 `vhk help` 또는 `COMMANDS.md` 참조 (compact 모드는 생략)')
    lines.push('')
  } else {
    lines.push('## VHK CLI 명령어')
    lines.push('')
    for (const cmd of commands) {
      lines.push(`- \`vhk ${cmd}\``)
    }
    lines.push('')
  }

  // gh#289: 아래 3개 섹션(저장된 기억/Active Goal/Active Blockers)이 전부 empty 면 세션 복원용
  // "작업상태" 신호가 0 이었다(신규·희소 프로젝트에서 goals/blockers/memory 시스템 미사용 시
  // 재현 확인됨) — hasWorkState 로 추적해 전부 없으면 최근 git 커밋 폴백을 보여준다.
  let hasWorkState = false

  try {
    // memory v2 4버킷 — active 만 누락 없이(버킷별 최근 5개). readMemory 가 v1·learnings 흡수까지
    // 처리하므로 memory.json 부재여도 learnings 흡수분이 여기서 노출(교훈 단일 출처).
    const memLines = activeMemoryLines(readMemory(process.cwd()))
    if (memLines.length > 0) {
      lines.push('## 저장된 기억 (memory v2)')
      lines.push('')
      lines.push(...memLines)
      hasWorkState = true
    }
  } catch {
    // memory.json 파싱 실패 → 무시
  }

  // Goal 2 (자율 루프): active goal 섹션. SoT 는 goals/<n>.md frontmatter.
  // 교훈(learnings)은 v2 에서 memory failures.lesson 단일 출처 — 위 "저장된 기억(memory v2)" 섹션에서 노출.
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
      hasWorkState = true
    }
  }

  // 교훈(learnings)은 v2 에서 memory failures.lesson 로 통합 — 위 "저장된 기억" 섹션에서 노출.
  // (구 docs/state/learnings.md Recent Learnings 블록 제거 — 중복·stale 방지.)

  // 활성 blocker 최근 3건 — "지금 막힌 것"만. 해결(~~취소선~~) 항목은 제외.
  const activeBlockers = getActiveBlockers(3)
  if (activeBlockers.length > 0) {
    lines.push('## Active Blockers')
    lines.push('')
    for (const b of activeBlockers) lines.push(b)
    lines.push('')
    hasWorkState = true
  }

  // gh#289 폴백: 위 3개 섹션이 전부 없으면(goals/blockers/memory 미사용 프로젝트) 최근 git
  // 커밋을 대신 보여준다 — "무엇을 하고 있었는지" 최소한의 신호는 남겨 세션 복원에 보탬.
  if (!hasWorkState) {
    try {
      const log = gitOut(['log', '-5', '--pretty=format:%h %s'], process.cwd()).trim()
      if (log) {
        lines.push('## 최근 활동 (git log — goals/blockers/memory 미사용 시 폴백)')
        lines.push('')
        lines.push('```')
        lines.push(log)
        lines.push('```')
        lines.push('')
      }
    } catch {
      // git 미설치·커밋 없음 등 → 조용히 생략(정적 섹션만으로도 크래시 없이 유지)
    }
  }

  // compact: 상세 문서를 통째로 넣지 않고 "필요시 열람할 파일" 참조 링크만 제공(토큰 절감).
  if (compact) {
    lines.push('## 참조 문서 (필요시 열람)')
    lines.push('')
    lines.push('- 규칙 원본(SoT): `RULES.md` — 규칙은 여기서만 수정')
    lines.push('- 작동 규약(요약): `docs/context/agent-compact.md`')
    lines.push('- 규약 상세: `AGENTS.md`')
    lines.push('- 운영 안내·기록: `CLAUDE.md`')
    lines.push('- 명령 상세: `COMMANDS.md`')
    lines.push('- 구조 상세: `docs/ARCHITECTURE.md`')
    lines.push('- 현재 상태: `docs/state/next-task.md`')
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
