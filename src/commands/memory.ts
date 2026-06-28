import { existsSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs'
import { atomicWriteFile } from '../lib/atomic-write.js'
import { join } from 'node:path'
import chalk from 'chalk'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { readJsonFile, stripBom } from '../lib/read-json.js'
import { ensureNotHardStopped } from '../lib/hard-stop-guard.js'
import { logRecall } from '../lib/recall-log.js'

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

/** 흡수할 항목이 전혀 없는 빈 v2 인가 — read 경로가 빈 memory.json 을 litter 하지 않도록 판정용(#372). */
function isEmptyV2(m: MemoryFileV2): boolean {
  return m.decisions.length === 0 && m.failures.length === 0 && m.successes.length === 0 && m.patterns.length === 0
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

/**
 * 디스크 상태 3분기: 파일 없음(missing) / 파싱 성공(parsed) / 파일은 있으나 읽기·파싱 실패(error).
 * **핵심**: missing 과 error 를 구분해야 read 경로가 손상 파일을 빈 v2 로 덮어쓰지 않는다(데이터 손실 방지).
 */
type RawResult =
  | { kind: 'missing' }
  | { kind: 'parsed'; value: unknown }
  | { kind: 'error' }

function readRaw(cwd: string): RawResult {
  const p = join(cwd, MEMORY_PATH_REL)
  if (!existsSync(p)) return { kind: 'missing' }
  try {
    return { kind: 'parsed', value: readJsonFile<unknown>(p) }
  } catch {
    return { kind: 'error' }
  }
}

/** 손상/IO 실패 경고 — 절대 덮어쓰지 않음을 사용자에게 고지(백업 위치 안내). */
function warnUnreadable(cwd: string): void {
  const p = join(cwd, MEMORY_PATH_REL)
  console.error(chalk.red(`\n⚠️  ${MEMORY_PATH_REL} 를 읽을 수 없습니다 (손상/부분 쓰기 의심).`))
  console.error(chalk.yellow(`   덮어쓰지 않고 빈 메모리로 진행합니다 — 원본 보존됨.`))
  console.error(chalk.dim(`   확인/복구: ${p}  (백업: ${p}.bak / ${p}.v1.bak)`))
}

/**
 * 파싱은 되나 v1(평면 배열)도 v2(객체)도 아닌 경우 경고 — **미래 스키마(v3+)·수동 편집 의심**.
 * v2.0 이 schemaVersion 을 도입했으므로, 인식 불가 형식을 빈 v2 로 덮으면 미래 버전 파일을 파괴할 수 있다 → 보존.
 */
function warnUnrecognized(cwd: string): void {
  const p = join(cwd, MEMORY_PATH_REL)
  console.error(chalk.red(`\n⚠️  ${MEMORY_PATH_REL} 가 인식 가능한 형식이 아닙니다 (v1 배열/v2 객체 아님).`))
  console.error(chalk.yellow(`   미래 스키마/수동 편집 의심 — 덮어쓰지 않습니다(원본 보존). 확인 후 다시 시도.`))
  console.error(chalk.dim(`   확인: ${p}`))
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

/**
 * read 경로 자동 영구화 — 마이그레이션 결과(v2)를 1회 디스크에 쓴다.
 * 영구화 실패(파일 잠금 등)는 read 커맨드를 죽이지 않는다 — 메모리상 v2 로 진행, 다음 쓰기 때 재시도.
 */
function persistOnRead(cwd: string, v2: MemoryFileV2): void {
  try {
    writeMemory(cwd, v2)
  } catch {
    console.error(chalk.yellow(`   (v2 영구화 보류 — ${MEMORY_PATH_REL} 잠금 의심. 이번엔 메모리상으로만 진행)`))
  }
}

/**
 * memory.json 읽기 → 항상 v2.
 * **계약 일관성**: 디스크가 v1 평면배열이거나 파일이 없어도 learnings.md 흡수분이 있으면 read 경로
 * (memory list / context / brief 등)에서 1회 실제 마이그레이션을 영구화 — 어느 명령으로 첫 실행해도 동일 결과.
 * 멱등: 이미 v2 면 no-op(재흡수·재기록 없음). 파일도 learnings 도 없어 흡수할 게 0이면 빈 v2 반환(쓰지 않음 — litter 방지).
 * **안전**: 파일은 있으나 파싱 불가(손상/부분 write/IO) 면 **절대 덮어쓰지 않고** 경고 후 빈 v2 반환(원본 보존).
 */
export function readMemory(cwd: string = process.cwd()): MemoryFileV2 {
  const raw = readRaw(cwd)
  if (raw.kind === 'error') {
    warnUnreadable(cwd)
    return emptyV2()
  }
  if (raw.kind === 'parsed') {
    if (isV2(raw.value)) return normalizeV2(raw.value)
    if (Array.isArray(raw.value)) {
      // v1 평면 배열이 디스크에 **실재**할 때 1회 영구화(+.v1.bak).
      const v2 = migrateMemory(raw.value, readLearningsRaw(cwd))
      persistOnRead(cwd, v2)
      return v2
    }
    // 파싱되나 v1/v2 아님 (미래 스키마/수동 편집) → 덮어쓰지 않고 빈 v2 반환(원본 보존).
    warnUnrecognized(cwd)
    return emptyV2()
  }
  // 파일 없음 — learnings.md 흡수분이 있으면 1회 영구화(#372: 매 read 재마이그레이션 → 디스크 영속 0 방지).
  // 흡수할 게 전혀 없으면(빈 v2) 쓰지 않는다 — 빈 memory.json litter 방지(memoryMigrate 와 동일 정책).
  const v2 = migrateMemory(null, readLearningsRaw(cwd))
  if (!isEmptyV2(v2)) persistOnRead(cwd, v2)
  return v2
}

type LoadOutcome = { ok: true; mem: MemoryFileV2 } | { ok: false }

/**
 * 마이그레이션은 하되 디스크에 영구화하지 **않는** 로더 — 곧바로 writeMemory 할 mutating 커맨드용.
 * read 경로의 자동 영구화와 합쳐져 발생하던 첫 add 의 이중 write 를 제거(단일 write).
 * **안전(blocker)**: 파일이 손상(parse/IO 실패)이면 `{ ok:false }` — 호출자는 **반드시 중단**해야 한다.
 * 빈 v2 를 손상 파일 위에 mutate-write 하면 live 데이터·롤링 .bak 이 파괴됨(읽기 경로와 동일 원칙).
 */
export function loadForMutation(cwd: string): LoadOutcome {
  const raw = readRaw(cwd)
  if (raw.kind === 'error') {
    warnUnreadable(cwd)
    return { ok: false }
  }
  if (raw.kind === 'parsed') {
    if (isV2(raw.value)) return { ok: true, mem: normalizeV2(raw.value) }
    if (Array.isArray(raw.value)) return { ok: true, mem: migrateMemory(raw.value, readLearningsRaw(cwd)) }
    // 파싱되나 v1/v2 아님 (미래 스키마/수동 편집) → mutate 가 빈 v2 로 덮지 못하게 중단.
    warnUnrecognized(cwd)
    return { ok: false }
  }
  // 파일 없음 — 빈 v2(+learnings) 로 시작.
  return { ok: true, mem: migrateMemory(null, readLearningsRaw(cwd)) }
}

/** active = 보관/해결되지 않은 항목. status 누락(외부 생성·구버전)도 active 로 간주 — 조용히 숨기지 않음. */
function isActive(e: MemEntry): boolean {
  return e.status !== 'archived' && e.status !== 'resolved'
}

/**
 * memory.json 쓰기.
 * - `.v1.bak` = **v1 원본 write-once 영구 백업** — 마이그레이션 순간(디스크가 v1)에 1회만 생성,
 *   이미 있으면 안 덮음. 후속 add/archive/remove 가 v1 원본을 절대 못 지운다(breaking 복구 보장).
 * - `.bak` = **롤링 백업** — 매 쓰기마다 직전 상태 보존(직전 1단계 되돌리기용).
 */
export function writeMemory(cwd: string, mem: MemoryFileV2): void {
  const p = join(cwd, MEMORY_PATH_REL)
  mkdirSync(join(cwd, '.vhk'), { recursive: true })
  if (existsSync(p)) {
    const cur = readRaw(cwd)
    const curIsV2 = cur.kind === 'parsed' && isV2(cur.value)
    // 마이그레이션 순간(디스크가 v2 아닌 v1/미인식)에 원본을 write-once 보존.
    // cur.kind==='error'(레이스로 막 손상) 면 손상본을 '원본'으로 박제하지 않는다(롤링 .bak 과 동일 가드).
    if (cur.kind !== 'error' && !curIsV2 && !existsSync(p + '.v1.bak')) {
      try {
        copyFileSync(p, p + '.v1.bak')
      } catch {
        /* 백업 실패는 치명적 아님 */
      }
    }
    // 롤링 .bak (매 쓰기 직전 상태). 단, 현재 live 가 **읽기 불가(손상)** 면 마지막 양호 백업을
    // 손상본으로 덮지 않는다(정상 경로에선 도달 안 하지만 방어적으로 마지막 복구지점 보존).
    if (cur.kind !== 'error') {
      try {
        copyFileSync(p, p + '.bak')
      } catch {
        /* 백업 실패는 치명적 아님 */
      }
    }
  }
  // 원자적 쓰기 — atomicWriteFile(pid+카운터 temp)로 통일. 고정 `.tmp` 경로 자체구현은
  // 동시 세션이 같은 temp 를 잡아 rename 충돌·업데이트 유실 가능(리뷰 A2-02).
  atomicWriteFile(p, JSON.stringify(mem, null, 2) + '\n')
}

// ── id / 순서 헬퍼 ──

function nextId(bucket: MemBucket, mem: MemoryFileV2): string {
  const prefix = BUCKET_PREFIX[bucket]
  const list = bucket === 'decision' ? mem.decisions : bucket === 'failure' ? mem.failures : mem.successes
  const idRe = new RegExp(`^${prefix}(\\d+)$`) // 루프 밖에서 1회 컴파일(prefix·패턴은 호출 내 불변).
  let max = 0
  for (const e of list) {
    const m = e.id.match(idRe)
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

const VALID_BUCKETS: readonly MemBucket[] = ['decision', 'failure', 'success']

export async function memoryAdd(
  content: string,
  opts: { tags?: string[]; type?: string; why?: string; lesson?: string } = {}
): Promise<void> {
  if (!ensureNotHardStopped('memory add')) return // HARD_STOP 활성 시 memory.json 변경 차단
  console.log(chalk.bold('\n🧠 ' + t('memory.addTitle')))
  console.log(chalk.gray('─'.repeat(40)))
  if (!content || !content.trim()) {
    console.log(chalk.red('❌ 기억할 내용을 입력해주세요.'))
    console.log(chalk.gray('   예: vhk memory add "API는 tRPC 사용" --type decision'))
    process.exitCode = 1
    return
  }
  // --type 검증: 잘못된 값을 조용히 decision 으로 강등하면 --lesson/--why 입력이 유실된다 → 거부.
  const typeRaw = opts.type ?? 'decision'
  if (!VALID_BUCKETS.includes(typeRaw as MemBucket)) {
    console.log(chalk.red(`❌ --type 은 decision|failure|success 중 하나여야 합니다 (받은 값: ${typeRaw}).`))
    process.exitCode = 1
    return
  }
  const type = typeRaw as MemBucket
  // decision 버킷은 why/lesson 을 저장하지 않는다 → 잘못 준 입력이 조용히 사라지지 않도록 경고.
  if (type === 'decision' && (opts.why || opts.lesson)) {
    console.log(chalk.yellow('⚠️  --why/--lesson 은 --type failure|success 에서만 저장됩니다 — decision 에서는 무시됨.'))
  }
  const cwd = process.cwd()
  const loaded = loadForMutation(cwd)
  if (!loaded.ok) {
    console.log(chalk.red('❌ memory.json 손상 의심 — 저장 중단 (원본 보존). 백업 확인 후 다시 시도하세요.'))
    process.exitCode = 1
    return
  }
  const mem = loaded.mem
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
    .filter((x) => (opts.all || isActive(x.entry)) && (!opts.type || x.bucket === opts.type))

  if (visible.length === 0) {
    console.log(chalk.yellow('\n📭 표시할 기억이 없습니다.'))
    console.log(chalk.gray('   vhk memory add "내용" --type decision|failure|success'))
    return
  }
  console.log(chalk.cyan(`\n${visible.length}개${opts.all ? ' (보관 포함)' : ' (활성)'}:\n`))
  for (const x of visible) {
    const e = x.entry
    const fail = e as FailEntry
    console.log(`  [${x.n}] ${STATUS_ICON[e.status] ?? '🟢'} (${BUCKET_LABEL[x.bucket]}) ${e.content || (fail.lesson ? '💡 ' + fail.lesson : '(내용 없음)')}`)
    if (fail.lesson && e.content) console.log(chalk.dim(`      💡 교훈: ${fail.lesson}`))
    if (fail.why) console.log(chalk.dim(`      ↳ ${fail.why}`))
    if (e.tags.length > 0) console.log(chalk.blue(`      🏷️  ${e.tags.join(', ')}`))
  }
}

function resolveIndex(indexStr: string, len: number): number | null {
  // #318: parseInt 부분파싱('2zzz'→2, '1.5'→1)으로 엉뚱한 항목을 조용히 삭제/보관하던 파괴적 버그.
  //        엄격 정수 정규식으로 비정수·소수·문자혼입·공백·빈문자를 거부. remove 는 되돌릴 수 없어 특히 엄격.
  if (!/^\d+$/.test(indexStr)) return null
  const n = Number(indexStr)
  if (!Number.isInteger(n)) return null
  const idx = n - 1
  if (idx < 0 || idx >= len) return null
  return idx
}

export async function memoryRemove(indexStr: string): Promise<void> {
  if (!ensureNotHardStopped('memory remove')) return
  const cwd = process.cwd()
  const loaded = loadForMutation(cwd)
  if (!loaded.ok) {
    console.log(chalk.red('❌ memory.json 손상 의심 — 삭제 중단 (원본 보존).'))
    process.exitCode = 1
    return
  }
  const mem = loaded.mem
  const all = orderedAll(mem)
  const idx = resolveIndex(indexStr, all.length)
  if (idx === null) {
    console.log(chalk.red(`❌ 유효하지 않은 번호입니다. (1~${all.length || 0})`))
    process.exitCode = 1
    return
  }
  const { bucket, entry } = all[idx]
  const list = bucket === 'decision' ? mem.decisions : bucket === 'failure' ? mem.failures : mem.successes
  // id 가 아니라 **객체 동일성(reference)**으로 삭제 — 중복 id(외부 편집·클라우드 복원) 시 엉뚱한 항목이 지워지지 않게.
  const pos = list.findIndex((e) => e === entry)
  if (pos >= 0) list.splice(pos, 1)
  writeMemory(cwd, mem)
  console.log(chalk.green('\n✅ 기억 삭제됨:'))
  console.log(chalk.gray(`   ${entry.content || (entry as FailEntry).lesson || entry.id}`))
}

/** index 문자열 → {cwd, mem, entry} 해석. 실패 시 에러 출력 + exitCode 1 후 null. status 전이 커맨드 공용. */
function resolveEntryForMutation(
  indexStr: string
): { cwd: string; mem: MemoryFileV2; entry: MemEntry } | null {
  const cwd = process.cwd()
  const loaded = loadForMutation(cwd)
  if (!loaded.ok) {
    console.log(chalk.red('❌ memory.json 손상 의심 — 작업 중단 (원본 보존).'))
    process.exitCode = 1
    return null
  }
  const mem = loaded.mem
  const all = orderedAll(mem)
  const idx = resolveIndex(indexStr, all.length)
  if (idx === null) {
    console.log(chalk.red(`❌ 유효하지 않은 번호입니다. (1~${all.length || 0})`))
    process.exitCode = 1
    return null
  }
  return { cwd, mem, entry: all[idx].entry }
}

function entryLabel(entry: MemEntry): string {
  return entry.content || (entry as FailEntry).lesson || entry.id
}

export async function memoryArchive(indexStr: string): Promise<void> {
  if (!ensureNotHardStopped('memory archive')) return
  const r = resolveEntryForMutation(indexStr)
  if (!r) return
  r.entry.status = 'archived'
  r.entry.archivedAt = new Date().toISOString()
  delete r.entry.resolvedAt
  writeMemory(r.cwd, r.mem)
  console.log(chalk.green(`\n📦 보관됨: ${entryLabel(r.entry)}`))
  console.log(chalk.dim('   (패턴 감지·진화에서 제외됩니다 — 선순환). 되돌리기: vhk memory unarchive <번호>'))
}

/** 항목 해결 표시 (active→resolved). 실패가 교훈으로 정리됨을 기록 — 패턴/진화에서 제외. */
export async function memoryResolve(indexStr: string): Promise<void> {
  if (!ensureNotHardStopped('memory resolve')) return
  const r = resolveEntryForMutation(indexStr)
  if (!r) return
  r.entry.status = 'resolved'
  r.entry.resolvedAt = new Date().toISOString()
  delete r.entry.archivedAt
  writeMemory(r.cwd, r.mem)
  console.log(chalk.green(`\n✅ 해결됨: ${entryLabel(r.entry)}`))
  console.log(chalk.dim('   (vhk memory list --all 로 확인. 되돌리기: vhk memory unarchive <번호>)'))
}

/** 보관/해결 항목을 다시 active 로 — 오조작 복구(archive/resolve 역전). */
export async function memoryUnarchive(indexStr: string): Promise<void> {
  if (!ensureNotHardStopped('memory unarchive')) return
  const r = resolveEntryForMutation(indexStr)
  if (!r) return
  if (isActive(r.entry)) {
    console.log(chalk.dim(`  이미 활성 항목입니다 — 변경 없음: ${entryLabel(r.entry)}`))
    return
  }
  r.entry.status = 'active'
  delete r.entry.archivedAt
  delete r.entry.resolvedAt
  writeMemory(r.cwd, r.mem)
  console.log(chalk.green(`\n🟢 활성으로 복구됨: ${entryLabel(r.entry)}`))
}

export async function memoryMigrate(): Promise<void> {
  const cwd = process.cwd()
  const raw = readRaw(cwd)
  if (raw.kind === 'error') {
    // 손상 파일을 빈 v2 로 덮지 않는다 — 원본 보존하고 중단.
    warnUnreadable(cwd)
    console.log(chalk.red('  ❌ 마이그레이션 중단 (손상 의심). 원본 확인 후 다시 시도하세요.'))
    process.exitCode = 1
    return
  }
  if (raw.kind === 'parsed' && isV2(raw.value)) {
    console.log(chalk.dim('  이미 memory schema v2 입니다 — 변경 없음(멱등).'))
    return
  }
  // 파싱되나 v1(배열)도 v2 도 아님 → 마이그레이션 대상 아님. 빈 v2 로 덮으면 미래 스키마 파괴 → 중단.
  if (raw.kind === 'parsed' && !Array.isArray(raw.value)) {
    warnUnrecognized(cwd)
    console.log(chalk.red('  ❌ v1(평면 배열) 형식이 아니라 마이그레이션 대상이 아닙니다 — 중단(원본 보존).'))
    process.exitCode = 1
    return
  }
  const learnings = readLearningsRaw(cwd)
  const hadFile = raw.kind === 'parsed' // 디스크에 (v2 아닌) 실제 파일이 있었는가 → .v1.bak 백업 생성됨
  // 마이그레이션할 게 아무것도 없으면(파일 없음 + learnings 없음) 빈 파일을 만들지 않는다.
  if (raw.kind === 'missing' && !learnings) {
    console.log(chalk.yellow('  ℹ️  마이그레이션할 v1 memory.json / learnings.md 가 없습니다 — 변경 없음.'))
    return
  }
  const v2 = migrateMemory(raw.kind === 'parsed' ? raw.value : null, learnings)
  writeMemory(cwd, v2)
  // 백업 안내는 실제로 .v1.bak 이 만들어졌을 때만(기존 파일 존재). 신규 생성 시 거짓 백업 문구 금지.
  const backupNote = hadFile ? ' (.v1.bak 원본 영구 백업)' : ' (신규 생성 — 원본 없음, 백업 없음)'
  console.log(chalk.green(`\n✅ memory.json → v2 마이그레이션 완료${backupNote}`))
  console.log(
    chalk.dim(
      `   decisions ${v2.decisions.length} · failures ${v2.failures.length} · successes ${v2.successes.length}` +
        (learnings ? ' (learnings.md 교훈 흡수 — 이후 vhk learn 은 memory 에 기록)' : '')
    )
  )
}

/**
 * vhk context / brief 용 — active 항목 요약 markdown 라인 (4버킷, 빈 버킷 생략, 버킷별 최근 limit).
 * 누락 없이 decisions/failures/successes/patterns 의 active 만 렌더.
 */
export function activeMemoryLines(mem: MemoryFileV2, limit = 5): string[] {
  const lines: string[] = []
  const fmt = (e: MemEntry): string => {
    const f = e as FailEntry
    const base = e.content || (f.lesson ? `💡 ${f.lesson}` : e.id)
    return e.content && f.lesson ? `${base} — 💡 ${f.lesson}` : base
  }
  const section = (label: string, list: MemEntry[]): void => {
    const act = list.filter(isActive)
    if (act.length === 0) return
    lines.push(`**${label}** (${act.length})`)
    for (const e of act.slice(-limit)) lines.push(`- ${fmt(e)}`)
    if (act.length > limit) lines.push(`- … 외 ${act.length - limit}개`)
    lines.push('')
  }
  section('결정 (decisions)', mem.decisions)
  section('실패·교훈 (failures)', mem.failures)
  section('성공 (successes)', mem.successes)
  const pats = mem.patterns.length
  if (pats > 0) lines.push(`**패턴 후보 (patterns)**: ${pats}개 — \`vhk pattern\``, '')
  return lines
}

/**
 * Goal 18: vhk learn → memory v2 failures.lesson 단일 SoT (learnings.md 신규 기록 중단).
 * 손상 파일이면 `null` 반환(빈 v2 로 덮어쓰지 않음) — 호출자가 중단·안내.
 */
export function recordLesson(cwd: string, lesson: string, goalId?: number): FailEntry | null {
  const loaded = loadForMutation(cwd)
  if (!loaded.ok) return null
  const mem = loaded.mem
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

// ── 키워드 회상 (RFC 0049 ① · 순수 JS · 의존성 0) ──
// N≤수백 full-scan. 임베딩·벡터DB 없음(RFC 0049 Kill-gate: eval Recall@5<0.7 측정 전 ML 금지).

/** 회상 1건 — 4신호를 한 숫자로 안 땋고 분리 노출(왜 떠올랐는지 설명 가능 · Hickey). */
export interface RecallHit {
  bucket: MemBucket
  entry: MemEntry
  score: number
  signals: { keyword: number; tagMatch: number; recency: number; status: number }
}

const JOSA = /(은|는|이|가|을|를|에|의|도|로|으로|에서|까지|부터|와|과|만)$/
const STOP = new Set(['그', '저', '것', '수', '등', '및', '때'])

/** 결정적 한국어/영어 토크나이저 — 소문자·기호분리·긴 단어의 짧은 조사 제거. 라이브러리 0. */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+|[가-힣]+/g) ?? [])
    .map((w) => (w.length > 2 ? w.replace(JOSA, '') : w))
    .filter((w) => w.length >= 2 && !STOP.has(w))
}

function entryText(e: MemEntry): string {
  const f = e as FailEntry
  return [e.content, f.lesson, f.why].filter(Boolean).join(' ')
}

/** corpus IDF — N 작아 매 호출 계산해도 <1ms. df↑(흔한 단어)일수록 가중↓. tags 제외(본문만). */
function buildIdf(entries: MemEntry[]): Map<string, number> {
  const df = new Map<string, number>()
  for (const e of entries) {
    for (const tok of new Set(tokenize(entryText(e)))) df.set(tok, (df.get(tok) ?? 0) + 1)
  }
  const N = entries.length || 1
  const idf = new Map<string, number>()
  for (const [tok, d] of df) idf.set(tok, Math.log(1 + N / d))
  return idf
}

/**
 * 생성시점 기반 약한 최근성 보너스(주신호 아님) — 90일 반감기. 파싱 실패 시 0.
 * #324: createdAt 미래(clock skew·수동편집·복원)면 days<0 → exp(양수)가 1.0 을 무한 초과(e+127)해
 *       '약한 보너스(상한 1.0)' 설계를 무력화하고 과학표기가 사용자에게 노출됨 →
 *       미래 날짜는 '최신'으로 간주해 1.0 으로 clamp.
 */
function recencyScore(createdAt: string, nowMs: number): number {
  const ts = Date.parse(createdAt)
  if (Number.isNaN(ts)) return 0
  const days = (nowMs - ts) / 86_400_000
  return Math.min(1, Math.exp(-days / 90))
}

/**
 * 키워드 회상. 토큰 IDF overlap + 태그 정확매치 가중 + 약한 최근성, status 강등.
 * 정렬 결정적: score DESC → createdAt DESC → id ASC.
 */
export function recallMemories(
  mem: MemoryFileV2,
  query: string,
  k = 5,
  nowMs: number = Date.now()
): RecallHit[] {
  const all = orderedAll(mem)
  const qTokens = new Set(tokenize(query))
  if (qTokens.size === 0) return []
  const idf = buildIdf(all.map((x) => x.entry))

  const hits: RecallHit[] = all.map(({ bucket, entry }) => {
    const bodyTokens = new Set(tokenize(entryText(entry)))
    let keyword = 0
    for (const tok of qTokens) if (bodyTokens.has(tok)) keyword += idf.get(tok) ?? 0
    const tagMatch = entry.tags.filter((tg) => qTokens.has(tg.toLowerCase())).length
    const recency = recencyScore(entry.createdAt, nowMs)
    const status = isActive(entry) ? 1 : 0.3 // D19: archived/resolved 강등
    // 관련성(keyword+tag)이 0이면 매칭 아님 — 최근성은 '이미 매칭된 것'만 가산(유령 매칭 방지).
    const relevance = keyword + tagMatch * 2.0
    const score = relevance > 0 ? (relevance + recency * 0.3) * status : 0
    return { bucket, entry, score, signals: { keyword, tagMatch, recency, status } }
  })

  return hits
    .filter((h) => h.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Date.parse(b.entry.createdAt) - Date.parse(a.entry.createdAt) ||
        a.entry.id.localeCompare(b.entry.id)
    )
    .slice(0, k)
}

// ── just-in-time 회상 (RFC 0049 ② · 진통제 · precision ≫ recall) ──
/** 약매칭은 침묵(오경보 = 신뢰 즉사 · Norman). RFC default — 추후 eval 로 보정. */
const JIT_MIN_SCORE = 1.5

/**
 * 위험행동 직전 회상. resolveGuard() 가 confirm/preview/warn 낼 때 직전 호출.
 * 강한 매칭 + 활성 항목만 반환(없으면 빈 배열 = 침묵).
 */
export function recallForAction(
  mem: MemoryFileV2,
  action: string,
  context = '',
  nowMs: number = Date.now()
): RecallHit[] {
  return recallMemories(mem, `${action} ${context}`, 3, nowMs).filter(
    (h) => h.score >= JIT_MIN_SCORE && isActive(h.entry)
  )
}

/** vhk recall <자연어> — 키워드 회상 결과 출력(왜 떠올랐는지 신호 동반). I/O 글루(로직=recallMemories). */
export async function memoryRecall(query: string): Promise<void> {
  console.log(chalk.bold('\n🔎 기억 회상'))
  console.log(chalk.gray('─'.repeat(40)))
  if (!query || !query.trim()) {
    console.log(chalk.red('❌ 찾을 내용을 입력해주세요. 예: vhk recall "배포 막힘"'))
    process.exitCode = 1
    return
  }
  const cwd = process.cwd()
  const q = query.trim()
  const hits = recallMemories(readMemory(cwd), q)
  // RFC 0049 ④: 실쿼리 축적(검증·미래 데이터). best-effort — 실패해도 recall 안 막음.
  logRecall(cwd, { source: 'recall', query: q, hitIds: hits.map((h) => h.entry.id), topScore: hits[0]?.score ?? 0 })
  if (hits.length === 0) {
    console.log(chalk.yellow(`\n📭 "${q}" 관련 기억이 없습니다.`))
    return
  }
  console.log(chalk.cyan(`\n${hits.length}개 관련 기억:\n`))
  for (const h of hits) {
    const f = h.entry as FailEntry
    const text = h.entry.content || f.lesson || h.entry.id
    console.log(`  ${STATUS_ICON[h.entry.status] ?? '🟢'} (${BUCKET_LABEL[h.bucket]}) ${text}`)
    if (h.entry.content && f.lesson) console.log(chalk.dim(`      💡 ${f.lesson}`))
    if (h.entry.tags.length) console.log(chalk.blue(`      🏷️  ${h.entry.tags.join(', ')}`))
    const s = h.signals
    console.log(
      chalk.gray(`      ↳ 점수 ${h.score.toFixed(2)} (키워드 ${s.keyword.toFixed(2)}·태그 ${s.tagMatch}·최근 ${s.recency.toFixed(2)}·상태 ${s.status})`)
    )
  }
}
