import { describe, it, expect } from 'vitest'
import { computeReceiptTrend } from '../src/commands/stats.js'
import type { ReceiptLogEntry } from '../src/lib/receipt-log.js'

// N6(ⓔ): receipt-log 시계열 추세. 순수 계산 검증.

function entry(
  ts: string,
  decision: 'block' | 'caution' | 'pass',
  extra: Partial<ReceiptLogEntry> = {},
): ReceiptLogEntry {
  return {
    ts,
    decision,
    sha: null,
    shortSha: null,
    red: decision === 'block',
    gateStatus: 'PASS',
    dirty: false,
    stale: null,
    diffCoverRatio: null,
    diffCoverUncovered: null,
    forbiddenHits: null,
    scopeWarnings: null,
    ...extra,
  }
}

describe('computeReceiptTrend', () => {
  it('빈 입력 → total 0, trend·avgDiffCover null (표본 없음을 0 으로 위장 안 함)', () => {
    const tr = computeReceiptTrend([])
    expect(tr.total).toBe(0)
    expect(tr.trend).toBeNull()
    expect(tr.avgDiffCover).toBeNull()
  })

  it('decision 분포·red·dirty 집계', () => {
    const tr = computeReceiptTrend([
      entry('2026-07-01T01:00:00Z', 'pass'),
      entry('2026-07-01T02:00:00Z', 'block'),
      entry('2026-07-01T03:00:00Z', 'caution', { dirty: true }),
      entry('2026-07-01T04:00:00Z', 'block', { dirty: true }),
    ])
    expect(tr.total).toBe(4)
    expect(tr.byDecision).toEqual({ block: 2, caution: 1, pass: 1 })
    expect(tr.redRate.count).toBe(2)
    expect(tr.dirtyRate.count).toBe(2)
  })

  it('avgDiffCover = measured 평균(null 제외)', () => {
    const tr = computeReceiptTrend([
      entry('2026-07-01T01:00:00Z', 'pass', { diffCoverRatio: 0.8 }),
      entry('2026-07-01T02:00:00Z', 'pass', { diffCoverRatio: 0.6 }),
      entry('2026-07-01T03:00:00Z', 'pass', { diffCoverRatio: null }),
    ])
    expect(tr.avgDiffCover).toBeCloseTo(0.7)
    expect(tr.coverN).toBe(2)
  })

  it('추세 = 앞절반 vs 뒷절반 block 비율 (delta 양수=악화)', () => {
    const tr = computeReceiptTrend([
      entry('2026-07-01T01:00:00Z', 'pass'),
      entry('2026-07-01T02:00:00Z', 'pass'),
      entry('2026-07-01T03:00:00Z', 'block'),
      entry('2026-07-01T04:00:00Z', 'block'),
    ])
    expect(tr.trend).not.toBeNull()
    expect(tr.trend!.earlierN).toBe(2)
    expect(tr.trend!.recentN).toBe(2)
    expect(tr.trend!.earlierBlockRate).toBe(0)
    expect(tr.trend!.recentBlockRate).toBe(1)
    expect(tr.trend!.delta).toBe(1)
  })

  it('ts 순서 무관 — 정렬 후 계산(결정성)', () => {
    const tr = computeReceiptTrend([
      entry('2026-07-01T04:00:00Z', 'block'),
      entry('2026-07-01T01:00:00Z', 'pass'),
      entry('2026-07-01T03:00:00Z', 'block'),
      entry('2026-07-01T02:00:00Z', 'pass'),
    ])
    expect(tr.trend!.earlierBlockRate).toBe(0)
    expect(tr.trend!.recentBlockRate).toBe(1)
  })

  it('홀수 total → 뒤절반이 1 많음 (earlierN<recentN, 적대리뷰 라벨 정직표기 가드)', () => {
    const tr = computeReceiptTrend([
      entry('2026-07-01T01:00:00Z', 'pass'),
      entry('2026-07-01T02:00:00Z', 'block'),
      entry('2026-07-01T03:00:00Z', 'block'),
    ])
    expect(tr.total).toBe(3)
    expect(tr.trend!.earlierN).toBe(1)
    expect(tr.trend!.recentN).toBe(2)
  })

  it('total 1 → trend null (절반 비교 불가)', () => {
    const tr = computeReceiptTrend([entry('2026-07-01T01:00:00Z', 'block')])
    expect(tr.total).toBe(1)
    expect(tr.trend).toBeNull()
  })
})
