#!/usr/bin/env node
// scripts/gen-autonomy-morning-report.mjs — Goal 103 helper (ASCII CLI).
// Writes docs/audits/autonomy-overnight-<date>.md from autonomy-run.jsonl + optional --pr.

import {
  appendFileSync,
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

// Goal 111-T3: 자기신고 옵션 — 전부 선택. 미입력이어도 리포트 실행 자체가 기록돼
// 응답률의 분모(리포트가 실행된 고유 관측일)가 된다.
function parseIntArg(raw, name) {
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a non-negative integer`)
  return Number(raw)
}

function parseArgs(argv) {
  const out = { date: '', pr: '', cwd: process.cwd(), trackingMin: undefined, unchecked: undefined, approvalTotal: undefined }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--date' && argv[i + 1]) out.date = argv[++i]
    else if (a === '--pr' && argv[i + 1]) out.pr = argv[++i]
    else if (a === '--cwd' && argv[i + 1]) out.cwd = argv[++i]
    else if (a === '--tracking-min' && argv[i + 1]) out.trackingMin = parseIntArg(argv[++i], '--tracking-min')
    else if (a === '--unchecked' && argv[i + 1]) out.unchecked = parseIntArg(argv[++i], '--unchecked')
    else if (a === '--approval-total' && argv[i + 1]) out.approvalTotal = parseIntArg(argv[++i], '--approval-total')
  }
  if (!out.date) {
    const d = new Date()
    out.date = d.toISOString().slice(0, 10)
  }
  if (!DATE_RE.test(out.date)) {
    throw new Error('--date must use YYYY-MM-DD')
  }
  if (out.unchecked !== undefined && out.approvalTotal !== undefined && out.unchecked > out.approvalTotal) {
    throw new Error('--unchecked must not exceed --approval-total')
  }
  return out
}

// MorningObservation append — 스키마의 원본 계약은 src/lib/autonomy-log.ts
// normalizeMorningObservation. 읽기 쪽이 무효 라인을 걸러내는 최종 게이트이므로
// 여기서는 CLI 인자 검증(정수·상한)까지만 한다.
function appendMorning(cwd, opts) {
  const obs = { kind: 'morning', ts: new Date().toISOString(), date: opts.date }
  if (opts.trackingMin !== undefined) obs.trackingMin = opts.trackingMin
  if (opts.unchecked !== undefined) obs.uncheckedApprovals = opts.unchecked
  if (opts.approvalTotal !== undefined) obs.approvalDecisionsTotal = opts.approvalTotal
  const dir = join(cwd, '.vhk', 'events')
  mkdirSync(dir, { recursive: true })
  const logPath = join(dir, 'autonomy-run.jsonl')
  let separator = ''
  let fd
  try {
    fd = openSync(logPath, 'r')
    const size = fstatSync(fd).size
    if (size > 0) {
      const tail = Buffer.allocUnsafe(1)
      if (readSync(fd, tail, 0, 1, size - 1) !== 1) throw new Error('autonomy log tail could not be read')
      // Readers split on LF or CRLF. A lone CR needs LF to become a boundary.
      if (tail[0] !== 0x0a) separator = '\n'
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
  appendFileSync(logPath, `${separator}${JSON.stringify(obs)}\n`, 'utf-8')
  return obs
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

function render(date, prUrl, entries, selfReport) {
  const c = count(entries)
  const pr = prUrl && prUrl.trim() ? prUrl.trim() : '(none — not opened yet)'
  const runIds = c.runIds.length > 0 ? c.runIds.map((id) => `- \`${id}\``).join('\n') : '- (none)'
  const sr = []
  sr.push(`- **tracking-min**: ${selfReport.trackingMin ?? '(not reported)'}`)
  const ratio =
    selfReport.unchecked !== undefined && selfReport.approvalTotal !== undefined
      ? `${selfReport.unchecked}/${selfReport.approvalTotal}`
      : '(not reported — both --unchecked and --approval-total required)'
  sr.push(`- **unchecked approvals**: ${ratio}`)
  return `# Autonomy overnight — ${date}

## Summary
- **PR URL**: ${pr}
- **starts**: ${c.starts}
- **complete**: ${c.complete}
- **hardstop**: ${c.hardstop}
- **blocked**: ${c.blocked}

## runIds
${runIds}

## Self report (reference only — not a gate metric)
${sr.join('\n')}

## Notes
(none)

## Next
Follow \`docs/runbooks/MORNING_AUTONOMY_MERGE.md\` (3 questions). Merge = human only.
`
}

const opts = parseArgs(process.argv)
appendMorning(opts.cwd, opts)
const entries = filterByDate(readEntries(opts.cwd), opts.date)
const md = render(opts.date, opts.pr, entries, opts)
const dir = join(opts.cwd, 'docs', 'audits')
mkdirSync(dir, { recursive: true })
const outPath = join(dir, `autonomy-overnight-${opts.date}.md`)
writeFileSync(outPath, md, 'utf-8')
console.log(outPath)
