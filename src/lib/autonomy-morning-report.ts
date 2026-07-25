import type { AutonomyRunEntry } from './autonomy-log.js'

export interface AutonomyMorningCounts {
  starts: number
  complete: number
  hardstop: number
  blocked: number
  runIds: string[]
}

export interface AutonomyMorningReportInput {
  date: string // YYYY-MM-DD
  prUrl?: string
  entries: AutonomyRunEntry[]
  notes?: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isValidReportDate(date: string): boolean {
  return DATE_RE.test(date)
}

/** Keep entries whose ts starts with YYYY-MM-DD (UTC date prefix). */
export function filterEntriesByDate(entries: AutonomyRunEntry[], date: string): AutonomyRunEntry[] {
  if (!isValidReportDate(date)) return []
  return entries.filter((e) => typeof e.ts === 'string' && e.ts.startsWith(date))
}

export function countAutonomyEvents(entries: AutonomyRunEntry[]): AutonomyMorningCounts {
  let starts = 0
  let complete = 0
  let hardstop = 0
  let blocked = 0
  const runIdSet = new Set<string>()
  for (const e of entries) {
    if (e.runId) runIdSet.add(e.runId)
    if (e.event === 'start') starts++
    else if (e.event === 'complete') complete++
    else if (e.event === 'hardstop') hardstop++
    else if (e.event === 'blocked') blocked++
  }
  return { starts, complete, hardstop, blocked, runIds: [...runIdSet] }
}

export function renderAutonomyMorningReport(input: AutonomyMorningReportInput): string {
  const dayEntries = filterEntriesByDate(input.entries, input.date)
  const c = countAutonomyEvents(dayEntries)
  const pr = input.prUrl?.trim() ? input.prUrl.trim() : '(none — not opened yet)'
  const runIds = c.runIds.length > 0 ? c.runIds.map((id) => `- \`${id}\``).join('\n') : '- (none)'
  const notes = input.notes?.trim() ? input.notes.trim() : '(none)'
  return `# Autonomy overnight — ${input.date}

## Summary
- **PR URL**: ${pr}
- **starts**: ${c.starts}
- **complete**: ${c.complete}
- **hardstop**: ${c.hardstop}
- **blocked**: ${c.blocked}

## runIds
${runIds}

## Notes
${notes}

## Next
Follow \`docs/runbooks/MORNING_AUTONOMY_MERGE.md\` (3 questions). Merge = human only.
`
}
