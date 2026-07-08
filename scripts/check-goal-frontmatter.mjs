#!/usr/bin/env node
// scripts/check-goal-frontmatter.mjs — goal 카드 frontmatter 스키마 게이트 (governance T4).
// 필수(type:goal·숫자 id·status enum)는 FAIL, 권장(title·priority·created·DONE의 completed)과
// version 형식은 경고 리포트만 — 기존 42+개 일괄 마이그레이션 금지(spec)라 신규/수정분만
// 자연 강제되는 구조(필수는 전 카드가 이미 충족함을 실측 후 하드화).
// title 은 제품 스키마 SoT(goal.ts VHK-021 표 = 권장)와 일치시켜 경고로 — 게이트가 제품보다
// 엄격한 별도 스키마를 만들지 않는다(리뷰 발견).
// version 은 v1.1(2파트)·v2.4.1(3파트) 혼용이 현실 → 둘 다 허용, 그 외만 경고.
// 사용: node scripts/check-goal-frontmatter.mjs [goalsDir=goals]
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isMainModule, parseFlatFrontmatter, ensureNoHardStop } from './_lib.mjs'

const STATUSES = new Set(['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'CANCELED', 'DEFERRED', 'OBSERVING'])
const VERSION_RE = /^v?\d+\.\d+(\.\d+)?$/

/** flat frontmatter 객체 → {errors, warnings}. type!=='goal' 은 호출 전에 걸러진다. */
export function validateGoalFrontmatter(fm) {
  const errors = []
  const warnings = []
  if (!fm.id || !Number.isFinite(Number(fm.id))) errors.push('id: 숫자 필수')
  if (!fm.status) errors.push('status: 필수')
  else if (!STATUSES.has(fm.status)) errors.push(`status: 비표준 값 '${fm.status}' (허용: ${[...STATUSES].join('/')})`)
  if (!fm.title) warnings.push('title 권장(제품 스키마와 동일)')
  if (!fm.priority) warnings.push('priority 권장')
  if (!fm.created) warnings.push('created 권장')
  if (fm.status === 'DONE' && !fm.completed) warnings.push('DONE 인데 completed 없음')
  if (fm.version && !VERSION_RE.test(fm.version)) warnings.push(`version 형식 '${fm.version}' (v메이저.마이너[.패치] 권장)`)
  return { errors, warnings }
}

function main() {
  ensureNoHardStop('goal-frontmatter')
  const goalsDir = process.argv[2] || 'goals'
  let entries
  try {
    entries = readdirSync(goalsDir)
  } catch (err) {
    console.log(`[check-goal-frontmatter] ${goalsDir} 읽기 불가(${err?.code ?? err}) — 비적용 통과`)
    process.exit(0)
  }

  const failed = []
  const warned = []
  let count = 0
  for (const name of entries) {
    if (!name.endsWith('.md') || name === 'README.md') continue
    let fm
    try {
      fm = parseFlatFrontmatter(readFileSync(join(goalsDir, name), 'utf-8'))
    } catch (err) {
      // 읽기 불가 파일은 스키마 판정 불가 — 경고 후 스킵(차단은 과안정화).
      console.log(`  (스킵) ${name}: 읽기 실패 — ${err?.code ?? err}`)
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

if (isMainModule(import.meta.url)) main()
