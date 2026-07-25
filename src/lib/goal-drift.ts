import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, sep } from 'node:path'
import { listGoals, type GoalStatus } from './goal-frontmatter.js'

// Goal 43: goal 상태 ↔ 코드 현실 드리프트 게이트.
//
// 신호 A (원본): check-goal-<id>.mjs 에 custom must() 호출이 있는데 status: NOT_STARTED.
// 신호 B (dogfood 2026-07-25): goals/*.md 본문 백틱 경로가 디스크에 존재하는데 NOT_STARTED.
//   소비자 레포(aroo 등)는 check-goal 스크립트 없이 goals MD만 쓰는 경우가 많아
//   신호 A만으로는 항상 0건(false negative). 경로 증거를 보조 신호로 추가.
//
// 보수적 설계(거짓 양성보다 미탐 선호):
//   - NOT_STARTED 만 본다. IN_PROGRESS/DONE/BLOCKED 는 대상 아님.
//   - 경로 증거는 확정 히트 ≥ PATH_EVIDENCE_MIN 일 때만(단일 aspirational 경로 오탐 방지).
//   - 경로 해석: exact → 흔한 prefix(lib/src/…) → basename 한정 탐색(노드 상한).

/** 경로 증거로 드리프트를 인정하기 위한 최소 히트 수. */
export const PATH_EVIDENCE_MIN = 2

/** basename 탐색 시 방문할 최대 파일/디렉터리 노드 수(성능 bound). */
const BASENAME_WALK_MAX_NODES = 4_000

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '.vhk',
])

/**
 * check-goal 스크립트 본문에 goal 고유 검증(custom `must()` 호출)이 있는지.
 * - 주석(`//`) 라인 무시.
 * - `const must = ...` **정의** 라인 제외(호출이 아님).
 * - 그 외 라인에 `must(` 가 있으면 = goal 고유 assertion = 구현 흔적.
 */
export function hasCustomGateAssertions(scriptContent: string): boolean {
  for (const raw of scriptContent.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('//')) continue
    if (/const\s+must\s*=/.test(line)) continue // must 헬퍼 정의 라인 — 호출 아님
    if (line.includes('must(')) return true // goal 고유 검증 호출 발견
  }
  return false
}

// Goal 53: 가드 신뢰도 — 정규식 shape 단언 측정.
const REGEX_SHAPE_ASSERTION = /must\([^)]*\/.*\/\.test/

/**
 * check-goal 본문에서 정규식 shape 단언(`must(/.../.test(...))`)의 개수와 예시(최대 5).
 */
export function countRegexAssertions(content: string): { count: number; examples: string[] } {
  const examples: string[] = []
  let count = 0
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('//')) continue
    if (/const\s+must\s*=/.test(line)) continue
    if (!line.includes('must(')) continue
    if (REGEX_SHAPE_ASSERTION.test(line)) {
      count++
      if (examples.length < 5) examples.push(line.slice(0, 100))
    }
  }
  return { count, examples }
}

/** check-goal 본문의 전체 `must()` 호출 수(정규식 비율의 분모). */
export function countMustAssertions(content: string): number {
  let count = 0
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('//')) continue
    if (/const\s+must\s*=/.test(line)) continue
    if (line.includes('must(')) count++
  }
  return count
}

export interface DriftCandidate {
  id: number
  title: string
  status: GoalStatus
  goalFile: string
  scriptFile: string
  reason: string
}

/** 백틱 안 문자열이 파일/디렉터리 상대경로처럼 보이는지. */
export function looksLikeRepoRelPath(raw: string): boolean {
  const s = raw.trim()
  if (!s || /\s/.test(s)) return false
  if (/^https?:\/\//i.test(s)) return false
  if (s.startsWith('#') || s.startsWith('@')) return false
  // 웹 경로(`/sign-in`)·절대경로는 레포 상대경로가 아님
  if (s.startsWith('/')) return false
  // 경로 구분자 또는 확장자(또는 글롭) — 순수 식별자(`zod`) 제외
  return /[\\/]/.test(s) || /\.\w{1,8}$/.test(s) || s.includes('*')
}

/** goal 본문에서 백틱 경로 후보를 추출(중복 제거, 등장 순). */
export function extractBacktickPaths(body: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const re = /`([^`\n]+)`/g
  for (const m of body.matchAll(re)) {
    const cand = m[1].trim().replace(/^\.\//, '')
    if (!looksLikeRepoRelPath(cand)) continue
    if (seen.has(cand)) continue
    seen.add(cand)
    out.push(cand)
  }
  return out
}

function globLastSegmentMatches(name: string, pattern: string): boolean {
  // 단순: `*` 만 지원(checkout-*). 정규식 escape 후 * → .*
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`).test(name)
}

/**
 * 상대경로가 projectRoot 아래 실재하는지.
 * 1) exact  2) 흔한 prefix 접합  3) 마지막 세그먼트 글롭  4) basename 한정 walk
 */
export function resolvePathEvidence(projectRoot: string, relPath: string): string | null {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\.\//, '')
  if (!normalized) return null

  const tryExact = (rel: string): string | null => {
    const abs = join(projectRoot, ...rel.split('/'))
    return existsSync(abs) ? rel : null
  }

  const hit = tryExact(normalized)
  if (hit) return hit

  // 축약 경로(`providers/image-openai.ts`) → lib/engine/providers/… 등
  const PREFIXES = ['lib', 'src', 'app', 'lib/engine', 'src/lib', 'packages']
  for (const prefix of PREFIXES) {
    const prefixed = `${prefix}/${normalized}`
    const pHit = tryExact(prefixed)
    if (pHit) return pHit
  }

  // `app/api/checkout-*` — 부모 dir 목록에서 글롭 매칭
  if (normalized.includes('*')) {
    const parent = dirname(normalized).replace(/\\/g, '/')
    const pat = basename(normalized)
    const parentAbs =
      parent === '.' ? projectRoot : join(projectRoot, ...parent.split('/'))
    if (existsSync(parentAbs)) {
      try {
        for (const name of readdirSync(parentAbs)) {
          if (globLastSegmentMatches(name, pat)) {
            return parent === '.' ? name : `${parent}/${name}`
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  // basename 탐색(노드 상한) — 축약/이동된 파일
  const base = basename(normalized)
  if (!base || base.includes('*')) return null
  let nodes = 0
  const stack = [projectRoot]
  while (stack.length > 0 && nodes < BASENAME_WALK_MAX_NODES) {
    const dir = stack.pop() as string
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    for (const name of entries) {
      nodes++
      if (nodes > BASENAME_WALK_MAX_NODES) break
      if (SKIP_DIR_NAMES.has(name)) continue
      const abs = join(dir, name)
      let st
      try {
        st = statSync(abs)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        stack.push(abs)
        continue
      }
      if (name === base) {
        return abs.slice(projectRoot.length + 1).split(sep).join('/')
      }
    }
  }
  return null
}

/** body 백틱 경로 중 디스크에 존재하는 것(해석된 상대경로). */
export function findExistingPathEvidence(body: string, projectRoot: string): string[] {
  const hits: string[] = []
  const seen = new Set<string>()
  for (const rel of extractBacktickPaths(body)) {
    const resolved = resolvePathEvidence(projectRoot, rel)
    if (!resolved || seen.has(resolved)) continue
    seen.add(resolved)
    hits.push(resolved)
  }
  return hits
}

/**
 * goals/ ↔ scripts/ (+ goals 본문 경로 증거) 를 대조해 드리프트 후보를 찾는다.
 * @param projectRoot 경로 증거 해석 루트(기본: goalsDir 의 부모)
 */
export function findStatusDriftCandidates(
  goalsDir: string,
  scriptsDir: string,
  projectRoot: string = dirname(goalsDir),
): DriftCandidate[] {
  const out: DriftCandidate[] = []
  for (const g of listGoals(goalsDir)) {
    const status = (g.frontmatter.status ?? 'NOT_STARTED')
    if (status !== 'NOT_STARTED') continue
    const id = g.frontmatter.id
    if (typeof id !== 'number') continue

    const scriptFile = join(scriptsDir, `check-goal-${id}.mjs`)
    let hasMust = false
    if (existsSync(scriptFile)) {
      try {
        hasMust = hasCustomGateAssertions(readFileSync(scriptFile, 'utf-8'))
      } catch {
        hasMust = false
      }
    }

    if (hasMust) {
      out.push({
        id,
        title: g.frontmatter.title ?? '',
        status,
        goalFile: g.filePath,
        scriptFile,
        reason:
          'status: NOT_STARTED 인데 check-goal 게이트에 goal 고유 검증(코드 구현 흔적)이 있음 — 구현됐는데 status 만 안 바뀐 드리프트 의심',
      })
      continue
    }

    const pathHits = findExistingPathEvidence(g.body, projectRoot)
    if (pathHits.length >= PATH_EVIDENCE_MIN) {
      out.push({
        id,
        title: g.frontmatter.title ?? '',
        status,
        goalFile: g.filePath,
        scriptFile: existsSync(scriptFile) ? scriptFile : '(no check-goal script)',
        reason: `status: NOT_STARTED 인데 goals 본문 경로 증거 ${pathHits.length}건 존재(${pathHits.slice(0, 3).join(', ')}${pathHits.length > 3 ? '…' : ''}) — 구현됐는데 status 만 안 바뀐 드리프트 의심`,
      })
    }
  }
  return out
}
