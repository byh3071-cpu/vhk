import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import { listGoals, type GoalStatus } from './goal-frontmatter.js'
import { listPendingProjectedTaskNumbers } from './goal-task-projection.js'

// Goal 43: goal 상태 ↔ 코드 현실 드리프트 게이트.
//
// 신호 A (원본): check-goal-<id>.mjs 에 custom must() 호출이 있는데 status: NOT_STARTED.
// 신호 B (작업 단위 112-T7, 2026-07-28): 카드 체크박스가 전부 완료인데 status: NOT_STARTED.
// 신호 C (dogfood 2026-07-25, 폴백): 본문 백틱 경로가 디스크에 존재하는데 NOT_STARTED.
//   소비자 레포(체크박스 없는 카드만 쓰는 경우)는 A·B 로 항상 0건(false negative)이라 남긴다.
//
// why 신호 C 가 폴백으로 밀렸나 (112-T7 실측):
//   계획 카드는 "앞으로 고칠 파일"의 경로를 인용하고 그 경로는 당연히 이미 존재한다.
//   즉 인용 경로의 존재는 구현 증거가 될 수 없고, 잘 쓴 계획 카드일수록 확실히 걸린다.
//   실측에서 신규 계획 카드 14장이 100% 오탐이었다. 체크박스가 있는 카드는 체크 상태가
//   훨씬 정확한 신호이므로, 경로 증거는 체크박스가 아예 없는 카드에서만 쓴다.
//
// 보수적 설계(거짓 양성보다 미탐 선호):
//   - NOT_STARTED 만 본다. IN_PROGRESS/DONE/BLOCKED 는 대상 아님.
//   - 체크박스는 **전부** 완료일 때만(진행 중 카드는 정상이므로 건드리지 않는다).
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

export type DriftKind = 'not-started-implemented' | 'done-pending-tasks'

export interface DriftCandidate {
  id: number
  title: string
  status: GoalStatus
  goalFile: string
  scriptFile: string
  reason: string
  kind?: DriftKind
}

/** 카드 본문의 마크다운 체크박스 집계. */
export interface CheckboxTally {
  total: number
  checked: number
}

const CHECKBOX_LINE = /^\s*[-*]\s+\[( |x|X)\]\s/

/**
 * goal 카드 본문의 체크박스를 센다(티켓 · Completion Check 구분 없이 전부).
 * 구분을 두지 않는 이유: "전부 완료" 판정이 목적이라 섹션이 늘어나도 더 엄격해질 뿐이다.
 */
export function tallyCheckboxes(body: string): CheckboxTally {
  let total = 0
  let checked = 0
  for (const raw of body.split(/\r?\n/)) {
    const m = CHECKBOX_LINE.exec(raw)
    if (!m) continue
    total++
    if (m[1] !== ' ') checked++
  }
  return { total, checked }
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

type BasenameIndex = Map<string, string[]>

function buildBasenameIndex(projectRoot: string): BasenameIndex {
  const index: BasenameIndex = new Map()
  let nodes = 0
  const stack = [projectRoot]
  while (stack.length > 0 && nodes < BASENAME_WALK_MAX_NODES) {
    const dir = stack.pop() as string
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      // 권한·경합으로 읽을 수 없는 하위 경로만 제외하고 나머지 색인은 계속 만든다.
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
        // 스캔 도중 사라진 파일은 증거로 사용할 수 없으므로 건너뛴다.
        continue
      }
      if (st.isDirectory()) {
        stack.push(abs)
        continue
      }
      const rel = relative(projectRoot, abs).split(sep).join('/')
      const matches = index.get(name) ?? []
      matches.push(rel)
      index.set(name, matches)
    }
  }
  return index
}

function selectBasenameEvidence(normalized: string, candidates: string[]): string | null {
  if (candidates.length === 0) return null
  const requested = normalized.split('/')
  const requestedParents = requested.slice(0, -1)
  if (requestedParents.length === 0) return candidates.length === 1 ? candidates[0] : null

  const scored = candidates.map((candidate) => {
    const candidateParents = candidate.split('/').slice(0, -1)
    let score = 0
    while (
      score < requestedParents.length &&
      score < candidateParents.length &&
      requestedParents[requestedParents.length - 1 - score] ===
        candidateParents[candidateParents.length - 1 - score]
    ) {
      score++
    }
    return { candidate, score }
  })
  const bestScore = Math.max(...scored.map(({ score }) => score))
  if (bestScore === 0) return null
  const best = scored.filter(({ score }) => score === bestScore)
  return best.length === 1 ? best[0].candidate : null
}

/**
 * 상대경로가 projectRoot 아래 실재하는지.
 * 1) exact  2) 흔한 prefix 접합  3) 마지막 세그먼트 글롭  4) basename 한정 walk
 */
export function resolvePathEvidence(
  projectRoot: string,
  relPath: string,
  basenameIndex?: BasenameIndex,
): string | null {
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
        // 존재 확인 뒤 경합으로 디렉터리를 읽지 못하면 글롭 증거 없음으로 처리한다.
      }
    }
  }

  // basename 탐색(노드 상한) — 부모 suffix가 가장 잘 맞는 유일 후보만 증거로 인정한다.
  const base = basename(normalized)
  if (!base || base.includes('*')) return null
  const index = basenameIndex ?? buildBasenameIndex(projectRoot)
  return selectBasenameEvidence(normalized, index.get(base) ?? [])
}

/** body 백틱 경로 중 디스크에 존재하는 것(해석된 상대경로). */
export function findExistingPathEvidence(body: string, projectRoot: string): string[] {
  const hits: string[] = []
  const seen = new Set<string>()
  const basenameIndex = buildBasenameIndex(projectRoot)
  for (const rel of extractBacktickPaths(body)) {
    const resolved = resolvePathEvidence(projectRoot, rel, basenameIndex)
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

    const noScript = existsSync(scriptFile) ? scriptFile : '(no check-goal script)'

    // 신호 B — 체크박스가 있는 카드는 체크 상태가 경로 인용보다 정확한 신호다.
    const boxes = tallyCheckboxes(g.body)
    if (boxes.total > 0) {
      if (boxes.checked === boxes.total) {
        out.push({
          id,
          title: g.frontmatter.title ?? '',
          status,
          goalFile: g.filePath,
          scriptFile: noScript,
          reason: `status: NOT_STARTED 인데 카드 체크박스 ${boxes.total}개가 전부 완료 표시 — 구현됐는데 status 만 안 바뀐 드리프트 의심`,
        })
      }
      // 체크박스가 있으면 경로 증거는 보지 않는다 — 계획 카드의 인용 경로는 항상 존재하므로 오탐만 만든다.
      continue
    }

    // 신호 C (폴백) — 체크박스가 아예 없는 카드에서만.
    const pathHits = findExistingPathEvidence(g.body, projectRoot)
    if (pathHits.length >= PATH_EVIDENCE_MIN) {
      out.push({
        id,
        title: g.frontmatter.title ?? '',
        status,
        goalFile: g.filePath,
        scriptFile: noScript,
        reason: `status: NOT_STARTED 인데 goals 본문 경로 증거 ${pathHits.length}건 존재(${pathHits.slice(0, 3).join(', ')}${pathHits.length > 3 ? '…' : ''}) — 구현됐는데 status 만 안 바뀐 드리프트 의심`,
      })
    }
  }

  // #612: DONE 인데 134 문법 미완 Task 가 남은 역방향. 일반 `- [ ]` 체크박스는 안 본다
  // (112-T7 계획 카드 오탐과 같은 함정). 파싱 실패는 건너뛴다.
  for (const g of listGoals(goalsDir)) {
    const status = g.frontmatter.status ?? 'NOT_STARTED'
    if (status !== 'DONE') continue
    const id = g.frontmatter.id
    if (typeof id !== 'number') continue
    const pending = listPendingProjectedTaskNumbers({
      goalId: id,
      goalTitle: g.frontmatter.title ?? null,
      goalStatus: status,
      sourceRef: basename(g.filePath),
      markdown: g.body,
    })
    if (pending === null || pending.length === 0) continue
    out.push({
      id,
      title: g.frontmatter.title ?? '',
      status,
      goalFile: g.filePath,
      scriptFile: '(projected tasks)',
      kind: 'done-pending-tasks',
      reason: `status: DONE 인데 미완 Task ${pending.length}개(${pending.join(', ')}) — 완료 표시와 작업 목록이 어긋남`,
    })
  }
  return out
}
