import { describe, it, expect } from 'vitest'
import { normalizeCommitDate, commitsInRange, activityDates } from '../../src/daily/gitlog.js'
import type { CommitSummary } from '../../src/daily/types.js'

describe('normalizeCommitDate', () => {
  it("'YYYY-MM-DD HH:..' 에서 날짜만", () => {
    expect(normalizeCommitDate('2026-06-06 12:30:00 +0900')).toBe('2026-06-06')
  })
  it('ISO 에서 날짜만', () => {
    expect(normalizeCommitDate('2026-06-06T03:00:00.000Z')).toBe('2026-06-06')
  })
})

const mk = (date: string, hash = 'h'): CommitSummary => ({ hash, message: 'm', date })

describe('commitsInRange', () => {
  it('start~end inclusive 필터', () => {
    const commits = [mk('2026-06-04'), mk('2026-06-05'), mk('2026-06-06')]
    const r = commitsInRange(commits, { start: '2026-06-05', end: '2026-06-05' })
    expect(r).toHaveLength(1)
    expect(r[0].date).toBe('2026-06-05')
  })
})

describe('activityDates', () => {
  it('중복 제거한 날짜 집합', () => {
    expect(activityDates([mk('2026-06-05'), mk('2026-06-05'), mk('2026-06-04')]).sort()).toEqual(['2026-06-04', '2026-06-05'])
  })
})
