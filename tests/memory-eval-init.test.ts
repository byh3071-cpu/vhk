import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// #488: eval --init 이 recall 후보 0 쿼리를 전부 자동 skip → 미스가 평가셋에서 구조적으로 제외
//       (Recall@5 상향 편향 + 라벨링 dead-end). 후보 0 에서도 전체 기억(패턴 포함)에서 정답을
//       고르거나 '정답 없음(쿼리 무효)'을 선택할 수 있어야 하고, 히트 밖 정답은 miss 라벨로
//       분모·분자에 정확히 반영돼야 한다. prompt 는 큐 기반 mock(초과 호출 = throw 로 검출).
const promptQueue: Array<Record<string, unknown>> = []
const promptSpy = vi.fn(async () => {
  const next = promptQueue.shift()
  if (!next) throw new Error('PROMPT_QUEUE_EMPTY: 예상보다 많은 프롬프트 호출')
  return next
})
vi.mock('../src/lib/prompt.js', () => ({ prompt: promptSpy }))

const EVAL_REL = path.join('.vhk', 'eval', 'recall-eval.json')

interface WrittenEval {
  labels: Array<{ query: string; expectIds: string[] }>
}

function writeMemoryFixture(dir: string, mem: Record<string, unknown>): void {
  fs.mkdirSync(path.join(dir, '.vhk'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.vhk', 'memory.json'), JSON.stringify(mem), 'utf-8')
}

function writeRecallLogFixture(dir: string, queries: string[]): void {
  fs.mkdirSync(path.join(dir, '.vhk'), { recursive: true })
  const lines = queries.map((q) =>
    JSON.stringify({ ts: '2026-06-22T00:00:00Z', source: 'recall', query: q, hitIds: [], topScore: 0 })
  )
  fs.writeFileSync(path.join(dir, '.vhk', 'recall-log.jsonl'), lines.join('\n') + '\n', 'utf-8')
}

/** 기본 픽스처: recall 가능한 failure 1건 + recall 코퍼스 밖 pattern 1건. */
function baseMemory(): Record<string, unknown> {
  return {
    schemaVersion: 2,
    decisions: [],
    failures: [
      {
        id: 'f1',
        content: 'publish 가드가 feature 브랜치 발행 차단',
        tags: ['publish'],
        createdAt: '2026-06-01T00:00:00Z',
        status: 'active',
      },
    ],
    successes: [],
    patterns: [
      {
        id: 'pat-1',
        kind: 'avoid',
        axis: 'keyword',
        signal: '누수',
        summary: '메모리 누수 반복 실패 패턴',
        count: 3,
        sources: [],
        createdAt: '2026-06-01T00:00:00Z',
        status: 'active',
        tags: [],
        _sig: 'avoid:keyword:누수',
      },
    ],
  }
}

function readEvalFile(dir: string): WrittenEval {
  return JSON.parse(fs.readFileSync(path.join(dir, EVAL_REL), 'utf-8')) as WrittenEval
}

describe('vhk memory eval --init — #488 recall 미스 라벨링', () => {
  let origCwd: string
  let dir: string
  let origTty: boolean | undefined
  let origExitCode: number | string | undefined

  beforeEach(() => {
    origCwd = process.cwd()
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-eval-init-'))
    process.chdir(dir)
    promptQueue.length = 0
    promptSpy.mockClear()
    origTty = process.stdin.isTTY
    process.stdin.isTTY = true
    origExitCode = process.exitCode
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.stdin.isTTY = origTty
    process.exitCode = origExitCode
    process.chdir(origCwd)
    fs.rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('후보 0 쿼리 → 자동 skip 아님: 전체 기억(패턴 포함)에서 정답 선택 → 라벨 기록', async () => {
    writeMemoryFixture(dir, baseMemory())
    writeRecallLogFixture(dir, ['버그 메모리 누수'])
    const { memoryEval } = await import('../src/commands/memory-eval.js')
    // 전체 목록: [1] f1(실패) → [2] pat-1(패턴). 정답으로 패턴 선택.
    promptQueue.push({ ans: '2' })
    await memoryEval({ init: true })

    const written = readEvalFile(dir)
    expect(written.labels).toEqual([{ query: '버그 메모리 누수', expectIds: ['pat-1'] }])
  })

  it('후보 0 에서 고른 정답이 recall 히트에 없으면 scoreEval 에서 miss 로 반영(분모·분자 정확)', async () => {
    writeMemoryFixture(dir, baseMemory())
    writeRecallLogFixture(dir, ['버그 메모리 누수'])
    const { memoryEval } = await import('../src/commands/memory-eval.js')
    promptQueue.push({ ans: '2' })
    await memoryEval({ init: true })

    const { scoreEval, validateEvalLabels } = await import('../src/lib/recall-eval.js')
    const { readMemory } = await import('../src/commands/memory.js')
    const labels = validateEvalLabels(JSON.parse(fs.readFileSync(path.join(dir, EVAL_REL), 'utf-8')))
    const r = scoreEval(readMemory(dir), labels)
    expect(r.n).toBe(1)
    expect(r.perQuery[0]).toMatchObject({ found: false, rank: null })
    expect(r.recallAt5).toBe(0)
  })

  it('후보 0 + 엔터(정답 없음 — 쿼리 무효) → skip, 평가셋 미생성', async () => {
    writeMemoryFixture(dir, baseMemory())
    writeRecallLogFixture(dir, ['버그 메모리 누수'])
    const { memoryEval } = await import('../src/commands/memory-eval.js')
    promptQueue.push({ ans: '' })
    await memoryEval({ init: true })

    expect(fs.existsSync(path.join(dir, EVAL_REL))).toBe(false)
  })

  it('후보 0 + 전체 목록이 길면(>20) 키워드 필터로 좁혀서 선택', async () => {
    const failures = Array.from({ length: 24 }, (_, i) => ({
      id: `f${i + 1}`,
      content: `케이스 자료 항목 번호${i + 1}`,
      tags: [],
      createdAt: '2026-06-01T00:00:00Z',
      status: 'active',
    }))
    failures.push({
      id: 'f25',
      content: '메모리 누수 케이스 원인분석',
      tags: [],
      createdAt: '2026-06-01T00:00:00Z',
      status: 'active',
    })
    writeMemoryFixture(dir, { schemaVersion: 2, decisions: [], failures, successes: [], patterns: [] })
    writeRecallLogFixture(dir, ['아예없는단어쿼리'])
    const { memoryEval } = await import('../src/commands/memory-eval.js')
    // 25건 > 20 → 필터 프롬프트 먼저 → '누수' 필터 → [1] f25 선택.
    promptQueue.push({ kw: '누수' }, { ans: '1' })
    await memoryEval({ init: true })

    const written = readEvalFile(dir)
    expect(written.labels).toEqual([{ query: '아예없는단어쿼리', expectIds: ['f25'] }])
  })

  it('히트 있는 쿼리 — 기존 숫자 선택·엔터 skip 하위호환 유지', async () => {
    writeMemoryFixture(dir, baseMemory())
    writeRecallLogFixture(dir, ['publish 배포', 'publish 준비'])
    const { memoryEval } = await import('../src/commands/memory-eval.js')
    // 1번째 쿼리: 히트 [1]=f1 선택 / 2번째 쿼리: 엔터 skip.
    promptQueue.push({ ans: '1' }, { ans: '' })
    await memoryEval({ init: true })

    const written = readEvalFile(dir)
    expect(written.labels).toEqual([{ query: 'publish 배포', expectIds: ['f1'] }])
  })

  it("히트 있어도 'm' 입력 → 전체 목록에서 top-5 밖 정답 지정(miss 라벨) 가능", async () => {
    writeMemoryFixture(dir, baseMemory())
    writeRecallLogFixture(dir, ['publish 배포'])
    const { memoryEval } = await import('../src/commands/memory-eval.js')
    // 히트 프롬프트에서 'm' → 전체 목록 [1] f1, [2] pat-1 → 패턴 선택.
    promptQueue.push({ ans: 'm' }, { ans: '2' })
    await memoryEval({ init: true })

    const written = readEvalFile(dir)
    expect(written.labels).toEqual([{ query: 'publish 배포', expectIds: ['pat-1'] }])
  })

  it('픽커에서 유효한 번호가 하나도 없는 입력 → 해당 쿼리 skip (라벨 미기록)', async () => {
    writeMemoryFixture(dir, baseMemory())
    writeRecallLogFixture(dir, ['버그 메모리 누수'])
    const { memoryEval } = await import('../src/commands/memory-eval.js')
    promptQueue.push({ ans: 'abc' })
    await memoryEval({ init: true })

    expect(fs.existsSync(path.join(dir, EVAL_REL))).toBe(false)
  })

  it('기억이 아예 없으면(빈 memory) 후보 0 쿼리는 픽커 프롬프트 없이 skip', async () => {
    // memory.json 없음 → 빈 v2 로 읽힘. 프롬프트 큐 비움 — 호출되면 큐 고갈 throw 로 실패.
    writeRecallLogFixture(dir, ['버그 메모리 누수'])
    const { memoryEval } = await import('../src/commands/memory-eval.js')
    await memoryEval({ init: true })

    expect(promptSpy).not.toHaveBeenCalled()
    expect(fs.existsSync(path.join(dir, EVAL_REL))).toBe(false)
  })

  it('비-TTY → 기존 가드 유지: 프롬프트 0회 + exitCode 2', async () => {
    process.stdin.isTTY = undefined
    writeMemoryFixture(dir, baseMemory())
    writeRecallLogFixture(dir, ['버그 메모리 누수'])
    const { memoryEval } = await import('../src/commands/memory-eval.js')
    await memoryEval({ init: true })

    expect(promptSpy).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(2)
  })
})
