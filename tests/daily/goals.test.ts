import { describe, it, expect } from 'vitest'
import { toGoalStates, recommendGoals, doneGoalsOnDay, unresolvedGoals } from '../../src/daily/goals.js'
import type { ParsedGoal } from '../../src/lib/goal-frontmatter.js'

const g = (id: number, status: string, name: string, completed?: string): ParsedGoal => ({
  filePath: `goals/${id}-${name}.md`,
  frontmatter: { type: 'goal', id, status: status as never, title: name, ...(completed ? { completed } : {}) },
  body: '',
})

describe('toGoalStates', () => {
  it('ParsedGoal → GoalState (slug = 파일명에서 추출)', () => {
    const s = toGoalStates([g(32, 'NOT_STARTED', 'standup')])
    expect(s[0]).toMatchObject({ id: 32, slug: 'standup', status: 'NOT_STARTED' })
  })
  it('status 없으면 NOT_STARTED', () => {
    const goal: ParsedGoal = { filePath: 'goals/1-x.md', frontmatter: { type: 'goal', id: 1 }, body: '' }
    expect(toGoalStates([goal])[0].status).toBe('NOT_STARTED')
  })
})

describe('recommendGoals', () => {
  it('NOT_STARTED + IN_PROGRESS 만 (단순 나열, DONE/BLOCKED 제외)', () => {
    const states = toGoalStates([
      g(1, 'DONE', 'a'), g(2, 'NOT_STARTED', 'b'), g(3, 'IN_PROGRESS', 'c'), g(4, 'BLOCKED', 'd'),
    ])
    const r = recommendGoals(states).map((s) => s.id)
    expect(r).toEqual([2, 3])
  })
})

describe('doneGoalsOnDay', () => {
  it('해당 날 DONE 된 goal 만', () => {
    const goals = [g(1, 'DONE', 'a', '2026-06-05'), g(2, 'DONE', 'b', '2026-06-04'), g(3, 'NOT_STARTED', 'c')]
    const r = doneGoalsOnDay(goals, '2026-06-05').map((s) => s.id)
    expect(r).toEqual([1])
  })
})

describe('unresolvedGoals', () => {
  it('BLOCKED goal 을 메모로', () => {
    const states = toGoalStates([g(5, 'BLOCKED', 'stuck'), g(6, 'NOT_STARTED', 'ok')])
    const r = unresolvedGoals(states)
    expect(r).toHaveLength(1)
    expect(r[0]).toContain('5')
  })
})
