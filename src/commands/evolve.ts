import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import { atomicWriteFile } from '../lib/atomic-write.js'
import { prompt } from '../lib/prompt.js'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { ensureInteractive } from '../lib/interactive.js'
import { ensureNotHardStopped } from '../lib/hard-stop-guard.js'
import { readMemory, loadForMutation, writeMemory } from './memory.js'
import { sync } from './sync.js'
import type { PatternEntryV19 } from './pattern.js'

/**
 * Goal 20: vhk evolve — 패턴 → RULES.md 반영 큐 & 순수 함수.
 * Task 1: 스키마 타입 + 순수 함수 + 큐 I/O. 커맨드 핸들러는 Task 2~4.
 */

export const QUEUE_PATH_REL = join('.vhk', 'evolve', 'queue.json')
// Goal 58: 스키마 v2 — 진화 큐가 5계층 자기개선(memory/rule/workflow/code/product)을 표현.
export const QUEUE_VERSION = 2

/** 진화 제안이 반영될 타깃 계층(5계층 자기개선). v1 의 단일 'rule' 을 일반화. */
export type TargetLayer = 'memory' | 'rule' | 'workflow' | 'code' | 'product'
export const TARGET_LAYERS: TargetLayer[] = ['memory', 'rule', 'workflow', 'code', 'product']

export type EvolveItemStatus = 'pending' | 'rejected' | 'applied'

export interface EvolveQueueItem {
  id: string              // 'e1', 'e2', ...
  patternId: string       // reference only, no copy
  kind: 'rule'            // (deprecated, v1 호환) 항상 'rule'. 신규 코드는 targetLayer 사용.
  targetLayer?: TargetLayer // v2: 반영 타깃 계층. 미지정(v1 항목)은 'rule' 로 간주.
  status: EvolveItemStatus
  draft: string
  dedupeKey: string       // `${patternId}:${targetLayer}` (v1 = `${patternId}:rule` 와 동일)
  createdAt: string
  appliedAt?: string
  rulesBackupPath?: string
}

export interface EvolveQueueFile {
  version: number         // 1 = legacy, 2 = current. readQueue 가 v1 을 자동 변환.
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

/** dedupeKey = `${patternId}:${targetLayer}`. v1 의 `${patternId}:rule` 과 하위호환(targetLayer 기본 'rule'). */
export function buildDedupeKey(patternId: string, targetLayer: TargetLayer = 'rule'): string {
  return `${patternId}:${targetLayer}`
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
    // v0 후보는 모두 'rule' 계층 타깃(패턴→RULES.md). 다른 계층 생성은 후속.
    const dedupeKey = buildDedupeKey(p.id, 'rule')
    if (rejectedKeys.has(dedupeKey)) continue  // A1: rejected → 재제안 억제
    if (occupiedKeys.has(dedupeKey)) continue   // A2: pending/applied → 스킵
    result.push({
      patternId: p.id,
      kind: 'rule',
      targetLayer: 'rule',
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
 * Goal 58: 큐 스키마 v1 → v2 마이그레이션(순수 함수, 무손실).
 * - 각 항목에 targetLayer 부여(kind:'rule' → targetLayer:'rule' 기본 매핑). 기존 필드 전부 보존.
 * - dedupeKey 를 `${patternId}:${targetLayer}` 로 재계산(v1 'rule' 은 동일 값 → 충돌 0).
 * - version 을 QUEUE_VERSION(2)로 승격.
 */
export function migrateQueueToV2(old: EvolveQueueFile): EvolveQueueFile {
  const items = (old.items ?? []).map((it) => {
    const targetLayer: TargetLayer = it.targetLayer ?? (it.kind === 'rule' ? 'rule' : 'rule')
    return {
      ...it,                       // 무손실: id/patternId/status/draft/createdAt/appliedAt/rulesBackupPath 보존
      kind: 'rule' as const,
      targetLayer,
      dedupeKey: `${it.patternId}:${targetLayer}`,
    }
  })
  return { version: QUEUE_VERSION, items }
}

/**
 * dedupeKey 충돌 검출 — 점유(pending/applied) 항목 중 같은 dedupeKey 가 2회+면 충돌.
 * rejected 는 재제안 억제 키라 중복 허용(충돌 아님). 반환: 충돌한 dedupeKey 목록.
 */
export function findDedupeCollisions(items: EvolveQueueItem[]): string[] {
  const seen = new Set<string>()
  const collided = new Set<string>()
  for (const it of items) {
    if (it.status !== 'pending' && it.status !== 'applied') continue
    if (seen.has(it.dedupeKey)) collided.add(it.dedupeKey)
    else seen.add(it.dedupeKey)
  }
  return [...collided]
}

/**
 * queue.json 읽기. BOM-safe + v1 자동 변환.
 * 파일 없음 또는 손상 → {version:QUEUE_VERSION, items:[]} 반환 (절대 throw 안 함).
 * 디스크가 v1 이면 migrateQueueToV2 로 변환해 v2 를 반환(읽기는 디스크 미변경 — 다음 writeQueue 에서 영속).
 */
export function readQueue(cwd: string): EvolveQueueFile {
  const p = join(cwd, QUEUE_PATH_REL)
  if (!existsSync(p)) return { version: QUEUE_VERSION, items: [] }
  try {
    const raw = stripBomStr(readFileSync(p, 'utf-8'))
    const parsed = JSON.parse(raw) as EvolveQueueFile
    if (!parsed || !Array.isArray(parsed.items)) return { version: QUEUE_VERSION, items: [] }
    if (parsed.version !== QUEUE_VERSION) return migrateQueueToV2(parsed)  // v1(또는 미래 미지원) → v2
    return parsed
  } catch {
    return { version: QUEUE_VERSION, items: [] }
  }
}

/**
 * queue.json 쓰기. 디렉터리가 없으면 재귀 생성.
 * Goal 58: 쓰기 전 .bak(롤링) 백업 + 원본이 v1 이면 .v1.bak(원본 스키마 1회) 보존.
 *   atomicWriteFile 로 원자 치환(프로세스 강제 종료 시 손상 0). 쓰기 실패 시 .bak 복원.
 */
export function writeQueue(cwd: string, queue: EvolveQueueFile): void {
  const p = join(cwd, QUEUE_PATH_REL)
  mkdirSync(join(cwd, '.vhk', 'evolve'), { recursive: true })

  const bakPath = p + '.bak'
  const v1BakPath = p + '.v1.bak'
  if (existsSync(p)) {
    try {
      copyFileSync(p, bakPath)  // 롤링 백업(쓰기 직전 상태)
      if (!existsSync(v1BakPath)) {
        // 원본이 v1 이면 마이그레이션 전 원본 스키마를 1회 보존(.v1.bak)
        const prev = JSON.parse(stripBomStr(readFileSync(p, 'utf-8'))) as { version?: number }
        if (prev?.version === 1) copyFileSync(p, v1BakPath)
      }
    } catch {
      /* 백업 실패는 치명적 아님 — 쓰기는 계속(원자 치환이 손상은 방지) */
    }
  }

  const data = JSON.stringify(queue, null, 2) + '\n'
  try {
    atomicWriteFile(p, data)
  } catch (err) {
    // 쓰기 실패 → .bak 으로 복원(큐 손상 0)
    if (existsSync(bakPath)) {
      try { copyFileSync(bakPath, p) } catch { /* 복원 실패는 무시 — 원래 에러 전파 */ }
    }
    throw err
  }
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
  // suggest는 --json 여부와 무관하게 항상 큐에 기록함 (write-first, then output).
  // CI에서 read-only 조회가 필요하면 evolveList --json 사용.
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
  if (!ensureNotHardStopped('evolve apply')) return // HARD_STOP 활성 시 RULES.md 변경 차단(TTY보다 우선)
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
    process.exitCode = 1
    return
  }

  // 4. C1 단일 apply 제약: 미해소 apply 항목 있으면 차단
  const hasUnresolved = queue.items.some(i => i.status === 'applied')
  if (hasUnresolved) {
    console.log(chalk.red('\n❌ ' + t('evolve.pendingApplyExists')))
    process.exitCode = 1
    return
  }

  // 5. A4 댕글링 참조 가드 (loadForMutation 단일 사용 — readMemory 이중 I/O 제거)
  const memLoaded = loadForMutation(cwd)
  if (!memLoaded.ok) {
    console.log(chalk.red('\n❌ memory.json 손상 의심 — apply 중단 (원본 보존).'))
    process.exitCode = 1
    return
  }
  const srcPattern = (memLoaded.mem.patterns as PatternEntryV19[]).find(p => p.id === item.patternId)
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

  const { editedDraft } = await prompt<{ editedDraft: string }>([{
    type: 'input',
    name: 'editedDraft',
    message: '룰 문구 수정 (Enter = 그대로):',
    default: item.draft,
  }])

  const { confirmed } = await prompt<{ confirmed: boolean }>([{
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

  // 9. RULES.md append + sync — try-catch로 partial state 방지
  const appendContent = '\n' + editedDraft + '\n'
  try {
    writeFileSync(rulesPath, rulesContent + appendContent, 'utf-8')
    await sync({ yes: true })
  } catch (err) {
    // sync/write 실패 → .bak으로 롤백, 상태 불변 유지
    try { copyFileSync(backupPath, rulesPath) } catch { /* 롤백 실패는 치명적 아님 */ }
    console.error(chalk.red('\n❌ RULES.md 반영 중 오류 — 원본 복원됨. 다시 시도하세요.'))
    console.error(chalk.dim(`   ${err instanceof Error ? err.message : String(err)}`))
    process.exitCode = 1
    return
  }

  // 10. A3: queue item → applied, 소스 패턴 → archived
  const now = new Date().toISOString()
  item.status = 'applied'
  item.draft = editedDraft
  item.appliedAt = now
  item.rulesBackupPath = backupPath
  writeQueue(cwd, queue)

  // 소스 패턴 archived (18 status 선순환 재사용, 신규 status 금지)
  // memLoaded는 step 5에서 이미 로드됨 — 이중 I/O 없음
  if (srcPattern) {
    const p = (memLoaded.mem.patterns as PatternEntryV19[]).find(x => x.id === srcPattern.id)
    if (p) {
      p.status = 'archived'
      writeMemory(cwd, memLoaded.mem)
    } else {
      console.error(chalk.yellow('  ⚠️  소스 패턴 archived 처리 실패 (memory.json 손상 의심). 룰은 반영됐습니다.'))
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
export async function evolveReject(idStr: string): Promise<void> {
  if (!ensureNotHardStopped('evolve reject')) return
  const cwd = process.cwd()
  const queue = readQueue(cwd)
  const item = queue.items.find(i => i.id === idStr?.trim())

  if (!item) {
    console.log(chalk.red('\n❌ ' + t('evolve.notFound', idStr ?? '')))
    process.exitCode = 1
    return
  }

  if (item.status === 'rejected') {
    console.log(chalk.dim(`  이미 기각된 후보입니다 — 변경 없음: ${item.id}`))
    return
  }

  if (item.status === 'applied') {
    console.log(chalk.red(`\n❌ 이미 반영된 항목은 기각할 수 없습니다 — vhk evolve undo 로 되돌리세요: ${item.id}`))
    process.exitCode = 1
    return
  }

  item.status = 'rejected'
  writeQueue(cwd, queue)

  console.log(chalk.green(`\n❌ 후보 기각됨: [${item.id}] ${item.draft}`))
  console.log(chalk.dim('   (A1: 다음 suggest에서 재제안 안 됨)'))

  printNextStep({
    message: '기각 완료!',
    command: 'vhk evolve list',
    cursorHint: '남은 후보 보여줘',
  })
}

export async function evolveUndo(): Promise<void> {
  if (!ensureNotHardStopped('evolve undo')) return
  // 1. TTY 가드
  if (!ensureInteractive('undo는 TTY 확인이 필요합니다. 터미널에서 직접 실행하세요.')) return

  const cwd = process.cwd()
  const queue = readQueue(cwd)
  const applied = queue.items.filter(i => i.status === 'applied')

  if (applied.length === 0) {
    console.log(chalk.yellow('\n📭 ' + t('evolve.noAppliedToUndo')))
    return
  }

  // 2. 가장 최근 apply 1건 (appliedAt 기준 내림차순)
  const last = applied.sort((a, b) =>
    (b.appliedAt ?? '').localeCompare(a.appliedAt ?? '')
  )[0]

  // 3. .bak 존재 확인
  if (!last.rulesBackupPath || !existsSync(last.rulesBackupPath)) {
    console.log(chalk.red('\n❌ ' + t('evolve.noBackup')))
    process.exitCode = 1
    return
  }

  console.log(chalk.bold('\n🔄 ' + t('evolve.undoTitle')))
  console.log(chalk.dim(`  되돌릴 항목: [${last.id}] ${last.draft}`))

  // 4. 확인 프롬프트
  const { confirmed } = await prompt<{ confirmed: boolean }>([{
    type: 'confirm',
    name: 'confirmed',
    message: 'RULES.md를 .bak으로 복원하고 vhk sync를 재실행할까요?',
    default: false,
  }])

  if (!confirmed) {
    console.log(chalk.dim('  취소됨.'))
    return
  }

  // 5. RULES.md .bak 복원
  copyFileSync(last.rulesBackupPath, join(cwd, 'RULES.md'))

  // 6. undo 재sync 비대화형 (이중 프롬프트 금지)
  try {
    await sync({ yes: true })
  } catch (err) {
    console.error(chalk.red('\n❌ sync 재실행 중 오류. RULES.md는 복원됐으나 .cursorrules 등 재생성 실패.'))
    console.error(chalk.dim(`   ${err instanceof Error ? err.message : String(err)}`))
    console.error(chalk.dim('   수동으로 `vhk sync` 실행하세요.'))
    // queue/pattern 상태는 아래에서 계속 업데이트 (sync 실패해도 queue는 정리)
  }

  // 7. queue item → pending (되돌리기), appliedAt + rulesBackupPath 제거
  last.status = 'pending'
  delete last.appliedAt
  delete last.rulesBackupPath
  writeQueue(cwd, queue)

  // 8. 소스 패턴 → active 복구 (archived → active)
  const memLoaded = loadForMutation(cwd)
  if (memLoaded.ok) {
    const p = (memLoaded.mem.patterns as PatternEntryV19[]).find(x => x.id === last.patternId)
    if (p && p.status === 'archived') {
      p.status = 'active'
      writeMemory(cwd, memLoaded.mem)
    }
  }

  console.log(chalk.green('\n✅ 되돌리기 완료! RULES.md 복원 + sync 재실행됨'))
  printNextStep({
    message: '되돌리기 완료!',
    command: 'vhk evolve list',
    cursorHint: '후보 목록 보여줘',
  })
}
