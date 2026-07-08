// Goal 32 standup ↔ Goal 33 today 공유 타입. (33은 범위 필터만 얹게 설계)

export interface DateRange {
  start: string // YYYY-MM-DD (inclusive)
  end: string // YYYY-MM-DD (inclusive)
}

export interface CommitSummary {
  hash: string
  message: string
  date: string // YYYY-MM-DD (KST 로컬 날짜)
}

export type GoalStatusLite =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'DONE'
  | 'BLOCKED'
  | 'CANCELED'
  | 'DEFERRED'
  | 'OBSERVING'

export interface GoalState {
  id: number
  slug: string
  status: GoalStatusLite
}

export interface DevLogEntry {
  date: string // YYYY-MM-DD
  title: string
  lesson?: string
}

export interface StandupReport {
  asOf: string // 오늘 YYYY-MM-DD (KST)
  lastActiveDay: string | null // '어제' = 마지막 활동일 (없으면 null)
  yesterday: {
    commits: CommitSummary[]
    devlogs: DevLogEntry[]
    doneGoals: GoalState[]
  }
  todayRecommend: GoalState[] // 다음 NOT_STARTED + 진행 중 (단순 나열, 우선순위 알고리즘 X)
  unresolved: string[] // 막힌 것 / 미해결 메모
}

// Goal 33 today — 저녁 자축/회고. 단순 카운트(streak·게임요소·AI요약 v0 제외).
export interface TodayReport {
  date: string // 오늘 YYYY-MM-DD (KST)
  commitCount: number
  doneGoalCount: number
  devlogCount: number
  doneGoals: GoalState[]
  lessons: string[] // Dev Log 교훈 (Phase 2 연동, v0 는 빈 배열)
}
