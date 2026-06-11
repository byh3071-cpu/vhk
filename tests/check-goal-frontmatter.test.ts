import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// tsc 는 tests/ 미검사 → .mjs 직접 import 안전(meta-gate.test.ts 선례).
import { validateGoalFrontmatter } from '../scripts/check-goal-frontmatter.mjs'

const SCRIPT = path.join(process.cwd(), 'scripts', 'check-goal-frontmatter.mjs')

describe('validateGoalFrontmatter', () => {
  it('필수 충족 + 권장 충족 → 에러/경고 0', () => {
    const r = validateGoalFrontmatter({
      type: 'goal', id: '43', title: 'x', status: 'DONE',
      priority: 'P1', created: '2026-06-07', completed: '2026-06-08',
    })
    expect(r.errors).toEqual([])
    expect(r.warnings).toEqual([])
  })

  it('필수 누락(id·status) → errors, title 은 경고(제품 스키마 SoT=권장과 일치)', () => {
    const r = validateGoalFrontmatter({ type: 'goal' })
    expect(r.errors).toHaveLength(2)
    expect(r.warnings.some((w: string) => w.includes('title'))).toBe(true)
  })

  it('status 비표준 값 → error', () => {
    const r = validateGoalFrontmatter({ type: 'goal', id: '1', title: 'x', status: 'SHIPPED' })
    expect(r.errors.some((e: string) => e.includes('status'))).toBe(true)
  })

  it('권장 누락 → warnings (created / DONE의 completed)', () => {
    const r = validateGoalFrontmatter({ type: 'goal', id: '1', title: 'x', status: 'DONE', priority: 'P1' })
    expect(r.errors).toEqual([])
    expect(r.warnings.some((w: string) => w.includes('created'))).toBe(true)
    expect(r.warnings.some((w: string) => w.includes('completed'))).toBe(true)
  })

  it('version 은 v1.1·v2.4.1 둘 다 허용(혼용 현실), 그 외 형식만 경고', () => {
    const base = { type: 'goal', id: '1', title: 'x', status: 'DONE', priority: 'P1', created: 'd', completed: 'd' }
    expect(validateGoalFrontmatter({ ...base, version: 'v1.1' }).warnings).toEqual([])
    expect(validateGoalFrontmatter({ ...base, version: 'v2.4.1' }).warnings).toEqual([])
    expect(validateGoalFrontmatter({ ...base, version: '2.4.1' }).warnings).toEqual([])
    expect(validateGoalFrontmatter({ ...base, version: 'latest' }).warnings).toHaveLength(1)
  })
})

function fixture(files: Record<string, string>): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-goalfm-'))
  const gdir = path.join(d, 'goals')
  fs.mkdirSync(gdir)
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(gdir, name), content)
  return d
}

function run(dir: string): number {
  try {
    execFileSync('node', [SCRIPT], { cwd: dir, encoding: 'utf-8', stdio: 'pipe' })
    return 0
  } catch (e) {
    return (e as { status?: number }).status ?? -1
  }
}

describe('check-goal-frontmatter e2e', () => {
  it('필수 필드 뺀 가짜 goal → FAIL(exit 1)', () => {
    const d = fixture({ '1-bad.md': '---\ntype: goal\nid: 1\n---\n# 본문' })
    expect(run(d)).toBe(1)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('권장 누락만 → 경고 리포트, exit 0 (일괄 마이그레이션 강제 안 함)', () => {
    const d = fixture({ '1-ok.md': '---\ntype: goal\nid: 1\ntitle: x\nstatus: DONE\npriority: P0\n---\n' })
    expect(run(d)).toBe(0)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('실물 레포 goals/ 62건 — 필수 전부 충족(회귀)', () => {
    execFileSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf-8', stdio: 'pipe' })
  })
})
