#!/usr/bin/env node
// scripts/gen-autonomy-morning-report.mjs — Goal 103 helper (ASCII CLI).
// Writes docs/audits/autonomy-overnight-<date>.md from autonomy-run.jsonl + optional --pr.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

function parseArgs(argv) {
  const out = { date: '', pr: '', cwd: process.cwd() }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--date' && argv[i + 1]) out.date = argv[++i]
    else if (a === '--pr' && argv[i + 1]) out.pr = argv[++i]
    else if (a === '--cwd' && argv[i + 1]) out.cwd = argv[++i]
  }
  if (!out.date) {
    const d = new Date()
    out.date = d.toISOString().slice(0, 10)
  }
  if (!DATE_RE.test(out.date)) {
    throw new Error('--date must use YYYY-MM-DD')
  }
  return out
}

function readEntries(cwd) {
  const p = join(cwd, '.vhk', 'events', 'autonomy-run.jsonl')
  if (!existsSync(p)) return []
  const out = []
  for (const line of stripBom(readFileSync(p, 'utf-8')).split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    try {
      out.push(JSON.parse(t))
    } catch {
      /* skip */
    }
  }
  return out
}

function filterByDate(entries, date) {
  return entries.filter((e) => typeof e.ts === 'string' && e.ts.startsWith(date))
}

function count(entries) {
  let starts = 0
  let complete = 0
  let hardstop = 0
  let blocked = 0
  const runIds = new Set()
  for (const e of entries) {
    if (e.runId) runIds.add(e.runId)
    if (e.event === 'start') starts++
    else if (e.event === 'complete') complete++
    else if (e.event === 'hardstop') hardstop++
    else if (e.event === 'blocked') blocked++
  }
  return { starts, complete, hardstop, blocked, runIds: [...runIds] }
}

function render(date, prUrl, entries) {
  const c = count(entries)
  const pr = prUrl && prUrl.trim() ? prUrl.trim() : '(none — not opened yet)'
  const runIds = c.runIds.length > 0 ? c.runIds.map((id) => `- \`${id}\``).join('\n') : '- (none)'
  return `# Autonomy overnight — ${date}

## Summary
- **PR URL**: ${pr}
- **starts**: ${c.starts}
- **complete**: ${c.complete}
- **hardstop**: ${c.hardstop}
- **blocked**: ${c.blocked}

## runIds
${runIds}

## Notes
(none)

## Next
Follow \`docs/runbooks/MORNING_AUTONOMY_MERGE.md\` (3 questions). Merge = human only.
`
}

const opts = parseArgs(process.argv)
const entries = filterByDate(readEntries(opts.cwd), opts.date)
const md = render(opts.date, opts.pr, entries)
const dir = join(opts.cwd, 'docs', 'audits')
mkdirSync(dir, { recursive: true })
const outPath = join(dir, `autonomy-overnight-${opts.date}.md`)
writeFileSync(outPath, md, 'utf-8')
console.log(outPath)
