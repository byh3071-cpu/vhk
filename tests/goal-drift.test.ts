import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { hasCustomGateAssertions, findStatusDriftCandidates } from '../src/lib/goal-drift.js'

// `vhk goal sync` 가 생성하는 스캐폴드 게이트의 핵심(must 정의 + 주석 예시만 — 고유 검증 0).
const SCAFFOLD = `#!/usr/bin/env node
const must = (cond, label) => { console.log((cond ? '  ✓ ' : '  ✗ ') + label); if (!cond) pass = false }
// const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null
// must(read('src/foo.ts')?.includes('bar'), 'foo.ts 에 bar 존재')
`
// 구현하면서 손으로 추가한 goal 고유 검증 호출.
const CUSTOM = SCAFFOLD + "must(existsSync('src/commands/pattern.ts'), 'pattern.ts 존재')\n"

describe('hasCustomGateAssertions', () => {
  it('스캐폴드(정의 + 주석 예시만) → false', () => {
    expect(hasCustomGateAssertions(SCAFFOLD)).toBe(false)
  })
  it('goal 고유 must() 호출 있으면 → true', () => {
    expect(hasCustomGateAssertions(CUSTOM)).toBe(true)
  })
  it('주석 처리된 must() 호출은 무시 → false', () => {
    expect(hasCustomGateAssertions(SCAFFOLD + "// must(read('x'), 'x')\n")).toBe(false)
  })
})

describe('findStatusDriftCandidates', () => {
  function setup(
    goals: Record<string, string>,
    scripts: Record<string, string>
  ): { root: string; gdir: string; sdir: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-drift-'))
    const gdir = path.join(root, 'goals')
    const sdir = path.join(root, 'scripts')
    fs.mkdirSync(gdir)
    fs.mkdirSync(sdir)
    for (const [name, content] of Object.entries(goals)) fs.writeFileSync(path.join(gdir, name), content)
    for (const [name, content] of Object.entries(scripts)) fs.writeFileSync(path.join(sdir, name), content)
    return { root, gdir, sdir }
  }
  const goalCard = (id: number, status: string): string =>
    `---\nvhk_format: 1\ntype: goal\nid: ${id}\ntitle: G${id}\nstatus: ${status}\npriority: P1\n---\n\n# Goal ${id}\n`

  it('NOT_STARTED + custom 게이트 → 드리프트로 잡음', () => {
    const { root, gdir, sdir } = setup({ '5-x.md': goalCard(5, 'NOT_STARTED') }, { 'check-goal-5.mjs': CUSTOM })
    expect(findStatusDriftCandidates(gdir, sdir).map((x) => x.id)).toEqual([5])
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('NOT_STARTED + 스캐폴드 게이트 → 통과(오탐 0)', () => {
    const { root, gdir, sdir } = setup({ '6-y.md': goalCard(6, 'NOT_STARTED') }, { 'check-goal-6.mjs': SCAFFOLD })
    expect(findStatusDriftCandidates(gdir, sdir)).toEqual([])
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('DONE + custom 게이트 → 통과(정상 완료)', () => {
    const { root, gdir, sdir } = setup({ '7-z.md': goalCard(7, 'DONE') }, { 'check-goal-7.mjs': CUSTOM })
    expect(findStatusDriftCandidates(gdir, sdir)).toEqual([])
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('NOT_STARTED + 게이트 스크립트 없음 → 통과(아직 sync 안 한 goal)', () => {
    const { root, gdir, sdir } = setup({ '8-w.md': goalCard(8, 'NOT_STARTED') }, {})
    expect(findStatusDriftCandidates(gdir, sdir)).toEqual([])
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('실제 repo goals/ ↔ scripts/ 드리프트 0 (회귀 가드)', () => {
    expect(findStatusDriftCandidates('goals', 'scripts')).toEqual([])
  })
})
