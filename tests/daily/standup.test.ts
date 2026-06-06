import { describe, it, expect } from 'vitest'
import { buildStandupReport } from '../../src/daily/standup.js'
import type { CommitSummary, GoalState, DevLogEntry } from '../../src/daily/types.js'

const c = (date: string, message = 'm'): CommitSummary => ({ hash: 'h', message, date })
const gs = (id: number, status: GoalState['status'], slug = 's'): GoalState => ({ id, slug, status })

const base = {
  asOf: '2026-06-08',
  commits: [c('2026-06-05', 'PR #126 오픈'), c('2026-06-05', '커밋2'), c('2026-06-01', '옛날')],
  goalStates: [gs(15, 'NOT_STARTED'), gs(20, 'IN_PROGRESS'), gs(19, 'DONE'), gs(7, 'BLOCKED')],
  doneGoalsByDay: (_day: string): GoalState[] => [gs(19, 'DONE', 'pattern')],
  devlogs: [] as DevLogEntry[],
}

describe('buildStandupReport', () => {
  it('lastActiveDay = 마지막 활동일(금 6/5), 그날 커밋만 yesterday 에', () => {
    const r = buildStandupReport(base)
    expect(r.lastActiveDay).toBe('2026-06-05')
    expect(r.yesterday.commits).toHaveLength(2) // 6/5 두 건, 6/1 제외
  })

  it('오늘 추천 = NOT_STARTED + IN_PROGRESS 나열 (15, 20)', () => {
    const r = buildStandupReport(base)
    expect(r.todayRecommend.map((g) => g.id)).toEqual([15, 20])
  })

  it('미해결 = BLOCKED (7)', () => {
    const r = buildStandupReport(base)
    expect(r.unresolved.join(' ')).toContain('7')
  })

  it('Dev Log 비어도(실패 폴백) 리포트 생성 — git+goal 로', () => {
    const r = buildStandupReport({ ...base, devlogs: [] })
    expect(r.yesterday.devlogs).toEqual([])
    expect(r.lastActiveDay).toBe('2026-06-05') // 커밋만으로도 활동일 산출
  })

  it('활동 전무(신규 repo) → lastActiveDay null, yesterday 비고, 추천은 유지', () => {
    const r = buildStandupReport({ ...base, commits: [], devlogs: [], doneGoalsByDay: () => [] })
    expect(r.lastActiveDay).toBeNull()
    expect(r.yesterday.commits).toEqual([])
    expect(r.todayRecommend.map((g) => g.id)).toEqual([15, 20])
  })
})
