import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  COST_PATH_REL,
  readCostEntries,
  appendCostEntry,
  sumUsd,
  type CostEntry,
} from '../src/lib/cost-ledger.js'

// Goal 56: cost.jsonl 은 evidence-ledger append 패턴 재사용 — append-only, atomicWriteFile,
// 과거 줄 변경 0. (단 evidence-ledger 의 dedup-last 는 미적용 — 비용 기록은 매 건이 실 사용.)

const E = (usd: number, source = 'manual'): CostEntry => ({ ts: '2026-06-09T00:00:00Z', source, usd })

describe('cost-ledger', () => {
  let dir = ''
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vhk-cost-'))
  })
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = ''
  })

  it('COST_PATH_REL = .vhk/cost.jsonl', () => {
    expect(COST_PATH_REL).toBe(join('.vhk', 'cost.jsonl'))
  })

  it('파일 없으면 빈 배열', () => {
    expect(readCostEntries(dir)).toEqual([])
  })

  it('append → read 왕복', () => {
    expect(appendCostEntry(dir, E(5))).toEqual({ appended: true })
    const got = readCostEntries(dir)
    expect(got).toHaveLength(1)
    expect(got[0].usd).toBe(5)
  })

  it('append-only — 2번째 append 후 과거 줄 보존(순서 유지)', () => {
    appendCostEntry(dir, E(5, 'first'))
    const afterFirst = readFileSync(join(dir, COST_PATH_REL), 'utf-8')
    appendCostEntry(dir, E(7, 'second'))
    const all = readCostEntries(dir)
    expect(all).toHaveLength(2)
    expect(all[0].source).toBe('first')
    expect(all[1].source).toBe('second')
    // 첫 줄이 그대로 유지(과거 변경 0)
    expect(readFileSync(join(dir, COST_PATH_REL), 'utf-8').startsWith(afterFirst.replace(/\n$/, ''))).toBe(true)
  })

  it('동일 값도 매번 append(비용 기록은 dedup 안 함)', () => {
    appendCostEntry(dir, E(5))
    appendCostEntry(dir, E(5))
    expect(readCostEntries(dir)).toHaveLength(2)
  })

  it('손상 라인은 skip(원장 한 줄 깨져도 안 죽음)', () => {
    mkdirSync(join(dir, '.vhk'), { recursive: true })
    writeFileSync(join(dir, COST_PATH_REL), '{"ts":"t","source":"ok","usd":3}\n{깨진 줄\n{"ts":"t","source":"ok2","usd":4}\n')
    const got = readCostEntries(dir)
    expect(got).toHaveLength(2)
    expect(got.map(e => e.usd)).toEqual([3, 4])
  })

  it('sumUsd — usd 합산', () => {
    expect(sumUsd([E(5), E(7), E(0.5)])).toBeCloseTo(12.5)
    expect(sumUsd([])).toBe(0)
  })
})
