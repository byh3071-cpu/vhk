import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Goal 34: goal 명령군(next/done/init) HARD_STOP 가드 회귀 테스트.
// HARD_STOP 활성 시 상태파일을 변경하면 안 된다(모든 자동화 중단 신호).

function tmpProject(label: string): string {
  const dir = join(tmpdir(), `vhk-goalhs-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function makeGoalFile(dir: string, id: number, status: string): void {
  mkdirSync(join(dir, 'goals'), { recursive: true })
  writeFileSync(
    join(dir, 'goals', `${id}-test.md`),
    `---\nvhk_format: 1\ntype: goal\nid: ${id}\ntitle: Goal ${id}\nstatus: ${status}\npriority: P0\n---\nbody\n`,
    'utf-8'
  )
}

function writeHardStop(dir: string): void {
  mkdirSync(join(dir, '.vhk'), { recursive: true })
  writeFileSync(join(dir, '.vhk', 'HARD_STOP'), '2026-06-07T00:00:00Z\nauto: test\n', 'utf-8')
}

describe('goal 명령군 HARD_STOP 가드 (Goal 34)', () => {
  let origCwd: string
  beforeEach(() => {
    origCwd = process.cwd()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    process.exitCode = 0 // ensureNotHardStopped 가 설정한 exitCode 리셋(다른 테스트 오염 방지)
    vi.restoreAllMocks()
  })

  it('HARD_STOP 활성 → goalNext 가 next-task.md 를 쓰지 않는다', async () => {
    const dir = tmpProject('next-blocked')
    makeGoalFile(dir, 0, 'NOT_STARTED')
    // 상태 디렉터리를 미리 둔다 — 없으면 112-T2 의 "미도입 프로젝트" 경로로 빠져
    // HARD_STOP 이 아니라 그 이유로 안 쓰게 되어 가드를 검증하지 못한다.
    mkdirSync(join(dir, 'docs', 'state'), { recursive: true })
    writeHardStop(dir)
    process.chdir(dir)
    try {
      const { goalNext } = await import('../src/commands/goal.js')
      await goalNext()
      expect(existsSync(join(dir, 'docs', 'state', 'next-task.md'))).toBe(false)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('HARD_STOP 없으면 goalNext 정상 동작(next-task.md 생성) — 회귀 0', async () => {
    const dir = tmpProject('next-ok')
    makeGoalFile(dir, 0, 'NOT_STARTED')
    mkdirSync(join(dir, 'docs', 'state'), { recursive: true }) // 112-T2: next 는 없는 상태 디렉터리를 만들지 않는다
    process.chdir(dir)
    try {
      const { goalNext } = await import('../src/commands/goal.js')
      await goalNext()
      expect(existsSync(join(dir, 'docs', 'state', 'next-task.md'))).toBe(true)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('HARD_STOP 활성 → goalInit 가 scaffold(goals/_meta.md)를 만들지 않는다', async () => {
    const dir = tmpProject('init-blocked')
    writeHardStop(dir)
    process.chdir(dir)
    try {
      const { goalInit } = await import('../src/commands/goal.js')
      await goalInit()
      expect(existsSync(join(dir, 'goals', '_meta.md'))).toBe(false)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('HARD_STOP 활성 → goalSync 가 게이트 스크립트를 만들지 않는다 (#334)', async () => {
    const dir = tmpProject('sync-blocked')
    makeGoalFile(dir, 0, 'NOT_STARTED')
    writeHardStop(dir)
    process.chdir(dir)
    try {
      const { goalSync } = await import('../src/commands/goal.js')
      const res = await goalSync()
      expect(res).toEqual({ created: [], skipped: [] })
      expect(existsSync(join(dir, 'scripts', 'check-goal-0.mjs'))).toBe(false)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
