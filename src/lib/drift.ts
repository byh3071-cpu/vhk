import fs from 'node:fs'
import path from 'node:path'
import { parseRulesMd, deriveProjectName, SYNC_TARGETS } from '../commands/sync.js'
import { gitOut } from './git-repo.js'

/**
 * 드리프트 = sync 원본(RULES.md)과 생성 파일이 조용히 어긋난 상태, 또는 context.md 가
 * 코드보다 낡은 상태. 전부 **읽기 전용 감지** — 자동 수정 안 함.
 */

/**
 * 비교용 정규화 — CRLF→LF + 끝 공백/빈줄 제거.
 * `.gitattributes` 없고 core.autocrlf=true 인 환경에서 디스크 파일이 CRLF 로 체크아웃되어
 * LF 재생성본과 매번 어긋나는 **거짓 드리프트**를 막는다. (줄 내용은 안 건드림.)
 */
export function normalizeForCompare(s: string): string {
  const normalized = s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '')
  return normalized.length === 0 ? '' : `${normalized}\n`
}

export type RuleDriftStatus = 'drifted' | 'ok' | 'missing'
export interface RuleDriftDifference {
  line: number
  expected: string | null
  actual: string | null
}
export interface RuleDriftResult {
  path: string
  status: RuleDriftStatus
  /** 정규화 후 서로 다른 줄. drifted 일 때만 존재한다. */
  differences?: RuleDriftDifference[]
  /** 전체 차이 계산이 안전 상한을 넘어 첫 상이 지점만 반환했는지 여부. */
  fullDiffLimited?: boolean
}

function comparableLines(content: string): string[] {
  const lines = normalizeForCompare(content).split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines
}

type ComparableLine = { line: number; content: string }

const MAX_LCS_CELLS = 4_000_000

function pairDifferenceHunk(
  expected: ComparableLine[],
  actual: ComparableLine[],
): RuleDriftDifference[] {
  const differences: RuleDriftDifference[] = []
  const count = Math.max(expected.length, actual.length)
  for (let index = 0; index < count; index += 1) {
    const expectedLine = expected[index]
    const actualLine = actual[index]
    if (expectedLine?.content === actualLine?.content) continue
    differences.push({
      line: expectedLine?.line ?? actualLine?.line ?? 1,
      expected: expectedLine?.content ?? null,
      actual: actualLine?.content ?? null,
    })
  }
  return differences
}

function lcsDifferences(
  expectedLines: ComparableLine[],
  actualLines: ComparableLine[],
): RuleDriftDifference[] {
  const lcs = Array.from(
    { length: expectedLines.length + 1 },
    () => new Uint32Array(actualLines.length + 1),
  )
  for (let expectedIndex = expectedLines.length - 1; expectedIndex >= 0; expectedIndex -= 1) {
    for (let actualIndex = actualLines.length - 1; actualIndex >= 0; actualIndex -= 1) {
      lcs[expectedIndex][actualIndex] = expectedLines[expectedIndex].content === actualLines[actualIndex].content
        ? lcs[expectedIndex + 1][actualIndex + 1] + 1
        : Math.max(lcs[expectedIndex + 1][actualIndex], lcs[expectedIndex][actualIndex + 1])
    }
  }

  const differences: RuleDriftDifference[] = []
  let expectedIndex = 0
  let actualIndex = 0
  let expectedHunk: ComparableLine[] = []
  let actualHunk: ComparableLine[] = []
  const flushHunk = () => {
    differences.push(...pairDifferenceHunk(expectedHunk, actualHunk))
    expectedHunk = []
    actualHunk = []
  }

  while (expectedIndex < expectedLines.length && actualIndex < actualLines.length) {
    if (expectedLines[expectedIndex].content === actualLines[actualIndex].content) {
      flushHunk()
      expectedIndex += 1
      actualIndex += 1
    } else if (lcs[expectedIndex + 1][actualIndex] >= lcs[expectedIndex][actualIndex + 1]) {
      expectedHunk.push(expectedLines[expectedIndex])
      expectedIndex += 1
    } else {
      actualHunk.push(actualLines[actualIndex])
      actualIndex += 1
    }
  }
  while (expectedIndex < expectedLines.length) {
    expectedHunk.push(expectedLines[expectedIndex])
    expectedIndex += 1
  }
  while (actualIndex < actualLines.length) {
    actualHunk.push(actualLines[actualIndex])
    actualIndex += 1
  }
  flushHunk()
  return differences
}

function findRuleDriftDifferences(
  expected: string,
  actual: string,
  fullDiff: boolean,
): { differences: RuleDriftDifference[]; fullDiffLimited: boolean } {
  const expectedLines = comparableLines(expected)
  const actualLines = comparableLines(actual)
  const firstDifference = (): RuleDriftDifference[] => {
    const lineCount = Math.max(expectedLines.length, actualLines.length)
    for (let index = 0; index < lineCount; index += 1) {
      const expectedLine = expectedLines[index] ?? null
      const actualLine = actualLines[index] ?? null
      if (expectedLine !== actualLine) {
        return [{ line: index + 1, expected: expectedLine, actual: actualLine }]
      }
    }
    return []
  }
  if (!fullDiff) return { differences: firstDifference(), fullDiffLimited: false }

  const expectedComparable = expectedLines.map((content, index) => ({ line: index + 1, content }))
  const actualComparable = actualLines.map((content, index) => ({ line: index + 1, content }))
  const cells = (expectedLines.length + 1) * (actualLines.length + 1)
  if (cells > MAX_LCS_CELLS) {
    return { differences: firstDifference(), fullDiffLimited: true }
  }
  return {
    differences: lcsDifferences(expectedComparable, actualComparable),
    fullDiffLimited: false,
  }
}

export interface RuleDriftOptions {
  /** true면 모든 줄 차이를 정렬한다. 기본은 첫 상이 지점만 계산한다. */
  fullDiff?: boolean
}

/**
 * 규칙 드리프트 점검 — RULES.md 에서 **재생성한 기대값** vs 디스크 파일 비교.
 * 다르면(수동수정·RULES변경·vhk업그레이드 무엇이든) 'drifted' = "다시 sync 필요".
 * RULES.md 없으면 점검 불가(checked=false). 기대값을 박지 않고 매번 재생성 = 하드코딩 아님.
 */
export function checkRuleDrift(
  rootDir: string,
  options: RuleDriftOptions = {},
): { checked: boolean; results: RuleDriftResult[] } {
  const rulesPath = path.join(rootDir, 'RULES.md')
  if (!fs.existsSync(rulesPath)) return { checked: false, results: [] }

  const rulesContent = fs.readFileSync(rulesPath, 'utf-8')
  const sections = parseRulesMd(rulesContent)
  const projectName = deriveProjectName(rulesContent)

  const results: RuleDriftResult[] = []
  for (const target of SYNC_TARGETS) {
    const fullPath = path.join(rootDir, target.path)
    if (!fs.existsSync(fullPath)) {
      results.push({ path: target.path, status: 'missing' })
      continue
    }
    // buildSyncPlan 과 같은 생성 함수·같은 rootDir 인자를 쓴다. AGENTS.md 의 compact/ecosystem
    // 조건이 호출부마다 달라지면 sync 직후에도 doctor 가 영구 drift 로 오판한다(#519).
    const expected = normalizeForCompare(target.generate(sections, projectName, rootDir))
    const actual = normalizeForCompare(fs.readFileSync(fullPath, 'utf-8'))
    if (expected === actual) {
      results.push({ path: target.path, status: 'ok' })
    } else {
      const comparison = findRuleDriftDifferences(expected, actual, options.fullDiff === true)
      results.push({
        path: target.path,
        status: 'drifted',
        differences: comparison.differences,
        ...(comparison.fullDiffLimited ? { fullDiffLimited: true } : {}),
      })
    }
  }
  return { checked: true, results }
}

/** context.md 푸터에 박는 git 마커 키. context.ts(쓰기)·drift(읽기) 공유 상수. */
export const CONTEXT_GIT_MARKER = 'vhk-context-git'
const CONTEXT_PATH = '.vhk/context.md'

/** context.md 본문에서 생성 시점 git sha 추출 (없으면 null) — 순수, 테스트용. */
export function extractContextSha(content: string): string | null {
  const m = content.match(new RegExp(`${CONTEXT_GIT_MARKER}:\\s*([0-9a-f]{7,40})`))
  return m ? m[1] : null
}

export interface ContextDriftResult {
  checked: boolean
  stale: boolean
  generatedSha?: string
  currentSha?: string
}

export interface DerivedFreshnessResult {
  checked: boolean
  stale: boolean
  derivedPath?: string
  sourcePath?: string
  ageMs?: number
}

// `vhk goal next`가 적어 둔 원본 goal의 mtime과 next-task 파생본을 비교한다.
// 파일 안의 경로는 사용자가 수정할 수 있으므로 레포 밖을 가리키면 읽지 않는다.
export function checkNextTaskFreshness(rootDir: string): DerivedFreshnessResult {
  const derivedRelative = path.join('docs', 'state', 'next-task.md')
  const derivedPath = path.join(rootDir, derivedRelative)
  if (!fs.existsSync(derivedPath)) return { checked: false, stale: false }

  let content: string
  try {
    content = fs.readFileSync(derivedPath, 'utf-8')
  } catch {
    return { checked: false, stale: false }
  }
  const match = content.match(/^\s*file:\s*(.+?)\s*$/m)
  if (!match) return { checked: false, stale: false }

  const root = path.resolve(rootDir)
  const source = path.resolve(rootDir, match[1].trim())
  const relative = path.relative(root, source)
  if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(source)) {
    return { checked: false, stale: false }
  }

  try {
    const derivedMtime = fs.statSync(derivedPath).mtimeMs
    const sourceMtime = fs.statSync(source).mtimeMs
    return {
      checked: true,
      stale: sourceMtime > derivedMtime,
      derivedPath: derivedRelative.replace(/\\/g, '/'),
      sourcePath: relative.replace(/\\/g, '/'),
      ageMs: Math.max(0, sourceMtime - derivedMtime),
    }
  } catch {
    return { checked: false, stale: false }
  }
}

/**
 * context.md 가 **내용으로** 반영하는 추적 경로 (context.ts 생성 로직 기준).
 * - package.json → 기술 스택 섹션 (deps/name/version)
 * - goals/       → Active Goal 섹션 (frontmatter)
 * - docs/state/learnings.md → Recent Learnings 섹션
 * 디렉토리 구조 섹션은 파일 **추가/삭제/이름변경** 시만 바뀌므로 별도 ADR 필터로 점검.
 * (VHK 명령어=하드코딩, memory/HARD_STOP=.vhk gitignore → 추적 안 됨, 여기 제외.)
 */
const CONTEXT_SOURCE_PATHS = ['package.json', 'goals', 'docs/state/learnings.md']

/**
 * generatedSha → HEAD 사이에 context.md 가 반영하는 소스가 실제로 바뀌었나.
 * (1) content 경로 내용 변경(M/A/D)  OR  (2) 추적트리 파일 추가/삭제/이름변경(ADR).
 * git diff --name-only 출력이 비어있지 않으면 변경. `--quiet`+필터 exit-code 모호성을 피하려고
 * 출력 비교 방식 사용. genSha 유실(history rewrite 등)이면 gitOut 이 throw → 호출부에서 skip.
 */
function contextSourcesChanged(generatedSha: string, rootDir: string): boolean {
  const content = gitOut(
    ['diff', '--name-only', generatedSha, 'HEAD', '--', ...CONTEXT_SOURCE_PATHS],
    rootDir
  ).trim()
  if (content) return true
  const structural = gitOut(
    ['diff', '--name-only', '--diff-filter=ADR', generatedSha, 'HEAD'],
    rootDir
  ).trim()
  return structural.length > 0
}

/**
 * 맥락 드리프트 점검 — context.md 생성 이후 **반영 소스가 실제로 바뀐 경우만** stale.
 * 단순 HEAD 변동(README 오타 등 무관 커밋)으로는 stale 아님 = 노이즈 제거.
 * context.md 없음 / sha 마커 없음(옛 파일) / git 아님 / diff 불가 → 점검 불가(checked=false).
 */
export function checkContextDrift(rootDir: string): ContextDriftResult {
  const ctxPath = path.join(rootDir, CONTEXT_PATH)
  if (!fs.existsSync(ctxPath)) return { checked: false, stale: false }

  const generatedSha = extractContextSha(fs.readFileSync(ctxPath, 'utf-8'))
  if (!generatedSha) return { checked: false, stale: false }

  let currentSha: string
  try {
    currentSha = gitOut(['rev-parse', 'HEAD'], rootDir).trim()
  } catch {
    return { checked: false, stale: false }
  }
  if (!currentSha) return { checked: false, stale: false }

  // 짧은 sha 허용 — 한쪽이 다른 쪽의 접두면 같은 커밋 = 변동 없음 (git diff 불필요).
  if (currentSha.startsWith(generatedSha) || generatedSha.startsWith(currentSha)) {
    return { checked: true, stale: false, generatedSha, currentSha }
  }

  // HEAD 가 앞섰을 때만 context 반영 소스가 실제로 바뀌었는지 file-change 로 확인.
  let stale: boolean
  try {
    stale = contextSourcesChanged(generatedSha, rootDir)
  } catch {
    return { checked: false, stale: false } // genSha 유실 등 → 점검 불가
  }
  return { checked: true, stale, generatedSha, currentSha }
}
