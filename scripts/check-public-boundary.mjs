import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const ALLOWED_PACKAGE_FILES = new Set(['package.json', 'README.md', 'README.en.md', 'LICENSE', 'SECURITY.md'])
const REQUIRED_PACKAGE_BIN = ['dist/index.js', 'dist/mcp/index.js']
const PRIVATE_TRACKED_PATHS = [
  'docs/log/',
  'docs/state/',
  'docs/devlog/',
  'goals/',
  '.agents/SOUL.md',
  '.vhk/config.json',
  '.vhk/events/',
  '.vhk/ledger.jsonl',
  '.claude/agents/memtest.md',
  '.claude/skills/auto-merge/',
  '.claude/skills/overnight-vhk-auto/',
  'docs/prompts/autonomy/',
]

const literal = (...parts) => parts.join('')
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
const exactPattern = (name, ...parts) => ({ name, pattern: new RegExp(escapeRegex(literal(...parts)), 'iu') })

const PRIVATE_TEXT_PATTERNS = [
  exactPattern('개인 규칙 저장소명', 'yohan', '-', 'brain'),
  exactPattern('개인 스킬 저장소명', 'yohan', '-', 'cc', '-', 'skills'),
  exactPattern('개인 에이전트 묶음명', 'yohan', '-', 'core'),
  exactPattern('개인 런타임명', 'yohan', '-', 'os'),
  exactPattern('개인 MCP명', 'yohan', '-', 'mcp'),
  exactPattern('개인 작업공간명', 'yohan', '-', 'ecosystem'),
  exactPattern('개인명 기반 환경변수', 'YOHAN', '_', 'BRAIN', '_', 'ROOT'),
  exactPattern('폐기된 홈 설정 키', 'brain', 'Root'),
  exactPattern('폐기된 CLI 명령', 'set', '-', 'brain', '-', 'root'),
  exactPattern('실명', '백', '요', '한'),
  exactPattern('개인 에이전트명', '노', '뚝이'),
  exactPattern('개인 Gmail', 'byh3071', '@', 'gmail.com'),
  exactPattern('개인 npm 메일', 'byh3071', '@', 'naver.com'),
  { name: 'Windows 사용자 절대경로', pattern: /[a-z]:\\users\\(?:public|user|[^\\\s"']+)[\\/]/iu },
  { name: '외부 워크플로 식별자', pattern: /\bwf_[a-z0-9-]{6,}\b/iu },
]

const UUID_PATTERN = /\b[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\b/giu
const ZERO_UUID = /^0{32}$/u

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  })
}

function normalizePath(file) {
  return String(file).replaceAll('\\', '/')
}

function isPrivatePath(file) {
  const normalized = normalizePath(file).toLowerCase()
  return PRIVATE_TRACKED_PATHS.some((part) => {
    const target = part.toLowerCase()
    return target.endsWith('/') ? normalized.startsWith(target) : normalized === target
  })
}

export function scanPublicText(label, content) {
  if (content.includes('\0')) return []
  const problems = []
  for (const forbidden of PRIVATE_TEXT_PATTERNS) {
    if (forbidden.pattern.test(content)) problems.push(`${label}: ${forbidden.name} 노출`)
  }
  for (const match of content.matchAll(UUID_PATTERN)) {
    const compact = match[0].replaceAll('-', '').toLowerCase()
    if (!ZERO_UUID.test(compact)) {
      problems.push(`${label}: 실제 외부 서비스 객체로 오인될 수 있는 UUID 노출`)
      break
    }
  }
  return problems
}

function packManifest() {
  const command = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'npm'
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm.cmd pack --dry-run --json --ignore-scripts']
    : ['pack', '--dry-run', '--json', '--ignore-scripts']
  const output = execFileSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const parsed = JSON.parse(output)
  const manifest = Array.isArray(parsed) ? parsed[0] : parsed
  if (!manifest || !Array.isArray(manifest.files)) {
    throw new Error('npm pack --dry-run 결과에서 파일 목록을 읽지 못했습니다.')
  }
  return manifest
}

function readTrackedEntries(staged = false) {
  const args = staged ? ['ls-files', '--cached', '-z'] : ['ls-files', '-co', '--exclude-standard', '-z']
  const files = git(args).split('\0').filter(Boolean)
  const entries = []
  for (const file of files) {
    if (staged) {
      try {
        entries.push({ path: normalizePath(file), content: git(['show', `:${file}`]) })
      } catch {
        // index에서 삭제된 파일은 공개될 내용이 없다.
      }
    } else {
      const absolute = resolve(ROOT, file)
      if (existsSync(absolute)) entries.push({ path: normalizePath(file), content: readFileSync(absolute, 'utf8') })
    }
  }
  return entries
}

function readPendingMetadata(commitMessageFile) {
  const parts = []
  for (const variable of ['GIT_AUTHOR_IDENT', 'GIT_COMMITTER_IDENT']) {
    try {
      parts.push(git(['var', variable]))
    } catch {
      // identity가 아직 없는 새 환경은 다른 git gate가 안내한다.
    }
  }
  if (commitMessageFile && existsSync(commitMessageFile)) parts.push(readFileSync(commitMessageFile, 'utf8'))
  if (!commitMessageFile) {
    try {
      parts.push(git(['log', '-1', '--format=%an%n%ae%n%cn%n%ce%n%B']))
    } catch {
      // 첫 커밋 전 저장소는 검사할 HEAD 메타데이터가 없다.
    }
  }
  return parts.join('\n')
}

function checkAllRefs() {
  const problems = []
  if (git(['rev-parse', '--is-shallow-repository']).trim() === 'true') {
    return ['Git 이력: shallow clone에서는 --all-refs 검사를 신뢰할 수 없음']
  }

  const metadata = [
    git(['log', '--all', '--format=%an%n%ae%n%cn%n%ce%n%B']),
    git(['for-each-ref', 'refs/tags', '--format=%(taggername)%n%(taggeremail)%n%(subject)%n%(body)']),
  ].join('\n')
  problems.push(...scanPublicText('Git 전체 메타데이터', metadata))

  for (const pathPart of PRIVATE_TRACKED_PATHS) {
    const history = git(['log', '--all', '--format=%H', '--', pathPart]).trim()
    if (history) problems.push(`${pathPart}: 과거 Git 이력에 개인 운영 경로가 남음`)
  }

  for (const forbidden of PRIVATE_TEXT_PATTERNS) {
    const history = git(['log', '--all', '--format=%H', `-G${forbidden.pattern.source}`, '--', '.']).trim()
    if (history) problems.push(`Git 전체 이력: ${forbidden.name}가 포함된 변경이 남음`)
  }
  return problems
}

export function checkPublicBoundary({ manifest, trackedEntries = [], metadata = '', allRefs = false } = {}) {
  const problems = []
  const packageFiles = manifest?.files?.map((file) => normalizePath(file.path)) ?? []

  if (manifest) {
    for (const file of packageFiles) {
      if (isPrivatePath(file)) problems.push(`${file}: 개인 운영 경로가 npm 패키지에 포함됨`)
      if (!file.startsWith('dist/') && !ALLOWED_PACKAGE_FILES.has(file)) {
        problems.push(`${file}: 허용되지 않은 npm 패키지 파일`)
      }
    }
    for (const required of REQUIRED_PACKAGE_BIN) {
      if (!packageFiles.includes(required)) problems.push(`${required}: npm 패키지 필수 실행 파일 누락`)
    }
    for (const file of packageFiles) {
      const absolute = resolve(ROOT, file)
      if (existsSync(absolute)) problems.push(...scanPublicText(`npm:${file}`, readFileSync(absolute, 'utf8')))
    }
  }

  for (const entry of trackedEntries) {
    if (isPrivatePath(entry.path)) problems.push(`${entry.path}: 공개 Git 트리에 개인 운영 경로가 포함됨`)
    problems.push(...scanPublicText(`git:${entry.path}`, entry.content))
  }
  problems.push(...scanPublicText('Git 메타데이터', metadata))
  if (allRefs) problems.push(...checkAllRefs())

  return { packageFiles, trackedFiles: trackedEntries.map((entry) => entry.path), problems: [...new Set(problems)] }
}

function main() {
  const argv = new Set(process.argv.slice(2))
  const staged = argv.has('--staged')
  const gitOnly = argv.has('--git-only') || staged
  const messageFlag = process.argv.indexOf('--commit-msg-file')
  const commitMessageFile = messageFlag >= 0 ? process.argv[messageFlag + 1] : undefined
  const result = checkPublicBoundary({
    manifest: gitOnly ? undefined : packManifest(),
    trackedEntries: readTrackedEntries(staged),
    metadata: readPendingMetadata(commitMessageFile),
    allRefs: argv.has('--all-refs'),
  })

  if (result.problems.length > 0) {
    console.error('공개 경계 검사 실패:')
    for (const problem of result.problems) console.error(`- ${problem}`)
    process.exitCode = 1
    return
  }
  console.log(`공개 경계 검사 통과: npm ${result.packageFiles.length}개 · Git ${result.trackedFiles.length}개`)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main()
