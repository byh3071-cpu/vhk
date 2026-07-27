import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// Goal 60: 게이트사이드 검출 로직은 빌드프리(.mjs)라 _lib.mjs 가 단일 소스.
// tsconfig include=src/** 라 tsc --noEmit(M.1)는 tests/ 미검사 → .mjs 직접 import 가 게이트를 깨지 않음.
// @ts-expect-error — _lib.mjs 는 순수 JS(타입 선언 없음). vitest(esbuild)는 transpile-only 라 런타임 OK.
import { isStubGate, parseGoalMeta, findCompletedStubGates } from '../scripts/_lib.mjs'
import { repoGoalsPresent, REPO_GOALS_SKIP_NOTE } from '../src/lib/test-support/repo-goals.js'

// `vhk goal sync` 가 백필하는 실제 스캐폴드의 핵심(generateGateScript, src/commands/goal.ts:444).
// 마커 `고유 검증 (직접 추가)` + 주석 예시 + 닫는 블록만 = 고유 검증 0.
function scaffold(id: number): string {
  return [
    '#!/usr/bin/env node',
    "const must = (cond, label) => { console.log((cond ? '  ✓ ' : '  ✗ ') + label); if (!cond) pass = false }",
    'let pass = true',
    '',
    `// ─── goal ${id} 고유 검증 (직접 추가) ───────────────────────────────`,
    "// const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null",
    "// must(read('src/foo.ts')?.includes('bar'), 'foo.ts 에 bar 존재')",
    '',
    `if (pass) { console.log('✅ goal ${id} gate passes'); process.exit(0) }`,
    `console.log('❌ goal ${id} gate failed'); process.exit(1)`,
    '',
  ].join('\n')
}
// 구현하면서 손으로 채운 고유 검증(마커 아래 비주석 must() 호출).
function filled(id: number): string {
  return scaffold(id).replace(
    "// must(read('src/foo.ts')?.includes('bar'), 'foo.ts 에 bar 존재')",
    "const read = (p) => existsSync(p) ? readFileSync(p, 'utf-8') : null\nmust(read('src/x.ts')?.includes('y'), 'x')"
  )
}
// 구버전 진짜 게이트(goal 0/1/2 처럼 마커 없이 수동 if 체크 — 스텁 아님).
const OLD_REAL = `#!/usr/bin/env node
import { safeExec } from './_lib.mjs'
let pass = true
if (!safeExec('node', ['x']).ok) pass = false
if (pass) process.exit(0)
process.exit(1)
`

describe('isStubGate', () => {
  it('스캐폴드(마커 + 주석 예시만) → true', () => {
    expect(isStubGate(scaffold(34))).toBe(true)
  })
  it('마커 아래 비주석 must() 채워짐 → false', () => {
    expect(isStubGate(filled(34))).toBe(false)
  })
  it('마커 없는 구버전 진짜 게이트(0/1/2식) → false', () => {
    expect(isStubGate(OLD_REAL)).toBe(false)
  })
  it('주석 처리된 must() 만 있으면 → true(여전히 스텁)', () => {
    expect(isStubGate(scaffold(50) + "\n// must(read('z'), 'z')\n")).toBe(true)
  })
})

describe('parseGoalMeta', () => {
  const card = (id: number, status: string): string =>
    `---\nvhk_format: 1\ntype: goal\nid: ${id}\ntitle: G${id}\nstatus: ${status}\npriority: P1\n---\n\n# Goal ${id}\n`
  it('id·status 추출', () => {
    expect(parseGoalMeta(card(34, 'DONE'))).toEqual({ id: 34, status: 'DONE' })
  })
  it('id 없으면(_meta.md) → null', () => {
    expect(parseGoalMeta('---\ntype: meta\nproject: vhk\n---\n')).toBe(null)
  })
  it('BOM 접두 처리', () => {
    expect(parseGoalMeta('﻿' + card(7, 'NOT_STARTED'))).toEqual({ id: 7, status: 'NOT_STARTED' })
  })
  it('CRLF 처리', () => {
    expect(parseGoalMeta(card(9, 'IN_PROGRESS').replace(/\n/g, '\r\n'))).toEqual({ id: 9, status: 'IN_PROGRESS' })
  })
})

describe('findCompletedStubGates', () => {
  function setup(
    goals: Record<string, string>,
    scripts: Record<string, string>
  ): { root: string; gdir: string; sdir: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-metagate-'))
    const gdir = path.join(root, 'goals')
    const sdir = path.join(root, 'scripts')
    fs.mkdirSync(gdir)
    fs.mkdirSync(sdir)
    for (const [name, content] of Object.entries(goals)) fs.writeFileSync(path.join(gdir, name), content)
    for (const [name, content] of Object.entries(scripts)) fs.writeFileSync(path.join(sdir, name), content)
    return { root, gdir, sdir }
  }
  const card = (id: number, status: string): string =>
    `---\nvhk_format: 1\ntype: goal\nid: ${id}\ntitle: G${id}\nstatus: ${status}\npriority: P1\n---\n\n# Goal ${id}\n`

  it('DONE + 스캐폴드 스텁 → 검출(헛통과 DONE)', () => {
    const { root, gdir, sdir } = setup({ '34-x.md': card(34, 'DONE') }, { 'check-goal-34.mjs': scaffold(34) })
    expect(findCompletedStubGates(gdir, sdir).map((x: { id: number }) => x.id)).toEqual([34])
    fs.rmSync(root, { recursive: true, force: true })
  })
  it('DONE + 게이트 미싱 → 검출', () => {
    const { root, gdir, sdir } = setup({ '40-x.md': card(40, 'DONE') }, {})
    expect(findCompletedStubGates(gdir, sdir).map((x: { id: number }) => x.id)).toEqual([40])
    fs.rmSync(root, { recursive: true, force: true })
  })
  it('IN_PROGRESS + 스텁 → 무시(mid-work 정상 — DONE-only 완화)', () => {
    // 완화(머지 발견): IN_PROGRESS 는 완료 주장이 아니라 진행 중 → 게이트 미완(스텁)이 정상.
    // 헛통과 위험은 DONE 주장에만 존재. main 의 in-flight goal(예: 50)이 이 신설 게이트에
    // retroactively 걸려 무관한 PR 머지를 막던 문제 해소.
    const { root, gdir, sdir } = setup({ '41-x.md': card(41, 'IN_PROGRESS') }, { 'check-goal-41.mjs': scaffold(41) })
    expect(findCompletedStubGates(gdir, sdir)).toEqual([])
    fs.rmSync(root, { recursive: true, force: true })
  })
  it('NOT_STARTED + 스텁 → 무시(미구현 정상)', () => {
    const { root, gdir, sdir } = setup({ '50-x.md': card(50, 'NOT_STARTED') }, { 'check-goal-50.mjs': scaffold(50) })
    expect(findCompletedStubGates(gdir, sdir)).toEqual([])
    fs.rmSync(root, { recursive: true, force: true })
  })
  it('NOT_STARTED + 미싱 → 무시(미래 goal)', () => {
    const { root, gdir, sdir } = setup({ '55-x.md': card(55, 'NOT_STARTED') }, {})
    expect(findCompletedStubGates(gdir, sdir)).toEqual([])
    fs.rmSync(root, { recursive: true, force: true })
  })
  it('BLOCKED + 스텁 → 무시(완료 주장 아님)', () => {
    const { root, gdir, sdir } = setup({ '60-x.md': card(60, 'BLOCKED') }, { 'check-goal-60.mjs': scaffold(60) })
    expect(findCompletedStubGates(gdir, sdir)).toEqual([])
    fs.rmSync(root, { recursive: true, force: true })
  })
  it('DONE + 채워진 게이트 → 무시(정상 완료)', () => {
    const { root, gdir, sdir } = setup({ '34-x.md': card(34, 'DONE') }, { 'check-goal-34.mjs': filled(34) })
    expect(findCompletedStubGates(gdir, sdir)).toEqual([])
    fs.rmSync(root, { recursive: true, force: true })
  })
  it('DONE + 마커없는 구버전 진짜 게이트(0/1/2) → 무시(오탐 0)', () => {
    const { root, gdir, sdir } = setup({ '0-x.md': card(0, 'DONE') }, { 'check-goal-0.mjs': OLD_REAL })
    expect(findCompletedStubGates(gdir, sdir)).toEqual([])
    fs.rmSync(root, { recursive: true, force: true })
  })
  it('_meta.md(id 없음) → 스킵', () => {
    const { root, gdir, sdir } = setup({ '_meta.md': '---\ntype: meta\n---\n' }, {})
    expect(findCompletedStubGates(gdir, sdir)).toEqual([])
    fs.rmSync(root, { recursive: true, force: true })
  })

  // 112-T7(b): goals/ 비추적 → CI 체크아웃에 없어 빈 배열끼리 비교하며 무조건 통과하던 가드.
  it.skipIf(!repoGoalsPresent())(
    `실제 repo goals/ ↔ scripts/ : 완료-스텁 0 (회귀 가드 — ${REPO_GOALS_SKIP_NOTE})`,
    () => {
      expect(findCompletedStubGates('goals', 'scripts')).toEqual([])
    },
  )
})
