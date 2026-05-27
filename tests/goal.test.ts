import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function tmpProject(label: string): string {
  const dir = join(
    tmpdir(),
    `vhk-goal-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

function makeGoalFile(dir: string, id: number, status: string): void {
  mkdirSync(join(dir, 'goals'), { recursive: true })
  writeFileSync(
    join(dir, 'goals', `${id}-test.md`),
    `---\nvhk_format: 1\ntype: goal\nid: ${id}\ntitle: Goal ${id}\nstatus: ${status}\npriority: P0\nversion: v0.${id}\n---\nbody\n`,
    'utf-8'
  )
}

describe('selectActiveId', () => {
  it('IN_PROGRESS 우선', async () => {
    const { selectActiveId } = await import('../src/commands/goal.js')
    const goals = [
      { filePath: 'a', frontmatter: { id: 0, status: 'DONE' as const }, body: '' },
      { filePath: 'b', frontmatter: { id: 1, status: 'IN_PROGRESS' as const }, body: '' },
      { filePath: 'c', frontmatter: { id: 2, status: 'NOT_STARTED' as const }, body: '' },
    ]
    expect(selectActiveId(goals)).toBe(1)
  })

  it('IN_PROGRESS 없으면 첫 NOT_STARTED', async () => {
    const { selectActiveId } = await import('../src/commands/goal.js')
    const goals = [
      { filePath: 'a', frontmatter: { id: 0, status: 'DONE' as const }, body: '' },
      { filePath: 'b', frontmatter: { id: 1, status: 'NOT_STARTED' as const }, body: '' },
      { filePath: 'c', frontmatter: { id: 2, status: 'NOT_STARTED' as const }, body: '' },
    ]
    expect(selectActiveId(goals)).toBe(1)
  })

  it('전부 DONE 이면 null', async () => {
    const { selectActiveId } = await import('../src/commands/goal.js')
    const goals = [
      { filePath: 'a', frontmatter: { id: 0, status: 'DONE' as const }, body: '' },
      { filePath: 'b', frontmatter: { id: 1, status: 'DONE' as const }, body: '' },
    ]
    expect(selectActiveId(goals)).toBeNull()
  })

  it('BLOCKED 는 자동 선택 안 함', async () => {
    const { selectActiveId } = await import('../src/commands/goal.js')
    const goals = [
      { filePath: 'a', frontmatter: { id: 0, status: 'DONE' as const }, body: '' },
      { filePath: 'b', frontmatter: { id: 1, status: 'BLOCKED' as const }, body: '' },
    ]
    expect(selectActiveId(goals)).toBeNull()
  })
})

describe('goalList', () => {
  let origCwd: string
  beforeEach(() => {
    origCwd = process.cwd()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    vi.restoreAllMocks()
  })

  it('id 순으로 표시', async () => {
    const dir = tmpProject('list')
    makeGoalFile(dir, 2, 'NOT_STARTED')
    makeGoalFile(dir, 0, 'DONE')
    makeGoalFile(dir, 1, 'IN_PROGRESS')
    process.chdir(dir)
    try {
      const { goalList } = await import('../src/commands/goal.js')
      const logSpy = vi.spyOn(console, 'log')
      await goalList()
      const joined = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
      const idxFor = (s: string) => joined.indexOf(s)
      expect(idxFor('Goal 0')).toBeGreaterThan(-1)
      expect(idxFor('Goal 0')).toBeLessThan(idxFor('Goal 1'))
      expect(idxFor('Goal 1')).toBeLessThan(idxFor('Goal 2'))
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('goals 디렉토리 없으면 안내', async () => {
    const dir = tmpProject('list-empty')
    process.chdir(dir)
    try {
      const { goalList } = await import('../src/commands/goal.js')
      const logSpy = vi.spyOn(console, 'log')
      await goalList()
      const joined = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(joined).toMatch(/없습|init/)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('goalNext', () => {
  let origCwd: string
  beforeEach(() => {
    origCwd = process.cwd()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    vi.restoreAllMocks()
  })

  it('next-task.md 에 active goal 기록', async () => {
    const dir = tmpProject('next')
    makeGoalFile(dir, 0, 'DONE')
    makeGoalFile(dir, 1, 'NOT_STARTED')
    process.chdir(dir)
    try {
      const { goalNext } = await import('../src/commands/goal.js')
      await goalNext()
      const text = readFileSync(join(dir, 'docs/state/next-task.md'), 'utf-8')
      expect(text).toContain('Goal 1')
      expect(text).toContain('Goal 1 — Goal 1')
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('모든 goal DONE 이면 next-task.md 갱신 안 함', async () => {
    const dir = tmpProject('next-done')
    makeGoalFile(dir, 0, 'DONE')
    process.chdir(dir)
    try {
      const { goalNext } = await import('../src/commands/goal.js')
      await goalNext()
      expect(existsSync(join(dir, 'docs/state/next-task.md'))).toBe(false)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('goalInit', () => {
  let origCwd: string
  beforeEach(() => {
    origCwd = process.cwd()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    vi.restoreAllMocks()
  })

  it('빈 디렉토리에 4 파일 생성', async () => {
    const dir = tmpProject('init')
    process.chdir(dir)
    try {
      const { goalInit } = await import('../src/commands/goal.js')
      await goalInit()
      expect(existsSync(join(dir, 'goals/_meta.md'))).toBe(true)
      expect(existsSync(join(dir, 'docs/state/next-task.md'))).toBe(true)
      expect(existsSync(join(dir, 'docs/state/blockers.md'))).toBe(true)
      expect(existsSync(join(dir, 'docs/state/learnings.md'))).toBe(true)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('기존 파일은 덮어쓰지 않음 (skip)', async () => {
    const dir = tmpProject('init-skip')
    mkdirSync(join(dir, 'goals'), { recursive: true })
    writeFileSync(join(dir, 'goals/_meta.md'), 'EXISTING CONTENT', 'utf-8')
    process.chdir(dir)
    try {
      const { goalInit } = await import('../src/commands/goal.js')
      await goalInit()
      expect(readFileSync(join(dir, 'goals/_meta.md'), 'utf-8')).toBe(
        'EXISTING CONTENT'
      )
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('goalDone — Forbidden: 게이트 실패 시 frontmatter 변경 금지', () => {
  let origCwd: string
  let origExitCode: number | string | undefined
  beforeEach(() => {
    origCwd = process.cwd()
    origExitCode = process.exitCode
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    process.exitCode = origExitCode
    vi.restoreAllMocks()
  })

  it('게이트 스크립트 없으면 거부 + frontmatter 보존', async () => {
    const dir = tmpProject('done-no-script')
    makeGoalFile(dir, 7, 'NOT_STARTED')
    const before = readFileSync(join(dir, 'goals/7-test.md'), 'utf-8')
    process.chdir(dir)
    try {
      const { goalDone } = await import('../src/commands/goal.js')
      await goalDone({ id: '7' })
      const after = readFileSync(join(dir, 'goals/7-test.md'), 'utf-8')
      expect(after).toBe(before)
      expect(after).toContain('status: NOT_STARTED')
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('게이트 실패 (exit 1) 시 frontmatter 보존', async () => {
    const dir = tmpProject('done-fail')
    makeGoalFile(dir, 3, 'NOT_STARTED')
    mkdirSync(join(dir, 'scripts'), { recursive: true })
    writeFileSync(
      join(dir, 'scripts/check-goal-3.sh'),
      '#!/usr/bin/env bash\necho "gate failed"\nexit 1\n',
      'utf-8'
    )
    const before = readFileSync(join(dir, 'goals/3-test.md'), 'utf-8')
    process.chdir(dir)
    try {
      const { goalDone } = await import('../src/commands/goal.js')
      await goalDone({ id: '3' })
      const after = readFileSync(join(dir, 'goals/3-test.md'), 'utf-8')
      expect(after).toBe(before)
      expect(after).toContain('status: NOT_STARTED')
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('게이트 통과 시 status DONE + completed 날짜 기록', async () => {
    const dir = tmpProject('done-pass')
    makeGoalFile(dir, 5, 'IN_PROGRESS')
    mkdirSync(join(dir, 'scripts'), { recursive: true })
    writeFileSync(
      join(dir, 'scripts/check-goal-5.sh'),
      '#!/usr/bin/env bash\necho "all good"\nexit 0\n',
      'utf-8'
    )
    process.chdir(dir)
    try {
      const { goalDone } = await import('../src/commands/goal.js')
      await goalDone({ id: '5' })
      const after = readFileSync(join(dir, 'goals/5-test.md'), 'utf-8')
      expect(after).toContain('status: DONE')
      expect(after).not.toContain('status: IN_PROGRESS')
      expect(after).toMatch(/completed: \d{4}-\d{2}-\d{2}/)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
