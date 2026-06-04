import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import inquirer from 'inquirer'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { ensureInteractive } from '../lib/interactive.js'
import { readMemory, loadForMutation, writeMemory } from './memory.js'
import { sync } from './sync.js'
import type { PatternEntryV19 } from './pattern.js'

/**
 * Goal 20: vhk evolve — 패턴 → RULES.md 반영 큐 & 순수 함수.
 * Task 1: 스키마 타입 + 순수 함수 + 큐 I/O. 커맨드 핸들러는 Task 2~4.
 */

export const QUEUE_PATH_REL = join('.vhk', 'evolve', 'queue.json')
export const QUEUE_VERSION = 1

export type EvolveItemStatus = 'pending' | 'rejected' | 'applied'

export interface EvolveQueueItem {
  id: string              // 'e1', 'e2', ...
  patternId: string       // reference only, no copy
  kind: 'rule'
  status: EvolveItemStatus
  draft: string
  dedupeKey: string       // `${patternId}:${kind}`
  createdAt: string
  appliedAt?: string
  rulesBackupPath?: string
}

export interface EvolveQueueFile {
  version: 1
  items: EvolveQueueItem[]
}

// ── 순수 함수 ──────────────────────────────────────────────────────────────────

/**
 * 결정적 한국어 룰 초안 생성 — 같은 입력 → 같은 출력(ML/LLM 없음).
 * 예: "- 태그 'build' 관련 작업 시 사전 점검 필수 (근거: 3건 반복, [avoid] 태그 'build' 3건 반복)"
 */
export function buildDraft(p: PatternEntryV19): string {
  const axisLabel = p.axis === 'tag' ? `태그 '${p.signal}'` : `키워드 '${p.signal}'`
  const countDesc = `${p.count}건 반복`
  return `- ${axisLabel} 관련 작업 시 사전 점검 필수 (근거: ${countDesc}, ${p.summary})`
}

/** dedupeKey = `${patternId}:${kind}` */
export function buildDedupeKey(patternId: string, kind: 'rule'): string {
  return `${patternId}:${kind}`
}

/**
 * 후보 생성 — 순수 함수. 부수효과 없음.
 * v0 규칙: kind==='avoid' AND status==='active' 패턴만 대상.
 * A1: 같은 dedupeKey 가 rejected 이면 재제안 억제.
 * A2: 같은 dedupeKey 가 pending/applied 이면 스킵.
 * 결정성: patternId 알파벳 오름차순 정렬.
 */
export function generateCandidates(
  patterns: PatternEntryV19[],
  existing: EvolveQueueItem[]
): Omit<EvolveQueueItem, 'id' | 'createdAt'>[] {
  const rejectedKeys = new Set(
    existing.filter((i) => i.status === 'rejected').map((i) => i.dedupeKey)
  )
  const occupiedKeys = new Set(
    existing.filter((i) => i.status === 'pending' || i.status === 'applied').map((i) => i.dedupeKey)
  )

  const eligible = patterns
    .filter((p) => p.kind === 'avoid' && p.status === 'active')
    .sort((a, b) => a.id.localeCompare(b.id))

  const result: Omit<EvolveQueueItem, 'id' | 'createdAt'>[] = []
  for (const p of eligible) {
    const dedupeKey = buildDedupeKey(p.id, 'rule')
    if (rejectedKeys.has(dedupeKey)) continue  // A1: rejected → 재제안 억제
    if (occupiedKeys.has(dedupeKey)) continue   // A2: pending/applied → 스킵
    result.push({
      patternId: p.id,
      kind: 'rule',
      status: 'pending',
      draft: buildDraft(p),
      dedupeKey,
    })
  }
  return result
}

/**
 * B3 중복 감지 — RULES.md 의 기존 라인과 draft 가 정규화 후 동일하면 true.
 * 정규화: trim + 연속 공백 collapse + lowercase.
 */
export function isDuplicateRule(rulesContent: string, draft: string): boolean {
  const normalize = (s: string): string =>
    s.trim().replace(/\s+/g, ' ').toLowerCase()

  const normalizedDraft = normalize(draft)
  for (const line of rulesContent.split(/\r?\n/)) {
    if (normalize(line) === normalizedDraft) return true
  }
  return false
}

// ── 큐 I/O ────────────────────────────────────────────────────────────────────

/** BOM-safe 문자열 → JSON 파싱. */
function stripBomStr(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

/**
 * queue.json 읽기. BOM-safe.
 * 파일 없음 또는 손상 → {version:1, items:[]} 반환 (절대 throw 안 함).
 */
export function readQueue(cwd: string): EvolveQueueFile {
  const p = join(cwd, QUEUE_PATH_REL)
  if (!existsSync(p)) return { version: 1, items: [] }
  try {
    const raw = stripBomStr(readFileSync(p, 'utf-8'))
    const parsed = JSON.parse(raw) as EvolveQueueFile
    if (!parsed || !Array.isArray(parsed.items)) return { version: 1, items: [] }
    return parsed
  } catch {
    return { version: 1, items: [] }
  }
}

/**
 * queue.json 쓰기. 디렉터리가 없으면 재귀 생성.
 */
export function writeQueue(cwd: string, queue: EvolveQueueFile): void {
  const p = join(cwd, QUEUE_PATH_REL)
  mkdirSync(join(cwd, '.vhk', 'evolve'), { recursive: true })
  writeFileSync(p, JSON.stringify(queue, null, 2) + '\n', 'utf-8')
}

/**
 * 다음 큐 아이템 id 생성. e{n+1} 형식.
 * 빈 큐 → 'e1'. e3 까지 있으면 → 'e4'.
 */
export function nextQueueId(queue: EvolveQueueFile): string {
  const re = /^e(\d+)$/
  let max = 0
  for (const item of queue.items) {
    const m = item.id.match(re)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `e${max + 1}`
}

export type ApplyRefResult = 'ok' | 'dismissed' | 'already-applied'

/**
 * A4 가드 — 순수 함수.
 * - pattern undefined 또는 active: 'ok'
 * - archived + queue 에 applied 없음: 'dismissed'
 * - archived + queue 에 applied 있음: 'already-applied'
 */
export function checkApplyRef(
  pattern: PatternEntryV19 | undefined,
  queueItems: EvolveQueueItem[]
): ApplyRefResult {
  if (pattern === undefined || pattern.status !== 'archived') return 'ok'
  const hasApplied = queueItems.some(
    (i) => i.patternId === pattern.id && i.status === 'applied'
  )
  return hasApplied ? 'already-applied' : 'dismissed'
}

// ── 커맨드 핸들러 ──────────────────────────────────────────────────────────────

export async function evolveSuggest(opts: { json?: boolean } = {}): Promise<void> {
  const cwd = process.cwd()

  // RULES.md 없으면 suggest 의미 없음 (반영 타깃 없음)
  if (!existsSync(join(cwd, 'RULES.md'))) {
    console.log(chalk.yellow('\n⚠️  ' + t('evolve.noRules')))
    process.exitCode = 1
    return
  }

  const mem = readMemory(cwd)
  const patterns = mem.patterns as PatternEntryV19[]
  const queue = readQueue(cwd)
  const newItems = generateCandidates(patterns, queue.items)

  if (newItems.length === 0 && !opts.json) {
    const activeAvoid = patterns.filter(p => p.kind === 'avoid' && p.status === 'active')
    if (activeAvoid.length === 0) {
      console.log(chalk.yellow('\n📭 ' + t('evolve.noPatterns')))
      return
    }
    console.log(chalk.dim('\n  ' + t('evolve.allSuggested')))
    return
  }

  const now = new Date().toISOString()
  for (const c of newItems) {
    queue.items.push({ ...c, id: nextQueueId(queue), createdAt: now })
  }
  writeQueue(cwd, queue)

  if (opts.json) {
    const pending = queue.items.filter(i => i.status === 'pending')
    console.log(JSON.stringify(pending, null, 2))
    return
  }

  console.log(chalk.bold('\n🔄 ' + t('evolve.suggestTitle')))
  console.log(chalk.gray('─'.repeat(40)))
  console.log(chalk.dim('  ' + t('evolve.newCandidates', newItems.length)))

  const pending = queue.items.filter(i => i.status === 'pending')
  console.log(chalk.cyan(`\n후보 ${pending.length}개:\n`))
  for (const item of pending) {
    console.log(`  [${item.id}] (${item.status}) 패턴 ${item.patternId} → rule`)
    console.log(chalk.dim(`      초안: ${item.draft}`))
  }

  printNextStep({
    message: `진화 후보 ${pending.length}개 생성됨!`,
    command: 'vhk evolve list',
    cursorHint: '진화 후보 보여줘',
    alternative: 'vhk evolve apply <id> 로 반영',
  })
}

export async function evolveList(opts: { status?: string; json?: boolean } = {}): Promise<void> {
  const cwd = process.cwd()
  const queue = readQueue(cwd)

  const VALID: EvolveItemStatus[] = ['pending', 'rejected', 'applied']
  let items = queue.items
  if (opts.status && VALID.includes(opts.status as EvolveItemStatus)) {
    items = items.filter(i => i.status === opts.status)
  }

  if (opts.json) {
    console.log(JSON.stringify(items, null, 2))
    return
  }

  console.log(chalk.bold('\n🔄 ' + t('evolve.listTitle')))
  console.log(chalk.gray('─'.repeat(40)))

  if (items.length === 0) {
    console.log(chalk.yellow('\n📭 ' + t('evolve.noQueue')))
    console.log(chalk.gray('   ' + t('evolve.suggestHint')))
    return
  }

  const STATUS_ICON: Record<EvolveItemStatus, string> = {
    pending: '⏳', rejected: '❌', applied: '✅',
  }
  console.log(chalk.cyan(`\n${items.length}개:\n`))
  for (const item of items) {
    console.log(`  [${item.id}] ${STATUS_ICON[item.status]} (${item.status}) → ${item.draft}`)
    if (item.appliedAt) console.log(chalk.dim(`      반영: ${item.appliedAt}`))
  }
}

export async function evolveApply(idStr: string): Promise<void> {
  // 1. TTY 가드 — 비-TTY면 즉시 종료
  if (!ensureInteractive('apply는 TTY 확인이 필요합니다. 터미널에서 직접 실행하세요.')) return

  const cwd = process.cwd()
  const rulesPath = join(cwd, 'RULES.md')

  // 2. RULES.md 존재 확인
  if (!existsSync(rulesPath)) {
    console.log(chalk.red('\n❌ ' + t('evolve.noRules')))
    process.exitCode = 1
    return
  }

  // 3. 큐 로드 + 항목 찾기
  const queue = readQueue(cwd)
  const item = queue.items.find(i => i.id === idStr?.trim())
  if (!item) {
    console.log(chalk.red('\n❌ ' + t('evolve.notFound', idStr ?? '')))
    process.exitCode = 1
    return
  }
  if (item.status === 'applied') {
    console.log(chalk.yellow('\n⚠️  ' + t('evolve.alreadyApplied')))
    return
  }

  // 4. C1 단일 apply 제약: 미해소 apply 항목 있으면 차단
  const hasUnresolved = queue.items.some(i => i.status === 'applied')
  if (hasUnresolved) {
    console.log(chalk.red('\n❌ ' + t('evolve.pendingApplyExists')))
    process.exitCode = 1
    return
  }

  // 5. A4 댕글링 참조 가드
  const mem = readMemory(cwd)
  const srcPattern = (mem.patterns as PatternEntryV19[]).find(p => p.id === item.patternId)
  const refResult = checkApplyRef(srcPattern, queue.items)
  if (refResult === 'dismissed') {
    console.log(chalk.red('\n❌ ' + t('evolve.dismissed')))
    process.exitCode = 1
    return
  }
  if (refResult === 'already-applied') {
    console.log(chalk.red('\n❌ ' + t('evolve.alreadyAppliedPattern')))
    process.exitCode = 1
    return
  }

  // 6. B3: RULES.md 중복 룰 감지
  const rulesContent = readFileSync(rulesPath, 'utf-8')
  if (isDuplicateRule(rulesContent, item.draft)) {
    console.log(chalk.yellow('\n⚠️  ' + t('evolve.duplicateRule', item.draft)))
    return
  }

  // 7. diff 출력 + B2: 사람이 문구 수정 가능
  console.log(chalk.bold('\n🔄 ' + t('evolve.applyTitle')))
  console.log(chalk.gray('─'.repeat(40)))
  console.log(chalk.cyan('\n추가될 룰 초안:'))
  console.log(chalk.white(`  ${item.draft}`))

  const { editedDraft } = await inquirer.prompt<{ editedDraft: string }>([{
    type: 'input',
    name: 'editedDraft',
    message: '룰 문구 수정 (Enter = 그대로):',
    default: item.draft,
  }])

  const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([{
    type: 'confirm',
    name: 'confirmed',
    message: `RULES.md에 이 룰을 추가할까요?\n  ${editedDraft}`,
    default: false,
  }])

  if (!confirmed) {
    console.log(chalk.dim('  취소됨.'))
    return
  }

  // 8. .bak 저장 (undo용)
  const backupPath = rulesPath + '.bak'
  copyFileSync(rulesPath, backupPath)

  // 9. RULES.md append
  const appendContent = '\n' + editedDraft + '\n'
  writeFileSync(rulesPath, rulesContent + appendContent, 'utf-8')

  // 10. sync 비대화형 재생성 (yes:true — apply가 이미 확인 완료, 이중 프롬프트 금지)
  await sync({ yes: true })

  // 11. A3: queue item → applied, 소스 패턴 → archived
  const now = new Date().toISOString()
  item.status = 'applied'
  item.draft = editedDraft
  item.appliedAt = now
  item.rulesBackupPath = backupPath
  writeQueue(cwd, queue)

  // 소스 패턴 archived (18 status 선순환 재사용, 신규 status 금지)
  if (srcPattern) {
    const memLoaded = loadForMutation(cwd)
    if (memLoaded.ok) {
      const p = (memLoaded.mem.patterns as PatternEntryV19[]).find(x => x.id === srcPattern.id)
      if (p) {
        p.status = 'archived'
        writeMemory(cwd, memLoaded.mem)
      }
    }
  }

  console.log(chalk.green(`\n✅ 룰 반영 완료! [${item.id}]`))
  console.log(chalk.dim('   RULES.md에 추가 + vhk sync 재생성됨'))
  printNextStep({
    message: '룰 반영 완료!',
    command: 'vhk evolve list --status applied',
    cursorHint: '반영된 룰 목록 보여줘',
    alternative: 'vhk evolve undo — 되돌리기',
  })
}
export async function evolveReject(_idStr: string): Promise<void> { /* Task 4 */ }
export async function evolveUndo(): Promise<void> { /* Task 4 */ }
