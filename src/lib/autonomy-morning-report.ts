/**
 * Goal 103: build morning autonomy overnight report markdown (pure).
 * Sample counts from autonomy-run.jsonl; PR URL supplied by caller (wrapper).
 */

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

/** Render markdown for docs/audits/autonomy-overnight-<date>.md */
export function renderAutonomyMorningReport(input: AutonomyMorningReportInput): string {
  const c = countAutonomyEvents(input.entries)
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
