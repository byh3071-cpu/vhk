import { commitsInRange, fetchRecentCommitSummaries } from './gitlog.js'
import { doneGoalsOnDay } from './goals.js'
import { listGoals } from '../lib/goal-frontmatter.js'
import { localDate } from '../lib/date.js'
import { readDevLogs } from './devlog.js'
import type { DateRange, CommitSummary, GoalState, DevLogEntry, TodayReport } from './types.js'
import type { ParsedGoal } from '../lib/goal-frontmatter.js'

// Goal 33 today — Goal 32 standup 과 daily 모듈 공유. today 는 '오늘 단일 날' 범위만 얹는다.

// 오늘 범위 = [today, today] (오늘 00:00~now, KST 날짜 기준).
export function dayRange(today: string): DateRange {
  return { start: today, end: today }
}

// 담백한 격려 문구 풀(톤 절제 — 유치함 방지). 연속기록·게임요소는 v0 에서 의도적으로 제외.
export const MESSAGES: string[] = [
  '오늘도 한 칸 전진. 내일의 너가 고마워할 기록을 남겼다.',
  '작게라도 매일이 복리다. 오늘 것도 쌓였다.',
  '오늘 한 만큼은 확실히 남았다.',
  '천천히, 그러나 멈추지 않았다.',
  '기록이 곧 증거. 오늘도 증거를 남겼다.',
]

// 결정적 메시지 선택(seed % length). 음수 seed 안전.
export function pickMessage(pool: string[], seed: number): string {
  if (pool.length === 0) return ''
  return pool[Math.abs(seed) % pool.length]
}

// 순수: 오늘 데이터 → TodayReport(단순 카운트). DevLog 비어도 git+goal 로 생성.
export function buildTodayReport(input: {
  today: string
  commits: CommitSummary[]
  doneGoals: GoalState[]
  devlogs: DevLogEntry[]
}): TodayReport {
  const todays = commitsInRange(input.commits, dayRange(input.today))
  return {
    date: input.today,
    commitCount: todays.length,
    doneGoalCount: input.doneGoals.length,
    devlogCount: input.devlogs.length,
    doneGoals: input.doneGoals,
    lessons: input.devlogs.map((d) => d.lesson).filter((l): l is string => !!l),
  }
}

// 실제 수집 + 병합(CLI 진입점). Phase 1: git + goal (DevLog Phase 2 → 빈 배열 폴백).
export async function runToday(deps?: { today?: string; goalsDir?: string; logDir?: string }): Promise<TodayReport> {
  const today = deps?.today ?? localDate()
  let commits: CommitSummary[] = []
  try {
    commits = await fetchRecentCommitSummaries()
  } catch {
    commits = []
  }
  let goals: ParsedGoal[] = []
  try {
    goals = listGoals(deps?.goalsDir ?? 'goals')
  } catch {
    goals = []
  }
  return buildTodayReport({
    today,
    commits,
    doneGoals: doneGoalsOnDay(goals, today),
    // Phase 2: 오늘 docs/log dev log → devlogCount + lessons.
    devlogs: readDevLogs(deps?.logDir ?? 'docs/log', { start: today, end: today }),
  })
}
