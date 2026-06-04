import chalk from 'chalk'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { readMemory, writeMemory, type MemoryFileV2, type MemEntry, type FailEntry, type PatternEntry } from './memory.js'

/**
 * Goal 19: pattern detection v0 — active failures/successes 에서 반복 패턴 감지.
 * 2축(태그 군집 + 키워드 문서빈도), 순수 빈도 카운팅(ML/외부 라이브러리 0).
 * patterns[] 는 Goal 18 이 예약한 빈 버킷 — 여기서 처음 채움.
 * 읽기·제안만. RULES.md/파일 반영은 Goal 20.
 */

export const MIN_TAG_FREQ = 3
export const MIN_KEYWORD_FREQ = 3

const STOPWORDS = new Set(['the', 'a', 'an', 'is', 'are', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'it', 'was', 'be'])

/** 신호 텍스트 정규화 → 토큰 배열 (소문자·구두점 제거·최소 불용어). */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^가-힣a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((tok) => tok.length >= 2 && !STOPWORDS.has(tok))
}

/** PatternEntry 구체 스키마 (Goal 19 채움). */
export interface PatternEntryV19 extends PatternEntry {
  kind: 'avoid' | 'reinforce'
  axis: 'tag' | 'keyword'
  signal: string
  count: number
  sources: string[]
  summary: string
  createdAt: string
  status: 'active' | 'archived'
  tags: string[]
  _sig: string
}

function sigOf(kind: 'avoid' | 'reinforce', axis: 'tag' | 'keyword', signal: string): string {
  return `${kind}:${axis}:${signal}`
}

function isActive(e: MemEntry): boolean {
  return e.status !== 'archived' && e.status !== 'resolved'
}

interface RawCandidate {
  kind: 'avoid' | 'reinforce'
  axis: 'tag' | 'keyword'
  signal: string
  count: number
  sources: string[]
  summary: string
  sourceTags: string[]
}

/**
 * 순수 감지 함수 — fs·Date 부수효과 없음(테스트 가능).
 * 축1: 태그 군집(같은 버킷 내 태그 빈도 ≥ minFreq → 후보, no-goal 제외).
 * 축2: 키워드 문서빈도(서로 다른 항목 수 ≥ minFreq → 후보).
 * 정렬: count desc → signal asc(결정적).
 */
export function detectCandidates(mem: MemoryFileV2, minFreq: number): RawCandidate[] {
  const candidates: RawCandidate[] = []

  function processBucket(
    entries: MemEntry[],
    kind: 'avoid' | 'reinforce',
    getText: (e: MemEntry) => string,
  ): void {
    const active = entries.filter(isActive)

    // 축1: 태그 군집
    const tagMap = new Map<string, string[]>()
    for (const e of active) {
      for (const tag of e.tags) {
        if (tag === 'no-goal') continue
        if (!tagMap.has(tag)) tagMap.set(tag, [])
        tagMap.get(tag)!.push(e.id)
      }
    }
    for (const [tag, sources] of tagMap) {
      if (sources.length >= minFreq) {
        const involved = active.filter((e) => sources.includes(e.id))
        const sourceTags = [...new Set(involved.flatMap((e) => e.tags))]
        candidates.push({
          kind, axis: 'tag', signal: tag, count: sources.length, sources,
          summary: `[${kind}] 태그 '${tag}' ${sources.length}건 반복`,
          sourceTags,
        })
      }
    }

    // 축2: 키워드 문서빈도
    const tokenMap = new Map<string, Set<string>>()
    for (const e of active) {
      const text = getText(e)
      if (!text) continue
      const unique = new Set(tokenize(text))
      for (const tok of unique) {
        if (!tokenMap.has(tok)) tokenMap.set(tok, new Set())
        tokenMap.get(tok)!.add(e.id)
      }
    }
    for (const [tok, sourceSet] of tokenMap) {
      if (sourceSet.size >= minFreq) {
        const sources = [...sourceSet]
        const involved = active.filter((e) => sources.includes(e.id))
        const sourceTags = [...new Set(involved.flatMap((e) => e.tags))]
        candidates.push({
          kind, axis: 'keyword', signal: tok, count: sourceSet.size, sources,
          summary: `[${kind}] 키워드 '${tok}' ${sourceSet.size}건 문서`,
          sourceTags,
        })
      }
    }
  }

  const failText = (e: MemEntry): string => {
    const f = e as FailEntry
    return f.lesson ?? f.content ?? ''
  }

  processBucket(mem.failures, 'avoid', failText)
  processBucket(mem.successes, 'reinforce', (e) => e.content ?? '')

  return candidates.sort((a, b) => b.count - a.count || a.signal.localeCompare(b.signal))
}

function nextPatternId(mem: MemoryFileV2): string {
  const re = /^p(\d+)$/
  let max = 0
  for (const p of mem.patterns) {
    const m = p.id.match(re)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `p${max + 1}`
}

export async function patternDetect(opts: { min?: string; json?: boolean } = {}): Promise<void> {
  const minFreq = opts.min !== undefined ? parseInt(opts.min, 10) : MIN_TAG_FREQ
  if (!Number.isFinite(minFreq) || minFreq < 1) {
    console.log(chalk.red('❌ --min 은 1 이상의 정수여야 합니다.'))
    process.exitCode = 1
    return
  }

  const cwd = process.cwd()
  const mem = readMemory(cwd)
  const candidates = detectCandidates(mem, minFreq)

  // 멱등 병합: 동일 시그니처 active 패턴은 갱신, 신규는 push.
  const now = new Date().toISOString()
  let added = 0, updated = 0

  for (const c of candidates) {
    const sig = sigOf(c.kind, c.axis, c.signal)
    const existing = mem.patterns.find((p) => {
      const pp = p as PatternEntryV19
      return pp._sig === sig && pp.status !== 'archived'
    }) as PatternEntryV19 | undefined

    if (existing) {
      existing.count = c.count
      existing.sources = c.sources
      existing.summary = c.summary
      existing.tags = c.sourceTags
      updated++
    } else {
      const entry: PatternEntryV19 = {
        id: nextPatternId(mem),
        kind: c.kind,
        axis: c.axis,
        signal: c.signal,
        count: c.count,
        sources: c.sources,
        summary: c.summary,
        createdAt: now,
        status: 'active',
        tags: c.sourceTags,
        _sig: sig,
      }
      mem.patterns.push(entry)
      added++
    }
  }

  writeMemory(cwd, mem)

  if (opts.json) {
    const active = mem.patterns.filter((p) => (p as PatternEntryV19).status !== 'archived')
    console.log(JSON.stringify(active, null, 2))
    return
  }

  console.log(chalk.bold('\n🔍 ' + t('pattern.detectTitle')))
  console.log(chalk.gray('─'.repeat(40)))
  console.log(chalk.dim(`  임계: ${minFreq}회 이상 · active failures+successes 입력`))
  console.log(chalk.dim(`  후보: ${candidates.length}개 감지 (추가 ${added} / 갱신 ${updated})`))

  const active = mem.patterns.filter((p) => (p as PatternEntryV19).status !== 'archived') as PatternEntryV19[]
  if (active.length === 0) {
    console.log(chalk.yellow('\n📭 임계 이상 반복 패턴이 없습니다.'))
    console.log(chalk.gray(`   failures/successes 가 ${minFreq}개 이상 쌓이면 감지됩니다.`))
    console.log(chalk.gray('   --min N 으로 임계를 낮출 수 있습니다.'))
    return
  }

  console.log(chalk.cyan(`\n패턴 후보 ${active.length}개:\n`))
  for (const p of active.slice(0, 20)) {
    const icon = p.kind === 'avoid' ? '⚠️ ' : '✅'
    console.log(`  [${p.id}] ${icon} (${p.kind}/${p.axis}) "${p.signal}" — ${p.count}건`)
    const preview = p.sources.slice(0, 5).join(', ') + (p.sources.length > 5 ? ` 외 ${p.sources.length - 5}건` : '')
    console.log(chalk.dim(`      근거: ${preview}`))
    console.log(chalk.dim(`      ${p.summary}`))
  }

  printNextStep({
    message: `패턴 감지 완료! ${active.length}개 후보.`,
    command: 'vhk pattern list',
    cursorHint: '패턴 목록 보여줘',
    alternative: '(Goal 20) vhk evolve — 다음 단계에서 반영',
  })
}

export async function patternList(opts: { kind?: string; all?: boolean; json?: boolean } = {}): Promise<void> {
  console.log(chalk.bold('\n🔍 ' + t('pattern.listTitle')))
  console.log(chalk.gray('─'.repeat(40)))

  const mem = readMemory(process.cwd())
  let patterns = mem.patterns as PatternEntryV19[]

  if (!opts.all) patterns = patterns.filter((p) => p.status !== 'archived')
  if (opts.kind === 'avoid' || opts.kind === 'reinforce') {
    patterns = patterns.filter((p) => p.kind === opts.kind)
  }

  if (opts.json) {
    console.log(JSON.stringify(patterns, null, 2))
    return
  }

  if (patterns.length === 0) {
    console.log(chalk.yellow('\n📭 표시할 패턴이 없습니다.'))
    console.log(chalk.gray('   vhk pattern detect 로 감지 먼저 실행하세요.'))
    return
  }

  console.log(chalk.cyan(`\n${patterns.length}개${opts.all ? ' (보관 포함)' : ' (활성)'}:\n`))
  for (const p of patterns) {
    const icon = p.kind === 'avoid' ? '⚠️ ' : '✅'
    const archived = p.status === 'archived' ? '📦 ' : ''
    console.log(`  [${p.id}] ${archived}${icon} (${p.kind}/${p.axis}) "${p.signal}" — ${p.count}건`)
    if (p.summary) console.log(chalk.dim(`      ${p.summary}`))
    if (p.tags?.length) console.log(chalk.blue(`      🏷️  ${p.tags.join(', ')}`))
  }
}

export async function patternDismiss(idStr: string): Promise<void> {
  if (!idStr?.trim()) {
    console.log(chalk.red('❌ 패턴 id 를 입력해주세요. 예: vhk pattern dismiss p1'))
    process.exitCode = 1
    return
  }

  const cwd = process.cwd()
  const mem = readMemory(cwd)
  const pattern = mem.patterns.find((p) => p.id === idStr.trim()) as PatternEntryV19 | undefined

  if (!pattern) {
    console.log(chalk.red(`❌ 패턴 '${idStr}' 를 찾을 수 없습니다.`))
    console.log(chalk.gray('   vhk pattern list --all 로 목록 확인.'))
    process.exitCode = 1
    return
  }

  if (pattern.status === 'archived') {
    console.log(chalk.dim(`  이미 보관된 패턴입니다 — 변경 없음: ${pattern.id}`))
    return
  }

  pattern.status = 'archived'
  writeMemory(cwd, mem)
  console.log(chalk.green(`\n📦 패턴 dismiss(보관)됨: [${pattern.id}] ${pattern.summary ?? pattern.signal}`))
  console.log(chalk.dim('   오탐으로 판단. detect 재실행 시 재제안 안 됨.'))

  printNextStep({
    message: '패턴 dismiss 완료!',
    command: 'vhk pattern list',
    cursorHint: '남은 패턴 보여줘',
  })
}
