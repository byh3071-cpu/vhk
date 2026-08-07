import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { countLedgerStatus, calcBlockRate, calcApplyRate, stats } from '../src/commands/stats.js'
import type { LedgerEntry } from '../src/lib/evidence-ledger.js'
import type { AiActionEntry } from '../src/lib/ai-actions-ledger.js'
import type { EvolveQueueItem } from '../src/commands/evolve.js'

const ledger = (status: 'PASS' | 'WARN' | 'FAIL'): LedgerEntry => ({
  version: '1.0.0', date: '2026-06-10', status, sha: null, shortSha: null, dirty: null,
})
const action = (ran: boolean): AiActionEntry => ({
  ts: 't', action: 'x', channel: 'cli', guard: 'risk', ran, reason: '',
})
const qitem = (status: 'pending' | 'rejected' | 'applied'): EvolveQueueItem => ({
  id: 'e', patternId: 'p', kind: 'rule', targetLayer: 'rule', status,
  draft: 'd', dedupeKey: 'p:rule', createdAt: 't',
})

describe('countLedgerStatus', () => {
  it('PASS/WARN/FAIL 정확 카운트', () => {
    const r = countLedgerStatus([ledger('PASS'), ledger('PASS'), ledger('WARN'), ledger('FAIL')])
    expect(r).toEqual({ pass: 2, warn: 1, fail: 1, total: 4 })
  })
  it('빈 원장 → 0', () => {
    expect(countLedgerStatus([])).toEqual({ pass: 0, warn: 0, fail: 0, total: 0 })
  })
})

describe('calcBlockRate', () => {
  it('ran=false / 전체 = 차단율', () => {
    const r = calcBlockRate([action(true), action(false), action(false), action(true)])
    expect(r.count).toBe(2)
    expect(r.total).toBe(4)
    expect(r.rate).toBe(0.5)
  })
  it('빈 입력 → rate 0 (NaN 방지)', () => {
    expect(calcBlockRate([])).toEqual({ count: 0, total: 0, rate: 0 })
  })
})

describe('calcApplyRate', () => {
  it('applied / 전체 = 적용율', () => {
    const r = calcApplyRate([qitem('applied'), qitem('pending'), qitem('rejected'), qitem('applied')])
    expect(r.count).toBe(2)
    expect(r.total).toBe(4)
    expect(r.rate).toBe(0.5)
  })
  it('빈 큐 → rate 0', () => {
    expect(calcApplyRate([])).toEqual({ count: 0, total: 0, rate: 0 })
  })
})

describe('stats 커맨드 (읽기 전용)', () => {
  const originalCwd = process.cwd()
  let logSpy: ReturnType<typeof vi.spyOn> | undefined
  let tempDir: string | undefined

  afterEach(() => {
    if (logSpy) logSpy.mockRestore()
    process.chdir(originalCwd)
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true })
    logSpy = undefined
    tempDir = undefined
  })

  it('빈 cwd 에서도 throw 없이 동작 + 파일 쓰기 0건', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-stats-'))
    tempDir = d
    process.chdir(d)
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await expect(stats()).resolves.toBeUndefined()

    // 읽기 전용 — .vhk 디렉터리(쓰기 흔적) 생성 안 함
    expect(fs.existsSync(path.join(d, '.vhk'))).toBe(false)
  })

  it('진화 기록을 읽지 못해도 경고하고 빈 통계로 계속한다', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-stats-log-'))
    tempDir = d
    fs.mkdirSync(path.join(d, '.vhk', 'events', 'evolve-log.jsonl'), { recursive: true })
    process.chdir(d)
    const output: string[] = []
    logSpy = vi.spyOn(console, 'log').mockImplementation((message?: unknown) => { output.push(String(message)) })

    await expect(stats()).resolves.toBeUndefined()
    expect(output.join('\n')).toContain('진화 결정 기록을 읽지 못해')
  })
})
