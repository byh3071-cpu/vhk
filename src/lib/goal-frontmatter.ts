import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { stripBom } from './read-json.js'

// VHK goals/<n>-<name>.md frontmatter 표준. vspec/vooster 호환.
export type GoalStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'DONE'
  | 'BLOCKED'
  | 'CANCELED'
  | 'DEFERRED'
  | 'OBSERVING'

export const GOAL_STATUSES: readonly GoalStatus[] = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'DONE',
  'BLOCKED',
  'CANCELED',
  'DEFERRED',
  'OBSERVING',
] as const
export type GoalPriority = 'P0' | 'P1' | 'P2'
export type GoalType = 'goal' | 'meta'

export interface GoalFrontmatter {
  vhk_format?: number
  type?: GoalType
  id?: number
  title?: string
  status?: GoalStatus
  priority?: GoalPriority
  version?: string
  completed?: string
  /** 쉼표로 구분한 선행 Goal ID. flat frontmatter 계약을 유지하기 위해 문자열로 보존한다. */
  depends_on?: string
  // 알 수 없는 키는 string 으로 보존 (extra 필드 허용 — extension point).
  [key: string]: string | number | undefined
}

export interface ParsedGoal {
  filePath: string
  frontmatter: GoalFrontmatter
  body: string
}

// `---\n...\n---\n` 블록과 본문 분리. gray-matter 미사용 (의존성 추가 회피).
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

export function parseFrontmatter(content: string): {
  frontmatter: GoalFrontmatter
  body: string
} {
  const normalized = stripBom(content)
  const m = normalized.match(FRONTMATTER_RE)
  if (!m) return { frontmatter: {}, body: normalized }
  const fm = parseSimpleYaml(m[1])
  // closing `---\n` 직후의 잔여 개행 1~N 개는 파싱 아티팩트 — body 표현에서 제거.
  const body = (m[2] ?? '').replace(/^\r?\n+/, '')
  return { frontmatter: fm, body }
}

// 단순 `key: value` 한 줄 단위 파서. nested / list / multiline 미지원 — 의도적.
// frontmatter 가 복잡해지면 의존성 추가 검토 (현재는 flat 만 사용).
function parseSimpleYaml(yaml: string): GoalFrontmatter {
  const out: GoalFrontmatter = {}
  const lines = yaml.split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    // 양쪽 따옴표 제거 (single/double 둘 다).
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    // 숫자처럼 보이면 number 로 (파싱 실패 시 undefined — 호출자가 누락 판단).
    if (key === 'id' || key === 'vhk_format') {
      const n = Number(value)
      out[key] = Number.isFinite(n) ? n : undefined
    } else {
      out[key] = value
    }
  }
  return out
}

/** legacy / 비표준 status → GoalStatus. 매핑 불가면 null. */
export function normalizeLegacyStatus(raw: string): GoalStatus | null {
  const trimmed = raw.trim()
  if (GOAL_STATUSES.includes(trimmed as GoalStatus)) return trimmed as GoalStatus
  const key = trimmed.toLowerCase().replace(/\s+/g, '_')
  const map: Record<string, GoalStatus> = {
    active: 'IN_PROGRESS',
    done: 'DONE',
    pending: 'NOT_STARTED',
    canceled: 'CANCELED',
    cancelled: 'CANCELED',
    deferred: 'DEFERRED',
    observing: 'OBSERVING',
    blocked: 'BLOCKED',
    not_started: 'NOT_STARTED',
    in_progress: 'IN_PROGRESS',
  }
  return map[key] ?? null
}

export function inferGoalIdFromFilename(name: string): number | null {
  const m = name.match(/^(\d+)-/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

export interface GoalMigrateAction {
  file: string
  actions: string[]
}

/** 단일 goal 파일 migrate 계획. 변경 없으면 null. */
export function planGoalFileMigrate(filePath: string, content: string): {
  actions: string[]
  nextContent: string
} | null {
  const name = filePath.replace(/^.*[/\\]/, '')
  if (name === '_meta.md') return null
  const { frontmatter } = parseFrontmatter(content)
  if (frontmatter.type === 'meta') return null

  const patch: Record<string, string | number> = {}
  const actions: string[] = []

  if (frontmatter.type !== 'goal') {
    patch.type = 'goal'
    actions.push("type: goal 추가")
  }

  if (typeof frontmatter.id !== 'number') {
    const inferred = inferGoalIdFromFilename(name)
    if (inferred != null) {
      patch.id = inferred
      actions.push(`id: ${inferred} (파일명)`)
    }
  }

  const rawStatus = frontmatter.status
  if (typeof rawStatus === 'string') {
    const normalized = normalizeLegacyStatus(rawStatus)
    if (normalized && normalized !== rawStatus) {
      patch.status = normalized
      actions.push(`status: ${rawStatus} → ${normalized}`)
    }
  }

  if (actions.length === 0) return null

  let nextContent = content
  for (const [key, value] of Object.entries(patch)) {
    nextContent = patchGoalFrontmatter(nextContent, key, value)
  }
  return { actions, nextContent }
}

/** frontmatter 단일 필드 추가/갱신 (status 전용 updateFrontmatterStatus 의 일반형). */
export function patchGoalFrontmatter(
  content: string,
  key: string,
  value: string | number,
): string {
  const normalized = stripBom(content)
  const m = normalized.match(FRONTMATTER_RE)
  if (!m) return content
  const fmRaw = m[1]
  const body = m[2] ?? ''
  const lines = fmRaw.split(/\r?\n/)
  let hadKey = false
  const rendered = typeof value === 'number' ? String(value) : value

  const updated = lines.map((raw) => {
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('#')) return raw
    const idx = trimmed.indexOf(':')
    if (idx <= 0) return raw
    const lineKey = trimmed.slice(0, idx).trim()
    if (lineKey === key) {
      hadKey = true
      return `${key}: ${rendered}`
    }
    return raw
  })

  if (!hadKey) updated.push(`${key}: ${rendered}`)
  return `---\n${updated.join('\n')}\n---\n${body}`
}

export function parseGoalFile(filePath: string): ParsedGoal | null {
  if (!existsSync(filePath)) return null
  try {
    const content = readFileSync(filePath, 'utf-8')
    const { frontmatter, body } = parseFrontmatter(content)
    return { filePath, frontmatter, body }
  } catch {
    return null
  }
}

// goals/ 디렉토리의 *.md 파일을 id 오름차순 정렬 (_meta 와 id 없는 항목 제외).
export function listGoals(goalsDir: string): ParsedGoal[] {
  if (!existsSync(goalsDir)) return []
  let entries: string[]
  try {
    entries = readdirSync(goalsDir)
  } catch {
    return []
  }
  const parsed: ParsedGoal[] = []
  for (const name of entries) {
    if (!name.endsWith('.md')) continue
    if (name === '_meta.md') continue
    const fp = join(goalsDir, name)
    try {
      if (!statSync(fp).isFile()) continue
    } catch {
      continue
    }
    const g = parseGoalFile(fp)
    if (!g) continue
    if (g.frontmatter.type !== 'goal') continue
    if (typeof g.frontmatter.id !== 'number') continue
    parsed.push(g)
  }
  parsed.sort((a, b) => (a.frontmatter.id as number) - (b.frontmatter.id as number))
  return parsed
}

export interface SkippedGoal {
  file: string
  reason: string
}

// VHK-021: goal 로 의도된 듯하나 스키마 불일치로 listGoals 가 조용히 무시한 파일 탐지.
// "silent skip" 을 호출자가 경고로 노출할 수 있게 분리 제공.
// 판정: _meta.md / type:meta(의도적 메타)는 제외. goal 신호(type:goal·id·status·priority·title)가
// 있는데 (type!=='goal' 또는 id 가 숫자 아님)이면 skip 후보.
export function findSkippedGoalFiles(goalsDir: string): SkippedGoal[] {
  if (!existsSync(goalsDir)) return []
  let entries: string[]
  try {
    entries = readdirSync(goalsDir)
  } catch {
    return []
  }
  const out: SkippedGoal[] = []
  for (const name of entries) {
    if (!name.endsWith('.md')) continue
    if (name === '_meta.md') continue
    const fp = join(goalsDir, name)
    try {
      if (!statSync(fp).isFile()) continue
    } catch {
      continue
    }
    const g = parseGoalFile(fp)
    if (!g) continue
    const fm = g.frontmatter
    if (fm.type === 'goal' && typeof fm.id === 'number') continue // 유효 goal
    if (fm.type === 'meta') continue // 의도적 메타 (예: _meta-self-improve.md)
    const looksLikeGoal =
      fm.type === 'goal' ||
      'id' in fm ||
      'status' in fm ||
      'priority' in fm ||
      'title' in fm
    if (!looksLikeGoal) continue
    const reason =
      fm.type !== 'goal'
        ? "type: goal 누락 (frontmatter 에 'type: goal' 필요)"
        : "id 가 숫자가 아님 ('id: 1' 처럼 숫자만)"
    out.push({ file: name, reason })
  }
  return out
}

// id 가 중복된 goal 들을 감지. 중복된 id 를 오름차순으로 반환 (없으면 []).
// listGoals 는 중복 시 첫 매치만 사용하므로, 호출자가 경고를 띄울 수 있게 분리 제공.
export function findDuplicateIds(goals: ParsedGoal[]): number[] {
  const counts = new Map<number, number>()
  for (const g of goals) {
    const id = g.frontmatter.id
    if (typeof id !== 'number') continue
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const dups: number[] = []
  for (const [id, n] of counts) {
    if (n > 1) dups.push(id)
  }
  return dups.sort((a, b) => a - b)
}

// frontmatter status 갱신 (extraFields 가 있으면 추가/덮어쓰기).
// frontmatter 가 없는 파일은 그대로 반환 (silent no-op — 호출자가 사전 검사 권장).
export function updateFrontmatterStatus(
  content: string,
  newStatus: GoalStatus,
  extraFields?: Record<string, string>
): string {
  // parse 측(parseFrontmatter)과 동일하게 BOM 제거 — BOM 파일에서 무변경 반환(거짓 성공)되던 비대칭 제거.
  const normalized = stripBom(content)
  const m = normalized.match(FRONTMATTER_RE)
  if (!m) return content
  const fmRaw = m[1]
  const body = m[2] ?? ''
  const lines = fmRaw.split(/\r?\n/)
  const seenKeys = new Set<string>()
  let hadStatus = false

  const updated = lines.map((raw) => {
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('#')) return raw
    const idx = trimmed.indexOf(':')
    if (idx <= 0) return raw
    const key = trimmed.slice(0, idx).trim()
    seenKeys.add(key)
    if (key === 'status') {
      hadStatus = true
      return `status: ${newStatus}`
    }
    if (extraFields && key in extraFields) {
      return `${key}: ${extraFields[key]}`
    }
    return raw
  })

  if (!hadStatus) updated.push(`status: ${newStatus}`)

  if (extraFields) {
    for (const [k, v] of Object.entries(extraFields)) {
      if (!seenKeys.has(k)) updated.push(`${k}: ${v}`)
    }
  }

  return `---\n${updated.join('\n')}\n---\n${body}`
}
