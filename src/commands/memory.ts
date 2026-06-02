import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { readJsonFile, stripBom } from '../lib/read-json.js'

/**
 * Goal 18: memory schema v2 — 평면 배열 → 4버킷(decisions/failures/successes/patterns).
 * 교훈 단일 SoT(learn 통합), 항목 생명주기(status active/resolved/archived), 자동 마이그레이션(.bak).
 * v1(평면 `[{content,addedAt,tags?}]`) → v2 멱등 변환. learnings.md(docs/state) → failures 흡수.
 */

export const MEMORY_PATH_REL = join('.vhk', 'memory.json')
export const MEMORY_SCHEMA_VERSION = 2

export type EntryStatus = 'active' | 'resolved' | 'archived'
export type MemBucket = 'decision' | 'failure' | 'success'

export interface MemEntry {
  id: string
  content: string
  tags: string[]
  createdAt: string
  status: EntryStatus
  resolvedAt?: string
  archivedAt?: string
}
export interface FailEntry extends MemEntry {
  why?: string
  lesson?: string
}
export interface SuccessEntry extends MemEntry {
  why?: string
}
/** Goal 19(pattern)에서 채움 — v0 은 빈 배열 + 최소 타입. */
export interface PatternEntry {
  id: string
  [key: string]: unknown
}

export interface MemoryFileV2 {
  schemaVersion: 2
  decisions: MemEntry[]
  failures: FailEntry[]
  successes: SuccessEntry[]
  patterns: PatternEntry[]
}

function emptyV2(): MemoryFileV2 {
  return { schemaVersion: MEMORY_SCHEMA_VERSION, decisions: [], failures: [], successes: [], patterns: [] }
}

function isV2(raw: unknown): raw is MemoryFileV2 {
  return !!raw && typeof raw === 'object' && (raw as { schemaVersion?: number }).schemaVersion === 2
}

const BUCKET_PREFIX: Record<MemBucket, string> = { decision: 'd', failure: 'f', success: 's' }

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

/** 이미 v2 인 객체를 안전 정규화(누락 버킷 채움). */
function normalizeV2(raw: MemoryFileV2): MemoryFileV2 {
  return {
    schemaVersion: MEMORY_SCHEMA_VERSION,
    decisions: arr<MemEntry>(raw.decisions),
    failures: arr<FailEntry>(raw.failures),
    successes: arr<SuccessEntry>(raw.successes),
    patterns: arr<PatternEntry>(raw.patterns),
  }
}

/** learnings.md 본문 → { date, tag, lesson } 항목 파싱 (`- [YYYY-MM-DD goal-N] 교훈`). */
function parseLearnings(rawLearnings: string): { date: string; tag: string; lesson: string }[] {
  const out: { date: string; tag: string; lesson: string }[] = []
  for (const line of rawLearnings.split(/\r?\n/)) {
    const m = line.match(/^-\s*\[(\d{4}-\d{2}-\d{2})\s+([^\]]*)\]\s*(.+)$/)
    if (m) out.push({ date: m[1], tag: m[2].trim(), lesson: m[3].trim() })
  }
  return out
}

/**
 * **순수** v1→v2 마이그레이션. v1 평면배열 → decisions, learnings.md 본문 → failures(lesson, what 비움).
 * 이미 v2 면 멱등(rawLearnings 무시 — 재흡수 안 함). fs/git/Date 부수효과 없음.
 */
export function migrateMemory(rawMemory: unknown, rawLearnings?: string): MemoryFileV2 {
  if (isV2(rawMemory)) return normalizeV2(rawMemory)

  const v2 = emptyV2()
  // v1 평면 배열 → decisions
  if (Array.isArray(rawMemory)) {
    rawMemory.forEach((m, i) => {
      const item = m as { content?: unknown; tags?: unknown; addedAt?: unknown }
      if (item && typeof item.content === 'string') {
        v2.decisions.push({
          id: `d${i + 1}`,
          content: item.content,
          tags: arr<string>(item.tags),
          createdAt: typeof item.addedAt === 'string' ? item.addedAt : '',
          status: 'active',
        })
      }
    })
  }
  // learnings.md → failures (실패 본문 없음: content/what 비우고 lesson 만)
  if (rawLearnings) {
    parseLearnings(rawLearnings).forEach((l, i) => {
      v2.failures.push({
        id: `f${i + 1}`,
        content: '',
        tags: l.tag ? [l.tag] : [],
        createdAt: l.date,
        status: 'active',
        lesson: l.lesson,
      })
    })
  }
  return v2
}

// ── fs 경계 (impure) ──

function readRaw(cwd: string): unknown {
  const p = join(cwd, MEMORY_PATH_REL)
  if (!existsSync(p)) return null
  try {
    return readJsonFile<unknown>(p)
  } catch {
    return null
  }
}

// learnings.md 는 JSON 이 아니라 텍스트 — BOM-safe 로 읽되 JSON.parse 안 함.
function readLearningsRaw(cwd: string): string | undefined {
  const p = join(cwd, 'docs', 'state', 'learnings.md')
  if (!existsSync(p)) return undefined
  try {
    return stripBom(readFileSync(p, 'utf-8'))
  } catch {
    return undefined
  }
}

/** memory.json 읽기 → 항상 v2 반환(v1/없으면 in-memory 마이그레이션, learnings 흡수). */
export function readMemory(cwd: string = process.cwd()): MemoryFileV2 {
  const raw = readRaw(cwd)
  if (isV2(raw)) return normalizeV2(raw)
  return migrateMemory(raw, readLearningsRaw(cwd))
}

/** memory.json 쓰기 — 기존 파일 있으면 .bak 백업 후 v2 재기록. */
export function writeMemory(cwd: string, mem: MemoryFileV2): void {
  const p = join(cwd, MEMORY_PATH_REL)
  mkdirSync(join(cwd, '.vhk'), { recursive: true })
  if (existsSync(p)) {
    try {
      copyFileSync(p, p + '.bak')
    } catch {
      /* 백업 실패는 치명적 아님 */
    }
  }
  writeFileSync(p, JSON.stringify(mem, null, 2) + '\n', 'utf-8')
}

// ── id / 순서 헬퍼 ──

function nextId(bucket: MemBucket, mem: MemoryFileV2): string {
  const prefix = BUCKET_PREFIX[bucket]
  const list = bucket === 'decision' ? mem.decisions : bucket === 'failure' ? mem.failures : mem.successes
  let max = 0
  for (const e of list) {
    const m = e.id.match(new RegExp(`^${prefix}(\\d+)$`))
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}${max + 1}`
}

/** decisions→failures→successes 안정 순서(번호 = 이 순서의 1-based). patterns 제외. */
function orderedAll(mem: MemoryFileV2): { bucket: MemBucket; entry: MemEntry }[] {
  return [
    ...mem.decisions.map((entry) => ({ bucket: 'decision' as const, entry })),
    ...mem.failures.map((entry) => ({ bucket: 'failure' as const, entry })),
    ...mem.successes.map((entry) => ({ bucket: 'success' as const, entry })),
  ]
}

// ── 커맨드 ──

export async function memoryAdd(
  content: string,
  opts: { tags?: string[]; type?: MemBucket; why?: string; lesson?: string } = {}
): Promise<void> {
  console.log(chalk.bold('\n🧠 ' + t('memory.addTitle')))
  console.log(chalk.gray('─'.repeat(40)))
  if (!content || !content.trim()) {
    console.log(chalk.red('❌ 기억할 내용을 입력해주세요.'))
    console.log(chalk.gray('   예: vhk memory add "API는 tRPC 사용" --type decision'))
    process.exitCode = 1
    return
  }
  const cwd = process.cwd()
  const mem = readMemory(cwd)
  const type: MemBucket = opts.type ?? 'decision'
  const base: MemEntry = {
    id: nextId(type, mem),
    content: content.trim(),
    tags: opts.tags && opts.tags.length > 0 ? opts.tags : [],
    createdAt: new Date().toISOString(),
    status: 'active',
  }
  if (type === 'failure') mem.failures.push({ ...base, why: opts.why, lesson: opts.lesson })
  else if (type === 'success') mem.successes.push({ ...base, why: opts.why })
  else mem.decisions.push(base)
  writeMemory(cwd, mem)

  console.log(chalk.green(`\n✅ 기억 저장됨 (${type} #${base.id})`))
  console.log(chalk.cyan(`   📝 ${base.content}`))
  printNextStep({ message: '기억 저장 완료!', command: 'vhk memory list', cursorHint: '기억 목록 보여줘' })
}

const STATUS_ICON: Record<EntryStatus, string> = { active: '🟢', resolved: '✅', archived: '📦' }
const BUCKET_LABEL: Record<MemBucket, string> = { decision: '결정', failure: '실패', success: '성공' }

export async function memoryList(opts: { type?: MemBucket; all?: boolean } = {}): Promise<void> {
  console.log(chalk.bold('\n🧠 ' + t('memory.listTitle')))
  console.log(chalk.gray('─'.repeat(40)))
  const mem = readMemory(process.cwd())
  const all = orderedAll(mem)
  const visible = all
    .map((x, i) => ({ ...x, n: i + 1 }))
    .filter((x) => (opts.all || x.entry.status === 'active') && (!opts.type || x.bucket === opts.type))

  if (visible.length === 0) {
    console.log(chalk.yellow('\n📭 표시할 기억이 없습니다.'))
    console.log(chalk.gray('   vhk memory add "내용" --type decision|failure|success'))
    return
  }
  console.log(chalk.cyan(`\n${visible.length}개${opts.all ? ' (보관 포함)' : ' (활성)'}:\n`))
  for (const x of visible) {
    const e = x.entry
    const fail = e as FailEntry
    console.log(`  [${x.n}] ${STATUS_ICON[e.status]} (${BUCKET_LABEL[x.bucket]}) ${e.content || (fail.lesson ? '💡 ' + fail.lesson : '(내용 없음)')}`)
    if (fail.lesson && e.content) console.log(chalk.dim(`      💡 교훈: ${fail.lesson}`))
    if (fail.why) console.log(chalk.dim(`      ↳ ${fail.why}`))
    if (e.tags.length > 0) console.log(chalk.blue(`      🏷️  ${e.tags.join(', ')}`))
  }
}

function resolveIndex(indexStr: string, len: number): number | null {
  const idx = parseInt(indexStr, 10) - 1
  if (Number.isNaN(idx) || idx < 0 || idx >= len) return null
  return idx
}

export async function memoryRemove(indexStr: string): Promise<void> {
  const cwd = process.cwd()
  const mem = readMemory(cwd)
  const all = orderedAll(mem)
  const idx = resolveIndex(indexStr, all.length)
  if (idx === null) {
    console.log(chalk.red(`❌ 유효하지 않은 번호입니다. (1~${all.length || 0})`))
    process.exitCode = 1
    return
  }
  const { bucket, entry } = all[idx]
  const list = bucket === 'decision' ? mem.decisions : bucket === 'failure' ? mem.failures : mem.successes
  const pos = list.findIndex((e) => e.id === entry.id)
  if (pos >= 0) list.splice(pos, 1)
  writeMemory(cwd, mem)
  console.log(chalk.green('\n✅ 기억 삭제됨:'))
  console.log(chalk.gray(`   ${entry.content || (entry as FailEntry).lesson || entry.id}`))
}

export async function memoryArchive(indexStr: string): Promise<void> {
  const cwd = process.cwd()
  const mem = readMemory(cwd)
  const all = orderedAll(mem)
  const idx = resolveIndex(indexStr, all.length)
  if (idx === null) {
    console.log(chalk.red(`❌ 유효하지 않은 번호입니다. (1~${all.length || 0})`))
    process.exitCode = 1
    return
  }
  const { entry } = all[idx]
  entry.status = 'archived'
  entry.archivedAt = new Date().toISOString()
  writeMemory(cwd, mem)
  console.log(chalk.green(`\n📦 보관됨: ${entry.content || (entry as FailEntry).lesson || entry.id}`))
  console.log(chalk.dim('   (패턴 감지·진화에서 제외됩니다 — 선순환)'))
}

export async function memoryMigrate(): Promise<void> {
  const cwd = process.cwd()
  const raw = readRaw(cwd)
  if (isV2(raw)) {
    console.log(chalk.dim('  이미 memory schema v2 입니다 — 변경 없음(멱등).'))
    return
  }
  const v2 = migrateMemory(raw, readLearningsRaw(cwd))
  writeMemory(cwd, v2)
  console.log(chalk.green('\n✅ memory.json v1 → v2 마이그레이션 완료 (.bak 백업)'))
  console.log(
    chalk.dim(
      `   decisions ${v2.decisions.length} · failures ${v2.failures.length} · successes ${v2.successes.length}` +
        ` (learnings.md 교훈 흡수 — 이후 vhk learn 은 memory 에 기록)`
    )
  )
}

/** Goal 18: vhk learn → memory v2 failures.lesson 단일 SoT (learnings.md 신규 기록 중단). */
export function recordLesson(cwd: string, lesson: string, goalId?: number): FailEntry {
  const mem = readMemory(cwd)
  const tag = goalId !== undefined ? `goal-${goalId}` : 'no-goal'
  const entry: FailEntry = {
    id: nextId('failure', mem),
    content: '',
    tags: [tag],
    createdAt: new Date().toISOString(),
    status: 'active',
    lesson: lesson.trim(),
  }
  mem.failures.push(entry)
  writeMemory(cwd, mem)
  return entry
}
