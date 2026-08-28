/*
 * 패턴 사전 규약 검사 (#527).
 *
 * 왜 필요한가: 규약이 문서로만 있으면 붕괴한다. 실제로 2일 만에 무너져 PAT-003 이 결번인 채
 * RULES.md 가 그 번호를 참조했고, 그 깨진 링크가 `vhk sync` 로 파생본 8개에 그대로 복제됐다.
 * 참조 무결성이 이 검사에서 가장 값이 큰 이유다 — 틀린 참조는 증폭된다.
 *
 * 검사 4종:
 *   ① PAT-NNN 파일의 frontmatter 필수 필드 + id 와 파일명 번호 일치
 *   ② 번호 중복 금지
 *   ③ 신규 파일은 PAT-NNN 형식 (기존 슬러그 파일은 개명 금지라 baseline 으로 허용)
 *   ④ 추적 문서가 참조하는 PAT-NNN 이 실존하는가
 *
 * 결번 자체는 막지 않는다 — 파일을 지우면 자연히 생기고, 참조가 없으면 해롭지 않다.
 * 해로운 건 "없는 번호를 가리키는 참조" 라서 ④가 그걸 직접 잡는다.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, basename } from 'node:path'

const ROOT = process.cwd()
const PATTERN_DIR = join(ROOT, 'docs', 'patterns')

/** PAT-NNN 도입 이전 파일들 — README 가 개명 금지(append-only)로 명시. 신규 추가는 이 목록 밖이라 차단된다. */
export const LEGACY_FILES = new Set([
  'auth-npm-scoped-publish-404.md',
  'build-cli-coldstart-lazy-heavy-dep.md',
  'build-exec-timeout-etimedout.md',
  'build-json-parse-bom-strip.md',
  'build-release-tool-forced-version-bump.md',
  'build-version-runtime-read.md',
  'env-bash-tool-vs-powershell-heredoc.md',
  'env-windows-cmd-shim-node20.md',
  'env-windows-filename-sanitize.md',
  'git-crlf-normalize-before-compare.md',
  'git-diff-since-no-op.md',
  'state-single-chokepoint-guard.md',
  'test-gate-derive-not-hardcode.md',
  'ux-local-date-vs-utc-timestamp.md',
  'ux-nontty-interactive-guard.md',
  'ux-publish-stdio-inherit.md',
])

/** PAT-NNN 파일에 요구하는 frontmatter 필드 (docs/patterns/README.md 규약). */
export const REQUIRED_FIELDS = [
  'id', '패턴명', '카테고리', '증상', '원인', '해결',
  '적용조건', '출처프로젝트', '태그', '발견일', '출처DevLog',
]

/** 레거시 파일에는 PAT-NNN 도입 때 생긴 필드를 소급 요구하지 않는다. */
export const LEGACY_REQUIRED_FIELDS = ['패턴명', '카테고리', '출처프로젝트', '태그', '발견일']

export const PATTERN_FILE_RE = /^PAT-(\d{3})-[a-z0-9-]+\.md$/

/** frontmatter 의 최상위 키만 뽑는다(값은 여러 줄일 수 있어 키 존재만 본다). */
export function frontmatterKeys(content) {
  if (!content.startsWith('---')) return null
  const end = content.indexOf('\n---', 3)
  if (end === -1) return null
  const block = content.slice(3, end)
  const keys = []
  for (const line of block.split('\n')) {
    const m = line.match(/^([^\s:][^:]*):/)
    if (m) keys.push(m[1].trim())
  }
  return keys
}

export function frontmatterValue(content, key) {
  const end = content.indexOf('\n---', 3)
  const block = content.slice(3, end === -1 ? undefined : end)
  // `\s`는 줄바꿈도 먹어 빈 `id:`가 다음 필드 전체를 값으로 삼을 수 있다. 수평 공백만 허용한다.
  const m = block.match(new RegExp(`^${key}:[\\t ]*(.*)$`, 'm'))
  return m ? m[1].trim() : null
}

export function referencesInMarkdown(rel, content) {
  const references = content.match(/PAT-\d{3}/g) ?? []
  const normalized = rel.replace(/\\/g, '/')
  if (!normalized.startsWith('docs/patterns/') || basename(normalized) === 'README.md') return references
  const own = basename(normalized).match(PATTERN_FILE_RE)
  if (!own) return references
  const ownId = `PAT-${own[1]}`
  return references.filter((reference) => reference !== ownId)
}

export function referencesFromPatternFiles(files) {
  return files.flatMap(({ name, content }) =>
    referencesInMarkdown(`docs/patterns/${name}`, content))
}

/**
 * @param {{name: string, content: string}[]} files 패턴 디렉터리의 .md (README 제외)
 * @param {string[]} references 추적 문서에서 발견한 PAT-NNN 참조
 * @returns {string[]} 위반 목록(빈 배열이면 통과)
 */
export function judge(files, references) {
  const violations = []
  const numbers = new Map()

  for (const { name, content } of files) {
    const keys = frontmatterKeys(content)
    if (keys === null) {
      violations.push(`${name} — frontmatter 가 없습니다`)
      continue
    }
    const match = name.match(PATTERN_FILE_RE)
    if (!match) {
      if (!LEGACY_FILES.has(name)) {
        violations.push(`${name} — 신규 패턴은 PAT-NNN-영문명.md 형식이어야 합니다 (docs/patterns/README.md)`)
      }
      for (const field of LEGACY_REQUIRED_FIELDS) {
        if (!keys.includes(field)) violations.push(`${name} — frontmatter 필드 누락: ${field}`)
      }
      continue
    }
    const num = match[1]
    if (numbers.has(num)) violations.push(`PAT-${num} 번호 중복: ${numbers.get(num)} · ${name}`)
    else numbers.set(num, name)

    for (const field of REQUIRED_FIELDS) {
      if (!keys.includes(field)) violations.push(`${name} — frontmatter 필드 누락: ${field}`)
    }
    const id = frontmatterValue(content, 'id')
    if (id !== `PAT-${num}`) {
      violations.push(`${name} — frontmatter id(${id})가 파일명 번호(PAT-${num})와 다릅니다`)
    }
  }

  // ④ 참조 무결성 — 틀린 참조는 sync 로 파생본에 복제되므로 여기서 끊는다.
  const existing = new Set([...numbers.keys()].map((n) => `PAT-${n}`))
  for (const ref of new Set(references)) {
    if (!existing.has(ref)) violations.push(`${ref} 를 참조하지만 docs/patterns/ 에 그 번호가 없습니다`)
  }
  return violations
}

function trackedMarkdown() {
  const out = execFileSync('git', ['ls-files', '-z', '--', '*.md'], { encoding: 'utf-8', cwd: ROOT })
  return out.split('\0').filter(Boolean)
}

if (existsSync(PATTERN_DIR)) {
  const files = readdirSync(PATTERN_DIR)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((name) => ({ name, content: readFileSync(join(PATTERN_DIR, name), 'utf-8') }))

  // readdir 결과를 먼저 보므로 아직 Git에 추가하지 않은 새 패턴도 내부 참조 검사를 받는다.
  const references = referencesFromPatternFiles(files)
  try {
    for (const rel of trackedMarkdown()) {
      const text = readFileSync(join(ROOT, rel), 'utf-8')
      // 패턴 문서도 내부의 다른 PAT 참조는 검사한다. 자기 파일 번호 선언만 제외한다.
      references.push(...referencesInMarkdown(rel, text))
    }
  } catch (error) {
    // fail-open: git 이 없거나 얕은 클론이면 추적 문서 조회만 건너뛴다. 로컬 패턴 참조 검사는 보존한다.
    const message = error instanceof Error ? error.message : String(error)
    process.stdout.write(`참조 무결성 검사 생략(git 조회 실패): ${message}\n`)
  }

  const violations = judge(files, references)
  if (violations.length > 0) {
    process.stderr.write(`패턴 사전 규약 위반 (#527):\n${violations.join('\n')}\n`)
    process.exitCode = 1
  }
}
