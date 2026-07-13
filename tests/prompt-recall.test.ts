import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { RecallHit, MemBucket, MemEntry, FailEntry } from '../src/commands/memory.js'

// #458: 뒷단(content/launch/sell/ops) 프롬프트에 과거 교훈 recall 주입.
// - 하드리밋 ≤3 · 각 1줄 절삭(프롬프트 비대 금지)
// - recallMemories 직접 호출(로깅 없는 내부 경로) → recall-log.jsonl 미적재(실쿼리 데이터 오염 0, measure-first)

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-prompt-recall-'))
}

function writeMemoryV2(dir: string, partial: Record<string, unknown>): void {
  fs.mkdirSync(path.join(dir, '.vhk'), { recursive: true })
  const mem = { schemaVersion: 2, decisions: [], failures: [], successes: [], patterns: [], ...partial }
  fs.writeFileSync(path.join(dir, '.vhk', 'memory.json'), JSON.stringify(mem), 'utf-8')
}

function makeHit(bucket: MemBucket, entry: Partial<FailEntry> & { id: string }): RecallHit {
  const full: MemEntry = {
    content: '',
    tags: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    status: 'active',
    ...entry,
  }
  return { bucket, entry: full, score: 2, signals: { keyword: 2, tagMatch: 0, recency: 0.5, status: 1 } }
}

describe('prompt-recall — formatRecallLessons 순수함수 (#458)', () => {
  it('failure 는 lesson 우선 렌더 + 버킷 라벨 동반', async () => {
    const { formatRecallLessons } = await import('../src/lib/prompt-recall.js')
    const lines = formatRecallLessons([
      makeHit('failure', { id: 'f1', content: '', lesson: '런칭은 화요일 오전이 반응이 좋았다' }),
    ])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('런칭은 화요일 오전이 반응이 좋았다')
    expect(lines[0]).toContain('실패')
  })

  it('decision/success 는 content 렌더', async () => {
    const { formatRecallLessons } = await import('../src/lib/prompt-recall.js')
    const lines = formatRecallLessons([
      makeHit('decision', { id: 'd1', content: '가격은 월 구독으로 간다' }),
      makeHit('success', { id: 's1', content: '커뮤니티 게시가 유입 1위' }),
    ])
    expect(lines[0]).toContain('가격은 월 구독으로 간다')
    expect(lines[0]).toContain('결정')
    expect(lines[1]).toContain('커뮤니티 게시가 유입 1위')
    expect(lines[1]).toContain('성공')
  })

  it('개행은 1줄로 붕괴 + 상한 초과분은 … 절삭 (프롬프트 비대 금지)', async () => {
    const { formatRecallLessons, RECALL_LESSON_LINE_MAX } = await import('../src/lib/prompt-recall.js')
    const long = '첫줄 교훈\n둘째줄 ' + '가'.repeat(300)
    const lines = formatRecallLessons([makeHit('failure', { id: 'f1', lesson: long })])
    expect(lines).toHaveLength(1)
    expect(lines[0]).not.toContain('\n')
    expect(lines[0].length).toBeLessThanOrEqual(RECALL_LESSON_LINE_MAX + 20) // 라벨 오버헤드 허용
    expect(lines[0]).toContain('…')
  })

  it('하드리밋 — 5개 hit 을 줘도 최대 3줄', async () => {
    const { formatRecallLessons, RECALL_LESSON_MAX } = await import('../src/lib/prompt-recall.js')
    const hits = [1, 2, 3, 4, 5].map((i) => makeHit('decision', { id: `d${i}`, content: `결정 ${i}` }))
    expect(RECALL_LESSON_MAX).toBe(3)
    expect(formatRecallLessons(hits)).toHaveLength(3)
  })

  it('본문이 전부 비면(공백 lesson/content) 해당 항목은 건너뜀', async () => {
    const { formatRecallLessons } = await import('../src/lib/prompt-recall.js')
    const lines = formatRecallLessons([
      makeHit('failure', { id: 'f1', content: '   ', lesson: '  ' }),
      makeHit('decision', { id: 'd1', content: '실제 내용' }),
    ])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('실제 내용')
  })
})

describe('prompt-recall — lessonsSectionLines 순수함수 (#458)', () => {
  it('빈 배열이면 섹션 자체 생략(빈 배열 반환)', async () => {
    const { lessonsSectionLines } = await import('../src/lib/prompt-recall.js')
    expect(lessonsSectionLines([])).toEqual([])
  })

  it('헤더(과거 교훈) + bullet 렌더', async () => {
    const { lessonsSectionLines } = await import('../src/lib/prompt-recall.js')
    const lines = lessonsSectionLines(['(실패) 교훈 하나', '(성공) 성공 하나'])
    expect(lines.some((l) => l.includes('과거 교훈'))).toBe(true)
    expect(lines).toContain('- (실패) 교훈 하나')
    expect(lines).toContain('- (성공) 성공 하나')
  })

  it('하드리밋 — 4개를 줘도 bullet ≤3 (이중 방어)', async () => {
    const { lessonsSectionLines } = await import('../src/lib/prompt-recall.js')
    const lines = lessonsSectionLines(['a', 'b', 'c', 'd'])
    expect(lines.filter((l) => l.startsWith('- ')).length).toBe(3)
  })
})

describe('prompt-recall — recallLessonLines fs 글루 (#458)', () => {
  it('매칭 기억이 있으면 교훈 라인 반환', async () => {
    const { recallLessonLines } = await import('../src/lib/prompt-recall.js')
    const d = tmpDir()
    try {
      writeMemoryV2(d, {
        failures: [
          {
            id: 'f1',
            content: '',
            tags: [],
            createdAt: '2026-07-01T00:00:00.000Z',
            status: 'active',
            lesson: '런칭 채널은 커뮤니티가 최고였다',
          },
        ],
      })
      const lines = recallLessonLines(d, '런칭 채널 게시')
      expect(lines.length).toBeGreaterThan(0)
      expect(lines[0]).toContain('런칭 채널은 커뮤니티가 최고였다')
    } finally {
      fs.rmSync(d, { recursive: true, force: true })
    }
  })

  it('memory.json 없으면 빈 배열 + 파일 미생성(litter 방지)', async () => {
    const { recallLessonLines } = await import('../src/lib/prompt-recall.js')
    const d = tmpDir()
    try {
      expect(recallLessonLines(d, '런칭')).toEqual([])
      expect(fs.existsSync(path.join(d, '.vhk', 'memory.json'))).toBe(false)
    } finally {
      fs.rmSync(d, { recursive: true, force: true })
    }
  })

  it('recall-log.jsonl 미적재 — 내부 경로 회상은 실쿼리 데이터를 오염시키지 않는다(measure-first)', async () => {
    const { recallLessonLines } = await import('../src/lib/prompt-recall.js')
    const d = tmpDir()
    try {
      writeMemoryV2(d, {
        failures: [
          {
            id: 'f1',
            content: '',
            tags: [],
            createdAt: '2026-07-01T00:00:00.000Z',
            status: 'active',
            lesson: '런칭 게시는 예약 발행이 안전',
          },
        ],
      })
      const lines = recallLessonLines(d, '런칭 게시')
      expect(lines.length).toBeGreaterThan(0) // 실제 hit 이 났는데도
      expect(fs.existsSync(path.join(d, '.vhk', 'recall-log.jsonl'))).toBe(false) // 로그는 안 남는다
    } finally {
      fs.rmSync(d, { recursive: true, force: true })
    }
  })

  it('손상 memory.json 이어도 크래시 0 — 빈 배열 반환(뒷단 명령 보호)', async () => {
    const { recallLessonLines } = await import('../src/lib/prompt-recall.js')
    const d = tmpDir()
    try {
      fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
      fs.writeFileSync(path.join(d, '.vhk', 'memory.json'), '{ 손상된 json', 'utf-8')
      expect(recallLessonLines(d, '런칭')).toEqual([])
    } finally {
      fs.rmSync(d, { recursive: true, force: true })
    }
  })
})
