import { getRecentCommits } from '../lib/git.js'
import type { CommitSummary, DateRange } from './types.js'

// git 날짜 문자열에서 YYYY-MM-DD 추출. simple-git date 는 ISO 또는 'YYYY-MM-DD HH:..' 형태.
export function normalizeCommitDate(raw: string): string {
  const m = raw.match(/(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : raw.slice(0, 10)
}

// start~end inclusive 필터 (YYYY-MM-DD 문자열 비교).
export function commitsInRange(commits: CommitSummary[], range: DateRange): CommitSummary[] {
  return commits.filter((c) => c.date >= range.start && c.date <= range.end)
}

// 활동이 있었던 날짜 집합(중복 제거).
export function activityDates(commits: CommitSummary[]): string[] {
  return [...new Set(commits.map((c) => c.date))]
}

// 최근 N일 커밋을 CommitSummary[] 로. 기존 getRecentCommits(simple-git) 재사용 —
// withMidnight approxidate 픽스(off-by-one)도 그쪽에서 처리됨. since 없으면 전체 최근.
export async function fetchRecentCommitSummaries(since?: string, count = 200): Promise<CommitSummary[]> {
  const raw = await getRecentCommits(count, since)
  return raw.map((c) => ({ hash: c.hash, message: c.message, date: normalizeCommitDate(c.date) }))
}
