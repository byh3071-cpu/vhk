import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// VHK goals/<n>-<name>.md frontmatter 표준. vspec/vooster 호환.
export type GoalStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'
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
  const m = content.match(FRONTMATTER_RE)
  if (!m) return { frontmatter: {}, body: content }
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

// frontmatter status 갱신 (extraFields 가 있으면 추가/덮어쓰기).
// frontmatter 가 없는 파일은 그대로 반환 (silent no-op — 호출자가 사전 검사 권장).
export function updateFrontmatterStatus(
  content: string,
  newStatus: GoalStatus,
  extraFields?: Record<string, string>
): string {
  const m = content.match(FRONTMATTER_RE)
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
