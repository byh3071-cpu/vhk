import { lastActiveDay } from './lastActiveDay.js'
import { commitsInRange, activityDates, fetchRecentCommitSummaries } from './gitlog.js'
import { toGoalStates, recommendGoals, doneGoalsOnDay, unresolvedGoals } from './goals.js'
import { listGoals } from '../lib/goal-frontmatter.js'
import { localDate } from '../lib/date.js'
import type { StandupReport, CommitSummary, GoalState, DevLogEntry } from './types.js'
import type { ParsedGoal } from '../lib/goal-frontmatter.js'

// 순수 병합 — 주입된 git/goal/devlog 데이터로 StandupReport 생성.
// '어제' = 커밋·DevLog 활동일 중 today 직전 마지막 날. Dev Log 가 비어도(실패 폴백) git+goal 로 생성.
export function buildStandupReport(input: {
  asOf: string
  commits: CommitSummary[]
  goalStates: GoalState[]
  doneGoalsByDay: (day: string) => GoalState[]
  devlogs: DevLogEntry[]
}): StandupReport {
  const dates = [...activityDates(input.commits), ...input.devlogs.map((d) => d.date)]
  const last = lastActiveDay(dates, input.asOf)
  return {
    asOf: input.asOf,
    lastActiveDay: last,
    yesterday: {
      commits: last ? commitsInRange(input.commits, { start: last, end: last }) : [],
      devlogs: last ? input.devlogs.filter((d) => d.date === last) : [],
      doneGoals: last ? input.doneGoalsByDay(last) : [],
    },
    todayRecommend: recommendGoals(input.goalStates),
    unresolved: unresolvedGoals(input.goalStates),
  }
}

// 실제 데이터 수집 + 병합(CLI 진입점). Phase 1: git + goal (DevLog 는 Phase 2 → 빈 배열 폴백).
export async function runStandup(deps?: {
  asOf?: string
  goalsDir?: string
}): Promise<StandupReport> {
  const asOf = deps?.asOf ?? localDate()
  let commits: CommitSummary[] = []
  try {
    commits = await fetchRecentCommitSummaries() // 최근 ~200 커밋(활동일 산출용)
  } catch {
    commits = [] // git 실패해도 goal 로 리포트 생성
  }
  let goals: ParsedGoal[] = []
  try {
    goals = listGoals(deps?.goalsDir ?? 'goals')
  } catch {
    goals = []
  }
  const goalStates = toGoalStates(goals)
  return buildStandupReport({
    asOf,
    commits,
    goalStates,
    doneGoalsByDay: (day) => doneGoalsOnDay(goals, day),
    devlogs: [], // Phase 2: Dev Log 노션 데이터소스 연동
  })
}
