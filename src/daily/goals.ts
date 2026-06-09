import type { ParsedGoal, GoalStatus } from '../lib/goal-frontmatter.js'
import type { GoalState } from './types.js'

// 파일명에서 slug 추출: 'goals/32-standup.md' → 'standup'.
function slugFromPath(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() ?? ''
  return base.replace(/\.md$/, '').replace(/^\d+-/, '')
}

function toState(g: ParsedGoal): GoalState {
  return {
    id: g.frontmatter.id as number,
    slug: slugFromPath(g.filePath),
    status: (g.frontmatter.status ?? 'NOT_STARTED'),
  }
}

export function toGoalStates(goals: ParsedGoal[]): GoalState[] {
  return goals.filter((g) => typeof g.frontmatter.id === 'number').map(toState)
}

// 오늘 추천 = 다음 NOT_STARTED + 진행 중. 단순 나열(우선순위 알고리즘 X).
export function recommendGoals(states: GoalState[]): GoalState[] {
  return states.filter((s) => s.status === 'NOT_STARTED' || s.status === 'IN_PROGRESS')
}

// 특정 날짜에 DONE 된 goal (frontmatter.completed === day).
export function doneGoalsOnDay(goals: ParsedGoal[], day: string): GoalState[] {
  return goals
    .filter((g) => g.frontmatter.status === ('DONE' as GoalStatus) && g.frontmatter.completed === day)
    .filter((g) => typeof g.frontmatter.id === 'number')
    .map(toState)
}

// 미해결 = BLOCKED goal 메모.
export function unresolvedGoals(states: GoalState[]): string[] {
  return states.filter((s) => s.status === 'BLOCKED').map((s) => `Goal ${s.id} (${s.slug}) — BLOCKED`)
}
