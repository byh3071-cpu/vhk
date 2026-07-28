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
  // `.claude/skills/overnight-vhk-auto/` 는 113-T8 로 추적 전환됐다.
  // 과거 이력에 남은 옛 버전(개인 절대경로 포함)은 아래 checkAllRefs 가 계속 잡는다 —
  // 이 목록에서 뺄 수 없다. 현재 트리 검사만 면제하려고 PRIVATE_CURRENT_EXEMPT 로 분리한다.
  'docs/prompts/autonomy/',
]

/**
 * PRIVATE_TRACKED_PATHS 에 걸리지만 **현재 트리에서는 허용**하는 경로.
 *
 * why: 113-T8 로 야간 지휘 스킬을 저장소 SoT 로 승격했다(글로벌 전용은 동기화 사각지대라
 * 낡은 카드 번호가 그대로 남았다). 새 버전은 개인 절대경로를 환경변수로 빼 공개 가능하지만,
 * **과거 이력에 남은 옛 버전은 개인 경로를 포함**하므로 이력 검사(checkAllRefs)는 유지해야 한다.
 * 그래서 목록에서 빼는 대신 현재 트리 검사만 면제한다.
 */
const PRIVATE_CURRENT_EXEMPT = ['.claude/skills/overnight-vhk-auto/']

// 현재 추적·npm 패키지만 검사하고 **과거 이력은 면제**하는 경로.
//
// why 분리: `.agents/CORE-RULES.md` 는 개발자 홈의 범용 규칙 파일에서 재생성되므로 추적하면
// 개인 규칙 원문이 공개된다. 앞으로 추적되는 것은 막아야 한다. 다만 지금까지 커밋돼 온 내용은
// 번들 스냅샷(개인정보 없음)이라 이력 재작성 대상이 아니다. PRIVATE_TRACKED_PATHS 에 넣으면
// 과거 이력 검사까지 걸려 릴리스 워크플로가 영구 실패하므로 별도 목록으로 둔다.
const PRIVATE_CURRENT_PATHS = ['.agents/CORE-RULES.md']

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

/**
 * 알려진 이력 예외 — **커밋 메타데이터 검사에서만** 제외하는 이미 공개된 커밋.
 *
 * why 이런 게 필요한가: 공개 저장소에 이미 올라간 커밋의 작성자 정보는 되돌리려면
 * main 이력 재작성 + force push 가 필요하다. 그런데 이 저장소는 fork 가 존재해
 * 재작성해도 GitHub fork 네트워크에 옛 객체가 남는다(2026-07-28 실측) — 즉 비용은 큰데
 * 노출은 안 끝난다. 그렇다고 방치하면 릴리스 워크플로가 **영구 red** 가 되고,
 * 늘 빨간 게이트는 사람이 꺼버린다(이 저장소가 이미 두 번 겪은 실패 형태 — 이슈 #515).
 *
 * 그래서 조용히 우회하는 대신 **선언한다.** 작업 단위 117("검사 의도 선언")과 같은 규율이다.
 *   - 예외는 SHA 단위다. 패턴을 끄지 않으므로 **다른 모든 커밋에는 검사가 그대로 작동**한다.
 *   - 적용 범위는 커밋 메타데이터뿐이다. 파일 내용(blob)·추적 경로 검사에는 예외가 없다.
 *   - `main()` 이 예외 건수를 **통과·실패와 무관하게 항상 출력**한다. 조용해지면 안 된다.
 *
 * ⚠️ 이 목록은 늘어나면 안 된다. 새 위반은 예외가 아니라 수정 대상이다.
 */
export const KNOWN_HISTORY_EXCEPTIONS = [
  {
    sha: 'db6976592570d1b1143e329410d536e809d790de',
    label: '커밋 작성자 이메일이 개인 Gmail',
    // committer 는 noreply@github.com 인데 author 만 개인 Gmail 이다 = GitHub 웹에서
    // squash 머지될 때 작성자가 계정 기본 이메일로 교체된 것(#537). 2026-07-27 이력
    // 재작성 **이후**에 유입됐다.
    reason: 'GitHub squash 머지가 작성자를 계정 기본 이메일로 교체 (#537, 재작성 이후 유입)',
    pending: '정정하려면 main 이력 재작성 + force push 필요 — 사람 판단 대기',
  },
]

const RECORD_SEP = '\u001E'
const FIELD_SEP = '\u001F'

/**
 * `<sha>\x1f<메타데이터>\x1e` 레코드 스트림에서 예외 SHA 레코드를 걷어낸다.
 * 구분자를 SHA 앞에 붙여 뽑는 이유: 메타데이터를 통짜 문자열로 스캔하면 어느 커밋이
 * 걸렸는지 알 수 없어 커밋 단위 예외가 불가능하다.
 */
export function stripKnownExceptions(raw, exceptions = KNOWN_HISTORY_EXCEPTIONS) {
  const skip = new Set(exceptions.map((e) => e.sha))
  const kept = []
  for (const record of String(raw).split(RECORD_SEP)) {
    if (!record.trim()) continue
    const cut = record.indexOf(FIELD_SEP)
    // 구분자가 없으면 SHA 를 특정할 수 없다 → 예외 판정 불가이므로 그대로 검사 대상에 남긴다.
    if (cut < 0) {
      kept.push(record)
      continue
    }
    if (skip.has(record.slice(0, cut).trim())) continue
    kept.push(record.slice(cut + 1))
  }
  return kept.join('\n')
}

const UUID_PATTERN = /\b[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\b/giu
const ZERO_UUID = /^0{32}$/u
const NON_ZERO_UUID_HISTORY_PATTERN = String.raw`\b(?!0{8}-?0{4}-?0{4}-?0{4}-?0{12}\b)[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\b`

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

export function buildHistorySearchPattern() {
  return [
    ...PRIVATE_TEXT_PATTERNS.map((forbidden) => `(?:${forbidden.pattern.source})`),
    `(?:${NON_ZERO_UUID_HISTORY_PATTERN})`,
  ].join('|')
}

function historyContainsPrivateText() {
  const commits = git(['rev-list', '--all']).trim().split(/\s+/u).filter(Boolean)
  const pattern = buildHistorySearchPattern()
  const batchSize = 48

  for (let offset = 0; offset < commits.length; offset += batchSize) {
    const batch = commits.slice(offset, offset + batchSize)
    try {
      git(['grep', '-I', '-P', '-i', '-l', '-e', pattern, ...batch, '--'])
      return true
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'status' in error && error.status === 1) continue
      throw error
    }
  }
  return false
}

function matchesPath(normalized, parts) {
  return parts.some((part) => {
    const target = part.toLowerCase()
    return target.endsWith('/') ? normalized.startsWith(target) : normalized === target
  })
}

function isPrivatePath(file) {
  const normalized = normalizePath(file).toLowerCase()
  if (matchesPath(normalized, PRIVATE_CURRENT_EXEMPT)) return false
  return matchesPath(normalized, [...PRIVATE_TRACKED_PATHS, ...PRIVATE_CURRENT_PATHS])
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
  if (commitMessageFile) {
    for (const variable of ['GIT_AUTHOR_IDENT', 'GIT_COMMITTER_IDENT']) {
      try {
        parts.push(git(['var', variable]))
      } catch {
        // identity가 아직 없는 새 환경은 다른 git gate가 안내한다.
      }
    }
    if (existsSync(commitMessageFile)) parts.push(readFileSync(commitMessageFile, 'utf8'))
    return parts.join('\n')
  }
  try {
    parts.push(git(['log', '-1', '--format=%an%n%ae%n%cn%n%ce%n%B']))
  } catch {
    // 첫 커밋 전 저장소는 검사할 HEAD 메타데이터가 없다.
  }
  return parts.join('\n')
}

function checkAllRefs() {
  const problems = []
  if (git(['rev-parse', '--is-shallow-repository']).trim() === 'true') {
    return ['Git 이력: shallow clone에서는 --all-refs 검사를 신뢰할 수 없음']
  }

  // SHA 를 레코드 앞에 붙여 뽑아야 커밋 단위 예외(KNOWN_HISTORY_EXCEPTIONS)를 걸 수 있다.
  // 통짜로 스캔하면 어느 커밋이 걸렸는지 알 수 없어 전부 아니면 전무가 된다.
  const commitMetadata = stripKnownExceptions(
    git(['log', '--all', '--format=%H%x1F%an%n%ae%n%cn%n%ce%n%B%x1E']),
  )
  const metadata = [
    commitMetadata,
    git(['for-each-ref', 'refs/tags', '--format=%(taggername)%n%(taggeremail)%n%(subject)%n%(body)']),
  ].join('\n')
  problems.push(...scanPublicText('Git 전체 메타데이터', metadata))

  for (const pathPart of PRIVATE_TRACKED_PATHS) {
    const history = git(['log', '--all', '--format=%H', '--', pathPart]).trim()
    if (history) problems.push(`${pathPart}: 과거 Git 이력에 개인 운영 경로가 남음`)
  }

  if (historyContainsPrivateText()) problems.push('Git 전체 이력: 개인 텍스트가 포함된 blob이 남음')
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

/**
 * 알려진 예외를 사람에게 노출한다. 예외가 있다는 사실이 조용해지면 그때부터 영구 회피다.
 * `--all-refs` 일 때만 실제로 적용되므로 그 사실도 같이 알린다.
 */
function reportKnownExceptions(allRefs) {
  if (KNOWN_HISTORY_EXCEPTIONS.length === 0) {
    console.log('알려진 이력 예외: 0건')
    return
  }
  const scope = allRefs ? '적용됨' : '이번 실행에서는 미적용 — --all-refs 에서만 쓰인다'
  console.log(`알려진 이력 예외 ${KNOWN_HISTORY_EXCEPTIONS.length}건 (${scope}):`)
  for (const e of KNOWN_HISTORY_EXCEPTIONS) {
    console.log(`  - ${e.sha.slice(0, 7)} ${e.label}`)
    console.log(`      사유: ${e.reason}`)
    console.log(`      남은 일: ${e.pending}`)
  }
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

  // 예외는 통과·실패와 무관하게 **항상** 보여준다. 조용해지는 순간 영구 회피가 된다.
  reportKnownExceptions(argv.has('--all-refs'))

  if (result.problems.length > 0) {
    console.error('공개 경계 검사 실패:')
    for (const problem of result.problems) console.error(`- ${problem}`)
    process.exitCode = 1
    return
  }
  console.log(`공개 경계 검사 통과: npm ${result.packageFiles.length}개 · Git ${result.trackedFiles.length}개`)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main()
