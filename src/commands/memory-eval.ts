import { existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import chalk from 'chalk'
import { t } from '../i18n/ko.js'
import { prompt } from '../lib/prompt.js'
import {
  readMemory,
  recallMemories,
  type FailEntry,
  type MemoryFileV2,
  type PatternEntry,
} from './memory.js'
import {
  scoreEval,
  validateEvalLabels,
  EvalFormatError,
  RECALL_EVAL_THRESHOLD,
  type EvalLabel,
} from '../lib/recall-eval.js'
import { readRecallLog } from '../lib/recall-log.js'
import { readJsonFile } from '../lib/read-json.js'
import { atomicWriteFile } from '../lib/atomic-write.js'
import { ensureInteractive } from '../lib/interactive.js'
import { ensureVhkIgnored } from '../lib/backup.js'

/**
 * recall 검증 명령 (RFC 0049 ③). 별도 파일 = memory↔recall-eval 순환 의존 회피.
 * `vhk memory eval`        — 라벨셋으로 Recall@5/MRR + Kill-gate 판정 출력
 * `vhk memory eval --init` — 사용 로그의 실쿼리로 대화형 라벨링 → 라벨셋 생성
 */

export const EVAL_PATH_REL = join('.vhk', 'eval', 'recall-eval.json')
interface EvalFile {
  labels: EvalLabel[]
}

function entryText(e: { content?: string; lesson?: string; id: string }): string {
  const f = e as FailEntry
  return e.content || f.lesson || e.id
}

// ── #488: 후보 0/히트 밖 정답 라벨링용 전체 기억 픽커 ──
// recall 이 못 찾은 정답(=miss)을 평가셋에 남길 수 있어야 Recall@5 분모·분자가 정직해진다.
// patterns 는 recall 코퍼스(orderedAll) 밖이라 여기서 골라도 항상 miss — 그게 recall 의
// 실제 사각지대이므로 숨기지 않고 라벨 가능하게 둔다(구조적 제외 = 상향 편향의 재생산).

/** 한 화면에 보여줄 최대 항목 수 — 초과분은 키워드 필터로 좁히게 안내. */
const PICKER_PAGE_SIZE = 20

interface PickItem {
  id: string
  label: string
}

function patternText(p: PatternEntry): string {
  const summary = typeof p.summary === 'string' ? p.summary : ''
  const signal = typeof p.signal === 'string' ? p.signal : ''
  return summary || signal || p.id
}

/** 4버킷 전체(decisions→failures→successes→patterns)를 픽커 항목으로 평탄화. */
function listAllPickItems(mem: MemoryFileV2): PickItem[] {
  const items: PickItem[] = []
  const push = (bucketKo: string, id: string, text: string, tags: string[]): void => {
    const tagSuffix = tags.length > 0 ? ` [${tags.join(', ')}]` : ''
    items.push({ id, label: `(${bucketKo}) ${text}${tagSuffix}` })
  }
  for (const e of mem.decisions) push('결정', e.id, entryText(e), e.tags)
  for (const e of mem.failures) push('실패', e.id, entryText(e), e.tags)
  for (const e of mem.successes) push('성공', e.id, entryText(e), e.tags)
  for (const p of mem.patterns) {
    const tags = Array.isArray(p.tags) ? p.tags.filter((x): x is string => typeof x === 'string') : []
    push('패턴', p.id, patternText(p), tags)
  }
  return items
}

/**
 * 전체 기억에서 expected id 를 대화형으로 고른다(목록이 길면 키워드 필터).
 * 빈 입력 = "정답 없음(쿼리 무효)" → 빈 배열(skip). CLI 전용 — 호출부가 TTY 가드 통과 후에만 도달.
 */
async function pickExpectedFromAll(mem: MemoryFileV2): Promise<string[]> {
  const all = listAllPickItems(mem)
  if (all.length === 0) {
    console.log(chalk.dim(`   ${t('memory.evalInit.pickerEmpty')}`))
    return []
  }
  let filter = ''
  let askFilter = all.length > PICKER_PAGE_SIZE
  // 필터↔선택 루프 — 종료는 사용자 명시(빈 입력=정답 없음 / 번호 선택)로만. 'f' = 재필터.
  for (;;) {
    if (askFilter) {
      const { kw } = await prompt<{ kw: string }>([
        { type: 'input', name: 'kw', message: t('memory.evalInit.pickerFilterPrompt') },
      ])
      filter = String(kw || '').trim().toLowerCase()
      askFilter = false
    }
    const filtered = filter
      ? all.filter((it) => `${it.label} ${it.id}`.toLowerCase().includes(filter))
      : all
    if (filtered.length === 0) {
      console.log(chalk.yellow(`   ${t('memory.evalInit.pickerNoMatch', filter)}`))
      askFilter = true
      continue
    }
    const shown = filtered.slice(0, PICKER_PAGE_SIZE)
    shown.forEach((it, i) => console.log(`   [${i + 1}] ${it.label}`))
    if (filtered.length > shown.length) {
      console.log(chalk.dim(`   ${t('memory.evalInit.pickerMore', filtered.length - shown.length)}`))
    }
    const { ans } = await prompt<{ ans: string }>([
      { type: 'input', name: 'ans', message: t('memory.evalInit.pickerSelectPrompt') },
    ])
    const raw = String(ans || '').trim()
    if (raw === '') return [] // 정답 없음(쿼리 무효) — 이 경우만 skip 이 정당하다(#488).
    if (raw.toLowerCase() === 'f') {
      askFilter = true
      continue
    }
    const ids = raw
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= shown.length)
      .map((n) => shown[n - 1].id)
    if (ids.length === 0) {
      console.log(chalk.dim(`   ${t('memory.evalInit.pickerInvalidSkip')}`))
      return []
    }
    return [...new Set(ids)]
  }
}

export async function memoryEval(opts: { init?: boolean } = {}): Promise<void> {
  if (opts.init) return memoryEvalInit()

  console.log(chalk.bold('\n📐 기억 회상 검증 (eval)'))
  console.log(chalk.gray('─'.repeat(40)))
  const cwd = process.cwd()
  const p = join(cwd, EVAL_PATH_REL)
  if (!existsSync(p)) {
    console.log(chalk.yellow('\n📭 평가셋이 없습니다.'))
    console.log(chalk.gray('   먼저 vhk recall 로 쿼리를 쌓고 → vhk memory eval --init 으로 라벨링하세요.'))
    return
  }
  let labels: EvalLabel[]
  try {
    // raw JSON 을 TS 캐스트로만 받지 않고 형식검증 통과시킨다 (#322 expectIds 정확매칭 · #323 구조검증).
    labels = validateEvalLabels(readJsonFile<unknown>(p))
  } catch (e) {
    // 깨진 JSON(파싱 실패)·구조 형식 불량(EvalFormatError) 모두 동일한 친절 메시지로 흡수 — 내부 스택 미노출.
    const detail = e instanceof EvalFormatError ? ` ${e.message}` : ''
    console.log(chalk.red(`❌ ${EVAL_PATH_REL} 읽기/형식 검증 실패 (손상 의심).${detail}`))
    console.log(chalk.gray('   vhk memory eval --init 으로 평가셋을 다시 만드세요.'))
    process.exitCode = 1
    return
  }
  if (labels.length === 0) {
    console.log(chalk.yellow('\n📭 평가 라벨이 비었습니다 — vhk memory eval --init 으로 추가하세요.'))
    return
  }

  const r = scoreEval(readMemory(cwd), labels)
  const pct = (n: number) => `${(n * 100).toFixed(0)}%`
  console.log(chalk.cyan(`\n라벨 ${r.n}개 · Recall@5 ${chalk.bold(pct(r.recallAt5))} · MRR ${r.mrr.toFixed(2)}\n`))
  for (const q of r.perQuery) {
    const mark = q.found ? chalk.green(`✅ rank ${q.rank}`) : chalk.red('❌ 미발견')
    console.log(`  ${mark}  ${q.query}`)
  }
  console.log('')
  // #375: queryType별(lexical/paraphrase/unknown) Recall@5 분해 — n>0 인 버킷만 표시(노이즈 차단).
  if (r.byQueryType) {
    const labelKo: Record<'lexical' | 'paraphrase' | 'unknown', string> = {
      lexical: '키워드 일치',
      paraphrase: '의역',
      unknown: '미태깅',
    }
    for (const key of ['lexical', 'paraphrase', 'unknown'] as const) {
      const b = r.byQueryType[key]
      if (b.n === 0) continue
      console.log(chalk.gray(`  · ${labelKo[key]}(${key}): Recall@5 ${pct(b.recallAt5)} (n=${b.n})`))
    }
    console.log('')
  }
  if (r.verdict === 'sufficient') {
    console.log(chalk.green(`✅ Recall@5 ≥ ${pct(RECALL_EVAL_THRESHOLD)} — 키워드 회상 충분. ML(임베딩) 불필요.`))
  } else {
    console.log(chalk.yellow(`⚠️  Recall@5 < ${pct(RECALL_EVAL_THRESHOLD)} — Kill-gate 신호. 누적 반복되면 2차(임베딩) 검토 대상.`))
  }
}

async function memoryEvalInit(): Promise<void> {
  console.log(chalk.bold('\n📐 평가셋 라벨링 (--init)'))
  console.log(chalk.gray('─'.repeat(40)))
  if (!ensureInteractive('vhk recall 로 쿼리를 먼저 쌓은 뒤 다시 실행하세요.')) return

  const cwd = process.cwd()
  const queries = [...new Set(readRecallLog(cwd).filter((e) => e.source === 'recall').map((e) => e.query))]
  if (queries.length === 0) {
    console.log(chalk.yellow('\n📭 사용 로그에 쿼리가 없습니다.'))
    console.log(chalk.gray('   vhk recall "<찾을 내용>" 을 몇 번 써서 실쿼리를 쌓은 뒤 다시 실행하세요.'))
    return
  }

  const mem = readMemory(cwd)
  const labels: EvalLabel[] = []
  console.log(chalk.dim(`\n최근 쿼리 ${Math.min(queries.length, 20)}개를 라벨링합니다. 각 쿼리의 정답 기억 번호를 입력하세요.\n`))

  for (const query of queries.slice(-20)) {
    const hits = recallMemories(mem, query, 5)
    console.log(chalk.cyan(`\n🔎 "${query}"`))
    let ids: string[]
    if (hits.length === 0) {
      // #488: 후보 0 을 자동 skip 하면 recall 미스가 평가셋에서 구조적으로 제외돼 Recall@5 가
      //       상향 편향 → kill-gate 판정 무력화. 전체 기억에서 정답을 고르게 해 miss 라벨로 남긴다.
      console.log(chalk.dim(`   ${t('memory.evalInit.noCandidates')}`))
      ids = await pickExpectedFromAll(mem)
    } else {
      hits.forEach((h, i) => console.log(`   [${i + 1}] ${entryText(h.entry)}`))
      const { ans } = await prompt<{ ans: string }>([
        { type: 'input', name: 'ans', message: t('memory.evalInit.selectPrompt') },
      ])
      const raw = String(ans || '').trim()
      if (raw.toLowerCase() === 'm') {
        // #488: 정답이 top-5 밖일 때도 지정 가능 — 히트에 없는 expected 는 채점에서 그대로 miss.
        ids = await pickExpectedFromAll(mem)
      } else {
        ids = raw
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => Number.isInteger(n) && n >= 1 && n <= hits.length)
          .map((n) => hits[n - 1].entry.id)
      }
    }
    if (ids.length > 0) labels.push({ query, expectIds: [...new Set(ids)] })
  }

  if (labels.length === 0) {
    console.log(chalk.yellow('\n📭 라벨이 하나도 없어 평가셋을 만들지 않았습니다.'))
    return
  }
  const p = join(cwd, EVAL_PATH_REL)
  mkdirSync(dirname(p), { recursive: true })
  // #331: 라벨셋은 검색어 원문을 담아 프라이버시 → 저장과 동시에 .vhk/.gitignore 로 자기방어(멱등).
  try {
    ensureVhkIgnored(cwd, 'eval/recall-eval.json')
  } catch {
    /* gitignore 갱신 실패는 치명적 아님 — 평가셋은 이미 저장됨 */
  }
  atomicWriteFile(p, JSON.stringify({ labels } satisfies EvalFile, null, 2) + '\n')
  console.log(chalk.green(`\n✅ 평가셋 저장됨 (${labels.length}개 라벨) → ${EVAL_PATH_REL}`))
  console.log(chalk.gray('   점수 보기: vhk memory eval'))
}
