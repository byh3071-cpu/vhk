import { describe, it, expect } from 'vitest'
import { calcAdoptionStats, computeCheckTrend } from '../src/commands/stats.js'
import type { EvolveLogEntry } from '../src/lib/evolve-log.js'
import type { CheckLogEntry } from '../src/lib/check-log.js'

// #374 (evolve 효과측정): evolve-log 기반 '결정된 것 대비' 채택률 + check-log 기반 위반수 추세.

function ev(applied: boolean, rejectReason: string | null = null, ts = 't'): EvolveLogEntry {
  return { ts, suggId: 'e1', patternId: 'p1', targetLayer: 'rule', applied, rejectReason }
}

function ck(total: number, ts: string): CheckLogEntry {
  return { ts, totalRules: 10, total, errors: total, warnings: 0 }
}

describe('calcAdoptionStats', () => {
  it('빈 로그 → rate 0, total 0 (NaN 방지)', () => {
    const r = calcAdoptionStats([])
    expect(r.applied).toEqual({ count: 0, total: 0, rate: 0 })
    expect(r.rejectReasons).toEqual([])
  })

  it('applied/전체(결정된 것) 비율 — pending 은 로그에 없으므로 분모에서 자연히 빠짐', () => {
    const r = calcAdoptionStats([ev(true), ev(true), ev(false), ev(false)])
    expect(r.applied).toEqual({ count: 2, total: 4, rate: 0.5 })
  })

  it('undo 기록은 승인·기각 통계에서 제외한다', () => {
    const undo: EvolveLogEntry = { ...ev(false), event: 'undo' }
    const r = calcAdoptionStats([ev(true), ev(false), undo])
    expect(r.applied).toEqual({ count: 1, total: 2, rate: 0.5 })
  })

  it('구버전 큐 이전 기록은 새 사람 결정으로 중복 집계하지 않는다', () => {
    const migration: EvolveLogEntry = { ...ev(true), event: 'migration' }
    const r = calcAdoptionStats([ev(true), migration])
    expect(r.applied).toEqual({ count: 1, total: 1, rate: 1 })
  })

  it('기각 사유 분포 — 사유 있는 것끼리 그룹핑, 내림차순 정렬', () => {
    const r = calcAdoptionStats([
      ev(false, '문구 부정확'),
      ev(false, '문구 부정확'),
      ev(false, '중복'),
    ])
    expect(r.rejectReasons).toEqual([
      { reason: '문구 부정확', count: 2 },
      { reason: '중복', count: 1 },
    ])
  })

  it('사유 없는 reject → "(사유 없음)" 버킷', () => {
    const r = calcAdoptionStats([ev(false, null), ev(false, '')])
    expect(r.rejectReasons).toEqual([{ reason: '(사유 없음)', count: 2 }])
  })

  it('applied 항목은 rejectReasons 집계에서 제외', () => {
    const r = calcAdoptionStats([ev(true), ev(false, '이유')])
    expect(r.rejectReasons).toEqual([{ reason: '이유', count: 1 }])
  })
})

describe('computeCheckTrend', () => {
  it('빈 입력 → total 0, avgTotal·trend null(표본 없음을 0 으로 위장 안 함)', () => {
    const tr = computeCheckTrend([])
    expect(tr.total).toBe(0)
    expect(tr.avgTotal).toBeNull()
    expect(tr.trend).toBeNull()
  })

  it('표본 1개 → avgTotal 있음, trend null(절반 비교 불가)', () => {
    const tr = computeCheckTrend([ck(3, '2026-07-01T01:00:00Z')])
    expect(tr.total).toBe(1)
    expect(tr.avgTotal).toBe(3)
    expect(tr.trend).toBeNull()
  })

  it('앞절반 vs 뒷절반 평균 위반수 비교 (delta 양수=악화)', () => {
    const tr = computeCheckTrend([
      ck(10, '2026-07-01T01:00:00Z'),
      ck(10, '2026-07-01T02:00:00Z'),
      ck(2, '2026-07-01T03:00:00Z'),
      ck(2, '2026-07-01T04:00:00Z'),
    ])
    expect(tr.trend).not.toBeNull()
    expect(tr.trend!.earlierN).toBe(2)
    expect(tr.trend!.recentN).toBe(2)
    expect(tr.trend!.earlierAvg).toBe(10)
    expect(tr.trend!.recentAvg).toBe(2)
    expect(tr.trend!.delta).toBe(-8) // 개선(위반 감소)
  })

  it('ts 순서 무관 — 정렬 후 계산(결정성)', () => {
    const tr = computeCheckTrend([
      ck(2, '2026-07-01T04:00:00Z'),
      ck(10, '2026-07-01T01:00:00Z'),
      ck(2, '2026-07-01T03:00:00Z'),
      ck(10, '2026-07-01T02:00:00Z'),
    ])
    expect(tr.trend!.earlierAvg).toBe(10)
    expect(tr.trend!.recentAvg).toBe(2)
  })

  it('홀수 total → 뒤절반이 1 많음(earlierN<recentN)', () => {
    const tr = computeCheckTrend([
      ck(5, '2026-07-01T01:00:00Z'),
      ck(3, '2026-07-01T02:00:00Z'),
      ck(1, '2026-07-01T03:00:00Z'),
    ])
    expect(tr.total).toBe(3)
    expect(tr.trend!.earlierN).toBe(1)
    expect(tr.trend!.recentN).toBe(2)
  })
})
