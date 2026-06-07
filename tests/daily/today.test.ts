import { describe, it, expect } from 'vitest'
import { dayRange, buildTodayReport, pickMessage, MESSAGES } from '../../src/daily/today.js'
import type { CommitSummary, GoalState, DevLogEntry } from '../../src/daily/types.js'

const c = (date: string): CommitSummary => ({ hash: 'h', message: 'm', date })
const gs = (id: number): GoalState => ({ id, slug: 's', status: 'DONE' })

describe('dayRange', () => {
  it('오늘 단일 날 [today, today]', () => {
    expect(dayRange('2026-06-07')).toEqual({ start: '2026-06-07', end: '2026-06-07' })
  })
})

describe('buildTodayReport', () => {
  const base = {
    today: '2026-06-07',
    commits: [c('2026-06-07'), c('2026-06-07'), c('2026-06-06')], // 오늘 2, 어제 1
    doneGoals: [gs(31), gs(32)],
    devlogs: [{ date: '2026-06-07', title: 't', lesson: '교훈A' }] as DevLogEntry[],
  }
  it('오늘 커밋만 카운트 (어제 제외)', () => {
    expect(buildTodayReport(base).commitCount).toBe(2)
  })
  it('완료 goal·Dev Log 카운트 + 교훈 추출', () => {
    const r = buildTodayReport(base)
    expect(r.doneGoalCount).toBe(2)
    expect(r.devlogCount).toBe(1)
    expect(r.lessons).toEqual(['교훈A'])
  })
  it('활동 전무 → 전부 0', () => {
    const r = buildTodayReport({ today: '2026-06-07', commits: [], doneGoals: [], devlogs: [] })
    expect(r.commitCount).toBe(0)
    expect(r.doneGoalCount).toBe(0)
    expect(r.lessons).toEqual([])
  })
})

describe('pickMessage', () => {
  it('seed % length 로 결정적 선택', () => {
    expect(pickMessage(['a', 'b', 'c'], 0)).toBe('a')
    expect(pickMessage(['a', 'b', 'c'], 4)).toBe('b')
  })
  it('음수 seed 도 안전', () => {
    expect(['a', 'b', 'c']).toContain(pickMessage(['a', 'b', 'c'], -1))
  })
  it('실제 MESSAGES 풀은 비어있지 않음(담백한 톤)', () => {
    expect(MESSAGES.length).toBeGreaterThan(0)
  })
})
