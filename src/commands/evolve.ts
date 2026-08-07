import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import { atomicWriteFile } from '../lib/atomic-write.js'
import { prompt } from '../lib/prompt.js'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { ensureInteractive } from '../lib/interactive.js'
import { ensureNotHardStopped } from '../lib/hard-stop-guard.js'
import { readMemory, loadForMutation, writeMemory, type FailEntry } from './memory.js'
import { sync } from './sync.js'
import { reconcilePatterns, type PatternEntryV19 } from './pattern.js'
import {
  appendEvolveLog,
  buildEvolveLogEntry,
  buildEvolveUndoLogEntry,
  currentEvolveDecisionKeys,
  currentEvolveDecisions,
  readEvolveLog,
} from '../lib/evolve-log.js'
import {
  buildCandidateDraft,
  EVOLVE_CANDIDATE_TTL_DAYS,
  generateInlineCandidates,
  type InlineEvolveCandidate,
} from '../lib/evolve-candidates.js'
import { parsePatMarkdown, failureToSeed, tsToSeed, renderSeedPreview, type SeedCandidate } from '../lib/seed-mine.js'
import { log } from '../utils/logger.js'

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
  return buildCandidateDraft(p)
}

/** dedupeKey = `${patternId}:${targetLayer}`. v1 의 `${patternId}:rule` 과 하위호환(targetLayer 기본 'rule'). */
export function buildDedupeKey(patternId: string, targetLayer: TargetLayer = 'rule'): string {
  return `${patternId}:${targetLayer}`
}

/**
 * 후보 생성 — 순수 함수. 부수효과 없음.
 * 규칙: kind ∈ {avoid, reinforce} AND status==='active' 패턴 대상 (N2: 성공패턴도 복리 — reinforce 후보화).
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
    .filter((p) => (p.kind === 'avoid' || p.kind === 'reinforce') && p.status === 'active')
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
  // 방어: items 가 배열이 아니면(손상/오용) 빈 배열로 — 순수·무throw 계약 유지.
  const items = (Array.isArray(old.items) ? old.items : []).map((it) => {
    // v1 항목은 targetLayer 부재 → 'rule' 로 매핑(현 v1 kind 는 'rule' 단일).
    const targetLayer: TargetLayer = it.targetLayer ?? 'rule'
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
    const v = typeof parsed.version === 'number' ? parsed.version : 1
    if (v === QUEUE_VERSION) return parsed
    if (v < QUEUE_VERSION) return migrateQueueToV2(parsed)  // v1 → v2 (상향 마이그레이션만)
    return parsed  // 미래 버전(v3+) — 다운그레이드 금지, best-effort 그대로 반환(데이터 손실 방지)
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
      // 기존 파일이 파싱되는 경우에만 백업 — 손상본이 양호한 .bak 을 덮어쓰는 걸 방지.
      const prevRaw = stripBomStr(readFileSync(p, 'utf-8'))
      const prev = JSON.parse(prevRaw) as { version?: number }
      copyFileSync(p, bakPath)  // 롤링 백업(쓰기 직전 양호 상태)
      // 원본이 v1 이면 마이그레이션 전 원본 스키마를 1회 보존(.v1.bak)
      if (!existsSync(v1BakPath) && prev?.version === 1) copyFileSync(p, v1BakPath)
    } catch {
      /* 기존 파일 손상/읽기 실패 → 백업 스킵(양호한 .bak 보존). 원자 치환이 손상은 방지 */
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

// ── goal 69: 부정 예시 수집(❌ 후보) — 순수 함수 ─────────────────────────────────
// 출처: Fable5 "부정 예시 설계" — 실패가 자산. ✅/❌ 쌍에서 ❌(하지 마라) 쪽을 실패 기록에서 자동 수집.

const NEGATIVES_PATH = join('.vhk', 'negative-candidates.md')

/** 실패 교훈 1건 → "❌ 하지 마라: <행동> — 이유: <원인>". content 비면 lesson→id 폴백. */
export function buildNegativeFromFailure(e: FailEntry): string {
  const action = (e.content || e.lesson || e.id || '').split('\n')[0].trim()
  const why = (e.why || '').split('\n')[0].trim()
  return why ? `❌ 하지 마라: ${action} — 이유: ${why}` : `❌ 하지 마라: ${action}`
}

/** 트러블슈팅 문서 본문에서 첫 H1 제목 추출(없으면 null). */
export function extractTsTitle(content: string): string | null {
  const m = /^#\s+(.+)$/m.exec(content)
  return m ? m[1].trim() : null
}

export interface TsNegative {
  id: string
  title: string
}

/** failures + troubleshooting → ❌ 후보 마크다운 본문(순수·결정적, 타임스탬프는 핸들러가 주입). */
export function renderNegativeCandidates(failures: FailEntry[], ts: TsNegative[]): string {
  const lines: string[] = []
  lines.push('## memory failures 버킷')
  lines.push('')
  if (failures.length) failures.forEach((f) => lines.push(`- ${buildNegativeFromFailure(f)}`))
  else lines.push('- (수집된 실패 교훈 없음 — `vhk learn` 으로 실패 기록 시 채워짐)')
  lines.push('')
  lines.push('## docs/troubleshooting')
  lines.push('')
  if (ts.length) ts.forEach((t) => lines.push(`- ❌ 반복 금지: ${t.title} (출처: ${t.id})`))
  else lines.push('- (트러블슈팅 기록 없음)')
  return lines.join('\n')
}

// ── 커맨드 핸들러 ──────────────────────────────────────────────────────────────

/**
 * goal 69: vhk evolve negatives — 실패 패턴 → RULES.md ❌ 예시 후보 제안.
 * 수집원: memory failures 버킷 + docs/troubleshooting/TS-NNN. 출력: .vhk/negative-candidates.md.
 * **RULES.md 자동 편집 0** — 후보 제안만(사람 검토 후 직접 추가). 빈 입력도 graceful.
 */
export function evolveNegatives(): void {
  const cwd = process.cwd()
  const failures = readMemory(cwd).failures

  const ts: TsNegative[] = []
  const tsDir = join(cwd, 'docs', 'troubleshooting')
  try {
    if (existsSync(tsDir)) {
      for (const f of readdirSync(tsDir)) {
        if (!/^TS-\d+.*\.md$/i.test(f)) continue
        try {
          const title = extractTsTitle(readFileSync(join(tsDir, f), 'utf-8'))
          const id = /^(TS-\d+)/i.exec(f)?.[1] ?? f
          if (title) ts.push({ id, title })
        } catch {
          /* 개별 파일 읽기 실패 — 건너뜀 */
        }
      }
    }
  } catch {
    /* 디렉토리 읽기 실패 — graceful(빈 ts) */
  }

  const header = [
    '# Negative Candidates — ❌ 예시 후보',
    '',
    '> ⚠️ 자동 제안일 뿐 — RULES.md 를 자동 편집하지 않는다. 사람이 검토 후 직접 추가.',
    `> 생성: ${new Date().toLocaleString('ko-KR')}`,
    '',
  ].join('\n')
  const content = header + renderNegativeCandidates(failures, ts) + '\n'

  try {
    if (!existsSync(join(cwd, '.vhk'))) mkdirSync(join(cwd, '.vhk'), { recursive: true })
    writeFileSync(join(cwd, NEGATIVES_PATH), content, 'utf-8')
  } catch {
    /* 쓰기 실패 → stdout 만 */
  }

  console.log(chalk.bold('\n🚫 ' + t('evolve.negativesTitle')))
  console.log(chalk.gray('─'.repeat(40)))
  console.log(content)
  console.log(chalk.gray(`\n📄 저장: ${NEGATIVES_PATH}`))
  printNextStep({
    message: '검토 후 유효한 ❌ 예시만 RULES.md 에 직접 추가하세요 (자동 편집 안 함).',
    command: 'vhk sync',
    cursorHint: 'RULES.md 에 부정 예시 추가해줘',
  })
}

// ── goal 100: cold-start 역채굴 — memory.patterns 채우기(evolve 파이프라인 시동) ──────────────
// memory.patterns=0 이면 evolveSuggest 가 activePatterns.length===0 에서 즉시 📭 return 한다
// (아래 evolveSuggest 참조) — 즉 이 함수가 채우기 전까지 evolve 파이프라인은 시동조차 안 걸린다.
// dry-run(기본): .vhk/seed-candidates.md 미리보기만, memory.patterns 미변경.
// --write: reconcilePatterns(pattern.ts) 로 병합(멱등 — 재실행해도 중복 증가 없음).

const SEED_CANDIDATES_PATH = join('.vhk', 'seed-candidates.md')

export async function evolveSeed(opts: { write?: boolean; json?: boolean } = {}): Promise<void> {
  const cwd = process.cwd()

  // PAT 채굴 (docs/patterns/*.md) — 비-PAT 파일(README 등)은 parsePatMarkdown 이 null 반환해 자연 skip.
  const patCandidates: SeedCandidate[] = []
  const patDir = join(cwd, 'docs', 'patterns')
  try {
    if (existsSync(patDir)) {
      for (const f of readdirSync(patDir)) {
        if (!f.endsWith('.md')) continue
        try {
          const raw = readFileSync(join(patDir, f), 'utf-8')
          const cand = parsePatMarkdown(raw, `docs/patterns/${f}`)
          if (cand) patCandidates.push(cand)
        } catch {
          /* 개별 PAT 파일 읽기/파싱 실패 — 건너뜀(best-effort) */
        }
      }
    }
  } catch {
    /* 디렉토리 읽기 실패 — graceful(빈 목록) */
  }

  // loadForMutation — 손상 시 중단(원본 보존). patternDetect(pattern.ts)와 동일 안전계약.
  const loaded = loadForMutation(cwd)
  if (!loaded.ok) {
    console.log(chalk.red('❌ memory.json 손상 의심 — 채굴 중단(원본 보존). 백업 확인 후 재시도하세요.'))
    process.exitCode = 1
    return
  }
  const mem = loaded.mem
  const failCandidates = mem.failures.map(failureToSeed)

  // TS 채굴 (docs/troubleshooting/TS-*.md) — evolveNegatives 와 동일 스캔 로직.
  const tsCandidates: SeedCandidate[] = []
  const tsDir = join(cwd, 'docs', 'troubleshooting')
  try {
    if (existsSync(tsDir)) {
      for (const f of readdirSync(tsDir)) {
        if (!/^TS-\d+.*\.md$/i.test(f)) continue
        try {
          const title = extractTsTitle(stripBomStr(readFileSync(join(tsDir, f), 'utf-8')))
          const id = /^(TS-\d+)/i.exec(f)?.[1] ?? f
          if (title) tsCandidates.push(tsToSeed(id, title, `docs/troubleshooting/${f}`))
        } catch {
          /* 개별 TS 파일 읽기 실패 — 건너뜀 */
        }
      }
    }
  } catch {
    /* 디렉토리 읽기 실패 — graceful(빈 목록) */
  }

  const allCandidates = [...patCandidates, ...failCandidates, ...tsCandidates]

  if (!opts.write) {
    const generatedAt = new Date().toLocaleString('ko-KR')
    const preview = renderSeedPreview(allCandidates, generatedAt)
    try {
      if (!existsSync(join(cwd, '.vhk'))) mkdirSync(join(cwd, '.vhk'), { recursive: true })
      writeFileSync(join(cwd, SEED_CANDIDATES_PATH), preview, 'utf-8')
    } catch {
      /* 쓰기 실패 → stdout 만 */
    }

    if (opts.json) {
      console.log(JSON.stringify(allCandidates, null, 2))
      return
    }

    console.log(chalk.bold('\n🌱 ' + t('evolve.seedPreviewTitle')))
    console.log(chalk.gray('─'.repeat(40)))
    console.log(
      chalk.dim(
        `  PAT ${patCandidates.length} · failures ${failCandidates.length} · TS ${tsCandidates.length} = 총 ${allCandidates.length}개 후보`
      )
    )
    console.log(chalk.gray(`\n📄 저장: ${SEED_CANDIDATES_PATH} (memory.patterns 미변경 — dry-run)`))
    printNextStep({
      message: '이 미리보기는 memory.patterns 를 바꾸지 않았습니다. 실제 반영하려면 --write 를 붙이세요.',
      command: 'vhk evolve seed --write',
      cursorHint: 'evolve seed --write 로 patterns 채워줘',
    })
    return
  }

  // --write: reconcilePatterns 로 memory.patterns 병합(멱등 — 같은 signal 재발견 시 갱신만, 중복 추가 없음).
  const now = new Date().toISOString()
  const { added, updated } = reconcilePatterns(mem.patterns as PatternEntryV19[], allCandidates, now)
  if (added > 0 || updated > 0) {
    writeMemory(cwd, mem)
  }

  if (opts.json) {
    console.log(JSON.stringify({ added, updated, total: mem.patterns.length }, null, 2))
    return
  }

  console.log(chalk.bold('\n🌱 ' + t('evolve.seedWriteTitle')))
  console.log(chalk.gray('─'.repeat(40)))
  console.log(
    chalk.dim(
      `  PAT ${patCandidates.length} · failures ${failCandidates.length} · TS ${tsCandidates.length} = 총 ${allCandidates.length}개 후보`
    )
  )
  console.log(chalk.dim(`  memory.patterns: 추가 ${added} · 갱신 ${updated} · 전체 ${mem.patterns.length}건`))
  printNextStep({
    message: 'memory.patterns 가 채워졌습니다. evolve suggest 로 룰 후보를 생성하세요.',
    command: 'vhk evolve suggest',
    cursorHint: 'evolve suggest 로 룰 후보 만들어줘',
  })
}

function loadInlineCandidates(cwd: string, nowIso = new Date().toISOString()): InlineEvolveCandidate[] {
  const patterns = readMemory(cwd).patterns as PatternEntryV19[]
  const decidedKeys = currentEvolveDecisionKeys(readEvolveLog(cwd))
  return generateInlineCandidates(patterns, decidedKeys, nowIso)
}

function printInlineCandidate(item: InlineEvolveCandidate): void {
  const expires = new Date(item.expiresAt).toLocaleDateString('ko-KR')
  log.plain(chalk.cyan(`\n  [${item.id}] 규칙 후보`))
  log.plain(`      ${item.draft}`)
  log.dim(`      ${expires}까지 선택하지 않으면 사라집니다.`)
  log.dim(`      승인: vhk evolve apply ${item.id}`)
  log.dim(`      기각: vhk evolve reject ${item.id} "이유"`)
}

export async function evolveSuggest(opts: { json?: boolean } = {}): Promise<void> {
  const cwd = process.cwd()

  if (!existsSync(join(cwd, 'RULES.md'))) {
    console.log(chalk.yellow('\n⚠️  ' + t('evolve.noRules')))
    process.exitCode = 1
    return
  }

  const patterns = readMemory(cwd).patterns as PatternEntryV19[]
  const candidates = loadInlineCandidates(cwd)

  if (opts.json) {
    console.log(JSON.stringify(candidates, null, 2))
    return
  }

  if (candidates.length === 0) {
    const activePatterns = patterns.filter(
      (pattern) => (pattern.kind === 'avoid' || pattern.kind === 'reinforce') && pattern.status === 'active',
    )
    if (activePatterns.length === 0) {
      console.log(chalk.yellow('\n📭 ' + t('evolve.noPatterns')))
      return
    }
    log.dim(`\n  ${t('evolve.allSuggested', EVOLVE_CANDIDATE_TTL_DAYS)}`)
    return
  }

  console.log(chalk.bold('\n🔄 ' + t('evolve.suggestTitle')))
  console.log(chalk.gray('─'.repeat(40)))
  log.dim(`  후보 ${candidates.length}개를 저장하지 않고 바로 보여줍니다.`)
  for (const candidate of candidates) printInlineCandidate(candidate)

  printNextStep({
    message: `판정할 규칙 후보 ${candidates.length}개`,
    command: `vhk evolve apply ${candidates[0].id}`,
    cursorHint: '첫 번째 규칙 후보 승인해줘',
    alternative: `vhk evolve reject ${candidates[0].id} "이유"`,
  })
}

// ── N5(ⓓ): evolve digest — 후보 묶음 PR 초안(읽기 전용·자동 apply 배제) ─────────────

export interface DigestEntry {
  id: string
  targetLayer: TargetLayer
  draft: string
  /** 근거 패턴 빈도(pattern.count). 패턴 미상 → 0. */
  patternCount: number
  /** 빈도 기반 결정적 신뢰도(5+=high · 3~4=med · <3=low). */
  confidence: 'high' | 'med' | 'low'
}

/** pending 후보 + 패턴 → 신뢰도 부여 digest(순수·결정적). 빈도 내림차순, 동률은 id 숫자 오름차순(e2<e10). */
export function buildDigest(pending: EvolveQueueItem[], patterns: PatternEntryV19[]): DigestEntry[] {
  const byId = new Map(patterns.map((p) => [p.id, p]))
  return pending
    .map((it): DigestEntry => {
      const count = byId.get(it.patternId)?.count ?? 0
      return {
        id: it.id,
        targetLayer: it.targetLayer ?? 'rule',
        draft: it.draft,
        patternCount: count,
        confidence: count >= 5 ? 'high' : count >= 3 ? 'med' : 'low',
      }
    })
    .sort((a, b) => b.patternCount - a.patternCount || a.id.localeCompare(b.id, undefined, { numeric: true }))
}

/**
 * N5(ⓓ): vhk evolve digest — pending 룰 후보를 신뢰도별 묶음 초안으로 출력(읽기 전용).
 * RULES.md 미변경·자동 apply 0(철칙 — 반영은 evolve apply 사람 승인). digest = PR 초안 복사용.
 */
export async function evolveDigest(): Promise<void> {
  const cwd = process.cwd()
  const pending = loadInlineCandidates(cwd)
  // 읽기 전용: loadForMutation 은 비영속(persistOnRead write 회피 — loop 과 동일 계약).
  const loaded = loadForMutation(cwd)
  const patterns = (loaded.ok ? loaded.mem.patterns : []) as PatternEntryV19[]
  const digest = buildDigest(pending, patterns)

  console.log(chalk.bold('\n📋 ' + t('evolve.digestTitle')))
  console.log(chalk.gray('─'.repeat(40)))

  if (digest.length === 0) {
    console.log(chalk.dim('  ' + t('evolve.digestEmpty')))
    printNextStep({ message: t('evolve.digestEmpty'), command: 'vhk evolve suggest', cursorHint: '진화 후보 생성해줘' })
    return
  }

  const label: Record<DigestEntry['confidence'], string> = { high: '🟢 high', med: '🟡 med', low: '🔵 low' }
  for (const conf of ['high', 'med', 'low'] as const) {
    const group = digest.filter((d) => d.confidence === conf)
    if (group.length === 0) continue
    console.log(chalk.cyan(`\n${label[conf]} (${group.length})`))
    for (const d of group) {
      console.log(`  [${d.id}] ${d.targetLayer} ← 근거 ${d.patternCount}건`)
      console.log(chalk.dim(`      ${d.draft}`))
    }
  }

  printNextStep({
    message: t('evolve.digestNext', digest.length),
    command: 'vhk evolve apply <id>',
    cursorHint: '이 후보 반영해줘',
    alternative: '초안을 RULES.md PR 로 사람이 검토·반영 (자동 반영 없음)',
  })
}

export async function evolveList(opts: { status?: string; json?: boolean } = {}): Promise<void> {
  const cwd = process.cwd()
  const VALID: EvolveItemStatus[] = ['pending', 'rejected', 'applied']
  const pending = loadInlineCandidates(cwd)
  const decided = currentEvolveDecisions(readEvolveLog(cwd)).map((entry): EvolveQueueItem => ({
    id: entry.suggId,
    patternId: entry.patternId,
    kind: 'rule',
    targetLayer: entry.targetLayer ?? 'rule',
    status: entry.applied ? 'applied' : 'rejected',
    draft: entry.draft ?? '(이전 기록에는 초안이 없습니다)',
    dedupeKey: `${entry.patternId}:${entry.targetLayer ?? 'rule'}`,
    createdAt: entry.ts,
    appliedAt: entry.applied ? entry.ts : undefined,
    rulesBackupPath: entry.rulesBackupPath,
  }))
  let items: EvolveQueueItem[] = [...pending, ...decided]
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
    log.warn('판정할 후보나 결정 기록이 없습니다.')
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

  // 후보는 큐가 아니라 현재 패턴과 결정 기록에서 계산한다.
  const memLoaded = loadForMutation(cwd)
  if (!memLoaded.ok) {
    console.log(chalk.red('\n❌ memory.json 손상 의심 — apply 중단 (원본 보존).'))
    process.exitCode = 1
    return
  }
  const decisions = readEvolveLog(cwd)
  const patterns = memLoaded.mem.patterns as PatternEntryV19[]
  const item = generateInlineCandidates(
    patterns,
    currentEvolveDecisionKeys(decisions),
    new Date().toISOString(),
  ).find((candidate) => candidate.id === idStr?.trim())
  if (!item) {
    const decided = currentEvolveDecisions(decisions).find((entry) =>
      entry.suggId === idStr?.trim()
      || `${entry.patternId}:${entry.targetLayer ?? 'rule'}` === idStr?.trim(),
    )
    if (decided?.applied) log.warn(t('evolve.alreadyApplied'))
    else log.error(t('evolve.notFound', idStr ?? ''))
    process.exitCode = 1
    return
  }
  const hasUndoableApply = currentEvolveDecisions(decisions).some(
    (entry) => entry.applied && Boolean(entry.rulesBackupPath),
  )
  if (hasUndoableApply) {
    log.error(t('evolve.pendingApplyExists'))
    process.exitCode = 1
    return
  }
  const srcPattern = patterns.find((pattern) => pattern.id === item.patternId)

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

  // 결정 기록만 남기고 소스 패턴은 archived 처리한다. 신규 큐 쓰기는 없다.
  const now = new Date().toISOString()
  const appliedItem: EvolveQueueItem = {
    ...item,
    status: 'applied',
    draft: editedDraft,
    appliedAt: now,
    rulesBackupPath: backupPath,
  }

  // 결정 기록이 원장이므로 저장 실패 시 RULES.md와 파생 규칙을 원상복구한다.
  try {
    appendEvolveLog(cwd, {
      ...buildEvolveLogEntry(appliedItem, true, now),
      draft: editedDraft,
      rulesBackupPath: backupPath,
    })
  } catch (error) {
    try {
      copyFileSync(backupPath, rulesPath)
      await sync({ yes: true })
    } catch (rollbackError) {
      log.error('결정 기록 저장과 규칙 원상복구가 모두 실패했습니다.')
      log.dim(`   기록 오류: ${error instanceof Error ? error.message : String(error)}`)
      log.dim(`   복구 오류: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`)
      process.exitCode = 1
      return
    }
    log.error('결정 기록을 저장하지 못해 규칙 반영을 취소했습니다.')
    log.dim(`   ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
    return
  }

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

  log.success(`룰 반영 완료! [${appliedItem.id}]`)
  console.log(chalk.dim('   RULES.md에 추가 + vhk sync 재생성됨'))
  printNextStep({
    message: '룰 반영 완료!',
    command: 'vhk evolve list --status applied',
    cursorHint: '반영된 룰 목록 보여줘',
    alternative: 'vhk evolve undo — 되돌리기',
  })
}
/**
 * #374: reason(선택) — 기각 사유를 evolve-log 에 남겨 "왜 기각됐는지" 분포를 실측한다.
 * TTY 프롬프트가 아닌 위치인자로 받는다(MCP 모드 inquirer 금지 규칙 — 비대화형 유지).
 */
export async function evolveReject(idStr: string, reason?: string): Promise<void> {
  if (!ensureNotHardStopped('evolve reject')) return
  const cwd = process.cwd()
  const decisions = readEvolveLog(cwd)
  const item = generateInlineCandidates(
    readMemory(cwd).patterns as PatternEntryV19[],
    currentEvolveDecisionKeys(decisions),
    new Date().toISOString(),
  ).find((candidate) => candidate.id === idStr?.trim())

  if (!item) {
    const decided = currentEvolveDecisions(decisions).find((entry) =>
      entry.suggId === idStr?.trim()
      || `${entry.patternId}:${entry.targetLayer ?? 'rule'}` === idStr?.trim(),
    )
    if (decided) {
      log.dim(`  이미 판정한 후보입니다 — 변경 없음: ${decided.suggId}`)
      return
    }
    console.log(chalk.red('\n❌ ' + t('evolve.notFound', idStr ?? '')))
    process.exitCode = 1
    return
  }

  const trimmedReason = reason?.trim()
  try {
    appendEvolveLog(cwd, {
      ...buildEvolveLogEntry(item, false, new Date().toISOString(), trimmedReason || null),
      draft: item.draft,
    })
  } catch (error) {
    log.error('기각 기록을 저장하지 못했습니다. 후보 상태는 바뀌지 않았습니다.')
    log.dim(`   ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
    return
  }

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
  if (!ensureInteractive('undo는 TTY 확인이 필요합니다. 터미널에서 직접 실행하세요.')) return

  const cwd = process.cwd()
  const applied = currentEvolveDecisions(readEvolveLog(cwd))
    .filter((entry) => entry.applied && entry.rulesBackupPath)
    .sort((a, b) => b.ts.localeCompare(a.ts))

  if (applied.length === 0) {
    console.log(chalk.yellow('\n📭 ' + t('evolve.noAppliedToUndo')))
    return
  }

  const lastEntry = applied[0]
  const last: EvolveQueueItem = {
    id: lastEntry.suggId,
    patternId: lastEntry.patternId,
    kind: 'rule',
    targetLayer: lastEntry.targetLayer ?? 'rule',
    status: 'applied',
    draft: lastEntry.draft ?? '(이전 기록에는 초안이 없습니다)',
    dedupeKey: `${lastEntry.patternId}:${lastEntry.targetLayer ?? 'rule'}`,
    createdAt: lastEntry.ts,
    appliedAt: lastEntry.ts,
    rulesBackupPath: lastEntry.rulesBackupPath,
  }

  if (!last.rulesBackupPath || !existsSync(last.rulesBackupPath)) {
    console.log(chalk.red('\n❌ ' + t('evolve.noBackup')))
    process.exitCode = 1
    return
  }

  console.log(chalk.bold('\n🔄 ' + t('evolve.undoTitle')))
  console.log(chalk.dim(`  되돌릴 항목: [${last.id}] ${last.draft}`))

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

  copyFileSync(last.rulesBackupPath, join(cwd, 'RULES.md'))

  try {
    await sync({ yes: true })
  } catch (err) {
    log.error('sync 재실행 중 오류. RULES.md는 복원됐으나 .cursorrules 등 재생성 실패.')
    log.dim(`   ${err instanceof Error ? err.message : String(err)}`)
    log.dim('   수동으로 `vhk sync` 실행하세요.')
    process.exitCode = 1
    return
  }

  try {
    appendEvolveLog(cwd, buildEvolveUndoLogEntry(last, new Date().toISOString()))
  } catch (error) {
    log.error('되돌리기 기록 저장 실패 — RULES.md는 복원됐지만 후보 기록을 확인해야 합니다.')
    log.dim(`   ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
    return
  }

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
