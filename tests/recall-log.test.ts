import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { logRecall, readRecallLog, RECALL_LOG_REL, RECALL_LOG_MAX } from '../src/lib/recall-log.js'

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-rlog-'))
}

describe('recall-log (사용 로그)', () => {
  it('recall 1건 append + 읽기', () => {
    const dir = tmp()
    logRecall(dir, { source: 'recall', query: 'publish', hitIds: ['f1'], topScore: 3.2 })
    const log = readRecallLog(dir)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ source: 'recall', query: 'publish', hitIds: ['f1'], topScore: 3.2 })
    expect(typeof log[0].ts).toBe('string')
  })

  it('jit source 도 기록', () => {
    const dir = tmp()
    logRecall(dir, { source: 'jit', query: 'deploy', hitIds: ['f2'], topScore: 2.1 })
    expect(readRecallLog(dir)[0].source).toBe('jit')
  })

  it('1000줄 초과 시 오래된 것부터 trim (maxSize)', () => {
    const dir = tmp()
    for (let i = 0; i < RECALL_LOG_MAX + 5; i++) {
      logRecall(dir, { source: 'recall', query: `q${i}`, hitIds: [], topScore: 0 })
    }
    const log = readRecallLog(dir)
    expect(log).toHaveLength(RECALL_LOG_MAX)
    expect(log[0].query).toBe('q5') // q0~q4 trim
    expect(log[log.length - 1].query).toBe(`q${RECALL_LOG_MAX + 4}`)
  }, 30000) // Goal 79: 1005회 logRecall(매 호출 전체 재작성=O(n²)) × Windows 동기 I/O 가 5s 기본 timeout 을 넘김 — 상향(실사용은 recall 1회당 1호출이라 무해). 상세 TS-004.

  it('손상된 줄은 skip (부분 파싱 안전)', () => {
    const dir = tmp()
    fs.mkdirSync(path.join(dir, '.vhk'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, RECALL_LOG_REL),
      ['{"ts":"t","source":"recall","query":"ok","hitIds":[],"topScore":1}', '{깨진 줄', ''].join('\n'),
      'utf-8'
    )
    const log = readRecallLog(dir)
    expect(log).toHaveLength(1)
    expect(log[0].query).toBe('ok')
  })

  it('파일 없으면 빈 배열', () => {
    expect(readRecallLog(tmp())).toEqual([])
  })

  // #331: 사용자 검색어 원문(recall-log.jsonl)은 프라이버시 → 기록과 동시에 .vhk/.gitignore 로
  // 자기방어해야 한다(이미 init 된 기존 프로젝트도 첫 recall 시 자동 보호). 템플릿만으론 누락.
  it('#331: logRecall 이 recall-log.jsonl 을 .vhk/.gitignore 에 자동 등록한다', () => {
    const dir = tmp()
    logRecall(dir, { source: 'recall', query: '사적 검색어', hitIds: [], topScore: 0 })
    const gi = fs.readFileSync(path.join(dir, '.vhk', '.gitignore'), 'utf-8')
    expect(gi).toMatch(/(^|\n)recall-log\.jsonl(\n|$)/)
  })

  it('#331: 멱등 — 여러 번 logRecall 해도 recall-log.jsonl 라인은 1개', () => {
    const dir = tmp()
    logRecall(dir, { source: 'recall', query: 'a', hitIds: [], topScore: 0 })
    logRecall(dir, { source: 'recall', query: 'b', hitIds: [], topScore: 0 })
    logRecall(dir, { source: 'jit', query: 'c', hitIds: [], topScore: 0 })
    const count = fs
      .readFileSync(path.join(dir, '.vhk', '.gitignore'), 'utf-8')
      .split('\n')
      .filter((l) => l.trim() === 'recall-log.jsonl').length
    expect(count).toBe(1)
  })
})
