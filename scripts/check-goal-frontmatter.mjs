#!/usr/bin/env node
// scripts/check-goal-frontmatter.mjs — goal 카드 frontmatter 스키마 게이트 (governance T4).
// 필수(type:goal·숫자 id·title·status enum)는 FAIL, 권장(priority·created·DONE의 completed)과
// version 형식은 경고 리포트만 — 기존 42+개 일괄 마이그레이션 금지(spec)라 신규/수정분만
// 자연 강제되는 구조(필수는 전 카드가 이미 충족함을 실측 후 하드화).
// version 은 v1.1(2파트)·v2.4.1(3파트) 혼용이 현실 → 둘 다 허용, 그 외만 경고.
// 사용: node scripts/check-goal-frontmatter.mjs [goalsDir=goals]
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const STATUSES = new Set(['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'BLOCKED'])
const VERSION_RE = /^v?\d+\.\d+(\.\d+)?$/

/** flat frontmatter 객체 → {errors, warnings}. type!=='goal' 은 호출 전에 걸러진다. */
export function validateGoalFrontmatter(fm) {
  const errors = []
  const warnings = []
  if (!fm.id || !Number.isFinite(Number(fm.id))) errors.push('id: 숫자 필수')
  if (!fm.title) errors.push('title: 필수')
  if (!fm.status) errors.push('status: 필수')
  else if (!STATUSES.has(fm.status)) errors.push(`status: 비표준 값 '${fm.status}' (허용: ${[...STATUSES].join('/')})`)
  if (!fm.priority) warnings.push('priority 권장')
  if (!fm.created) warnings.push('created 권장')
  if (fm.status === 'DONE' && !fm.completed) warnings.push('DONE 인데 completed 없음')
  if (fm.version && !VERSION_RE.test(fm.version)) warnings.push(`version 형식 '${fm.version}' (v메이저.마이너[.패치] 권장)`)
  return { errors, warnings }
}

function parseFlat(md) {
  const text = md.charCodeAt(0) === 0xfeff ? md.slice(1) : md
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) return null
  const out = {}
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.trim()
    const idx = line.indexOf(':')
    if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return out
}

function main() {
  const goalsDir = process.argv[2] || 'goals'
  let entries
  try {
    entries = readdirSync(goalsDir)
  } catch {
    console.log('[check-goal-frontmatter] goals/ 없음 — 비적용 통과')
    process.exit(0)
  }

  const failed = []
  const warned = []
  let count = 0
  for (const name of entries) {
    if (!name.endsWith('.md') || name === 'README.md') continue
    let fm
    try {
      fm = parseFlat(readFileSync(join(goalsDir, name), 'utf-8'))
    } catch {
      continue
    }
    if (!fm || fm.type !== 'goal') continue
    count++
    const { errors, warnings } = validateGoalFrontmatter(fm)
    if (errors.length) failed.push({ name, errors })
    if (warnings.length) warned.push({ name, warnings })
  }

  if (warned.length) {
    console.log(`[check-goal-frontmatter] 권장 누락 ${warned.length}건 (경고 — 신규/수정 시 채울 것):`)
    for (const w of warned) console.log(`  - ${w.name}: ${w.warnings.join(' · ')}`)
  }
  if (failed.length) {
    console.log(`[check-goal-frontmatter FAIL] 필수 위반 ${failed.length}건:`)
    for (const f of failed) console.log(`  - ${f.name}: ${f.errors.join(' · ')}`)
    process.exit(1)
  }
  console.log(`[check-goal-frontmatter PASS] goal ${count}건 필수 스키마 충족 (경고 ${warned.length}건)`)
  process.exit(0)
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
if (isMain) main()
