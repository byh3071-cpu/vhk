import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { removeDirSync } from '../src/lib/fs-remove.js'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// safeExecFile 을 mock — Windows 에서 실제 bash 서브프로세스 spawn 시 후속 rmSync 가
// 파일 핸들 race 로 EPERM 떨어지는 문제 회피. goalDone 의 게이트 결과는 mock 으로 제어.
const mockSafeExecFile = vi.fn()
vi.mock('../src/lib/exec.js', () => ({
  safeExecFile: (...a: unknown[]) => mockSafeExecFile(...a),
}))

function tmpProject(label: string): string {
  const dir = join(
    tmpdir(),
    `vhk-goal-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

function makeGoalFile(dir: string, id: number, status: string, dependsOn?: string, body = 'body'): void {
  mkdirSync(join(dir, 'goals'), { recursive: true })
  writeFileSync(
    join(dir, 'goals', `${id}-test.md`),
    `---\nvhk_format: 1\ntype: goal\nid: ${id}\ntitle: Goal ${id}\nstatus: ${status}\npriority: P0\nversion: v0.${id}\n${dependsOn === undefined ? '' : `depends_on: ${dependsOn}\n`}---\n${body}\n`,
    'utf-8'
  )
}

// 112-T2: goal next 는 없는 docs/state/ 를 새로 만들지 않는다.
// 쓰기 경로를 검증하려면 프로젝트가 상태 문서를 이미 도입한 상태여야 한다.
function adoptStateDir(dir: string): void {
  mkdirSync(join(dir, 'docs', 'state'), { recursive: true })
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

  it('입력 배열 순서와 무관하게 가장 작은 IN_PROGRESS id를 선택한다', async () => {
    const { selectActiveId } = await import('../src/commands/goal.js')
    const goals = [
      { filePath: 'c', frontmatter: { id: 9, status: 'IN_PROGRESS' as const }, body: '' },
      { filePath: 'a', frontmatter: { id: 1, status: 'NOT_STARTED' as const }, body: '' },
      { filePath: 'b', frontmatter: { id: 3, status: 'IN_PROGRESS' as const }, body: '' },
    ]
    expect(selectActiveId(goals)).toBe(3)
  })

  it('IN_PROGRESS가 없으면 가장 작은 legacy/NOT_STARTED id를 선택한다', async () => {
    const { selectActiveId } = await import('../src/commands/goal.js')
    const goals = [
      { filePath: 'c', frontmatter: { id: 9, status: 'NOT_STARTED' as const }, body: '' },
      { filePath: 'a', frontmatter: { id: 1 }, body: '' },
      { filePath: 'b', frontmatter: { id: 3, status: 'NOT_STARTED' as const }, body: '' },
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

  it('미완료 depends_on이 있는 낮은 ID를 건너뛰고 실행 가능한 Goal을 고른다', async () => {
    const { selectActiveId } = await import('../src/commands/goal.js')
    const goals = [
      { filePath: 'a', frontmatter: { id: 1, status: 'NOT_STARTED' as const, depends_on: '3' }, body: '' },
      { filePath: 'b', frontmatter: { id: 2, status: 'NOT_STARTED' as const }, body: '' },
      { filePath: 'c', frontmatter: { id: 3, status: 'DEFERRED' as const }, body: '' },
    ]
    expect(selectActiveId(goals)).toBe(2)
  })

  it('선행 작업을 위반한 IN_PROGRESS가 있으면 다른 Goal을 선택하지 않는다', async () => {
    const { selectActiveId } = await import('../src/commands/goal.js')
    const goals = [
      { filePath: 'a', frontmatter: { id: 1, status: 'NOT_STARTED' as const }, body: '' },
      { filePath: 'b', frontmatter: { id: 2, status: 'IN_PROGRESS' as const, depends_on: '1' }, body: '' },
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

  it('미완료 선행 작업을 쉬운 문구로 표시한다', async () => {
    const dir = tmpProject('list-dependency-waiting')
    makeGoalFile(dir, 1, 'NOT_STARTED')
    makeGoalFile(dir, 2, 'NOT_STARTED', '1')
    process.chdir(dir)
    try {
      const { goalList } = await import('../src/commands/goal.js')
      const logSpy = vi.spyOn(console, 'log')
      await goalList()
      const joined = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(joined).toContain('선행 작업 대기: 1')
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

  it('스키마가 깨진 goal 파일만 있어도 skipped 경고를 출력', async () => {
    const dir = tmpProject('list-skipped-only')
    mkdirSync(join(dir, 'goals'), { recursive: true })
    writeFileSync(
      join(dir, 'goals', 'bad-goal.md'),
      `---\ntype: goal\nid: G1\ntitle: Bad\nstatus: NOT_STARTED\n---\nbody\n`,
      'utf-8'
    )
    process.chdir(dir)
    try {
      const { goalList } = await import('../src/commands/goal.js')
      const logSpy = vi.spyOn(console, 'log')
      await goalList()
      const joined = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(joined).toMatch(/무시된 파일/)
      expect(joined).toMatch(/bad-goal\.md/)
      expect(joined).toMatch(/id 가 숫자가 아님/)
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
    adoptStateDir(dir)
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
    adoptStateDir(dir)
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

  // #558: 전부 완료인데 기존 next-task.md 를 그대로 두면 마지막 완료 작업이 다음 작업처럼 남는다.
  // 다음 세션이나 다른 에이전트가 그 파일을 읽고 끝난 일을 다시 한다.
  it('모든 goal DONE 이면 기존 next-task.md 를 완료 상태로 갱신한다', async () => {
    const dir = tmpProject('next-done-stale')
    makeGoalFile(dir, 0, 'DONE')
    adoptStateDir(dir)
    const stale = join(dir, 'docs/state/next-task.md')
    writeFileSync(
      stale,
      '# Next Task\n\n_Auto-updated 2026-01-01T00:00:00.000Z via `vhk goal next`._\n\n```\nTASK: Goal 0 — Goal 0\n```\n',
      'utf-8'
    )
    process.chdir(dir)
    try {
      const { goalNext } = await import('../src/commands/goal.js')
      await goalNext()
      const text = readFileSync(stale, 'utf-8')
      expect(text).not.toContain('TASK: Goal 0')
      expect(text).toContain('모든 goal 이 완료')
    } finally {
      process.chdir(origCwd)
      removeDirSync(dir)
    }
  })

  // 활성 Goal 경로는 덮어쓰기 전에 백업하는데(Goal 78) 완료 경로만 빠지면,
  // 수동으로 손댄 next-task.md 가 복구 수단 없이 사라진다. 백업 계약은 두 경로에서 같아야 한다.
  it('모든 goal DONE 이어도 수동 편집본은 덮어쓰기 전에 백업한다', async () => {
    const dir = tmpProject('next-done-backup')
    makeGoalFile(dir, 0, 'DONE')
    adoptStateDir(dir)
    const manual = join(dir, 'docs/state/next-task.md')
    writeFileSync(manual, ['# Next Task', '', '손으로 적어둔 인수인계 메모', ''].join('\n'), 'utf-8')
    process.chdir(dir)
    try {
      const { goalNext } = await import('../src/commands/goal.js')
      await goalNext()
      expect(readFileSync(manual, 'utf-8')).toContain('모든 goal 이 완료')
      const backupRoot = join(dir, '.vhk/backups')
      expect(existsSync(backupRoot)).toBe(true)
      const saved = readdirSync(backupRoot)
        .map((id) => join(backupRoot, id, 'docs/state/next-task.md'))
        .filter((f) => existsSync(f))
      expect(saved.length).toBeGreaterThan(0)
      expect(readFileSync(saved[0], 'utf-8')).toContain('손으로 적어둔 인수인계 메모')
    } finally {
      process.chdir(origCwd)
      removeDirSync(dir)
    }
  })

  it('이미 완료 상태인 next-task는 다시 쓰거나 백업하지 않는다', async () => {
    const dir = tmpProject('next-done-idempotent')
    makeGoalFile(dir, 0, 'DONE')
    adoptStateDir(dir)
    const nextTask = join(dir, 'docs/state/next-task.md')
    const completed = [
      '# Next Task',
      '',
      '_Auto-updated 2026-01-01T00:00:00.000Z via `vhk goal next`._',
      '',
      '```',
      'TASK: 없음 — 모든 goal 이 완료되었습니다.',
      '```',
      '',
    ].join('\n')
    writeFileSync(nextTask, completed, 'utf-8')
    process.chdir(dir)
    try {
      const { goalNext } = await import('../src/commands/goal.js')
      await goalNext()
      expect(readFileSync(nextTask, 'utf-8')).toBe(completed)
      expect(existsSync(join(dir, '.vhk', 'backups'))).toBe(false)
    } finally {
      process.chdir(origCwd)
      removeDirSync(dir)
    }
  })

  it('DONE+BLOCKED만 남으면 모두 완료로 오보하거나 next-task를 덮어쓰지 않는다', async () => {
    const dir = tmpProject('next-blocked')
    makeGoalFile(dir, 0, 'DONE')
    makeGoalFile(dir, 1, 'BLOCKED')
    adoptStateDir(dir)
    const nextTask = join(dir, 'docs/state/next-task.md')
    const handoff = '# Next Task\n\nGoal 1 blocker를 먼저 해소\n'
    writeFileSync(nextTask, handoff, 'utf-8')
    process.chdir(dir)
    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((m?: unknown) => { logs.push(String(m)) })
    try {
      const { goalNext } = await import('../src/commands/goal.js')
      await goalNext()
      const out = logs.join('\n')
      expect(out).toMatch(/BLOCKED|차단/)
      expect(out).not.toMatch(/모든 goal 이 완료/)
      expect(readFileSync(nextTask, 'utf-8')).toBe(handoff)
      expect(existsSync(join(dir, '.vhk', 'backups'))).toBe(false)
    } finally {
      process.chdir(origCwd)
      removeDirSync(dir)
    }
  })

  it('완료 스냅샷 뒤 Goal이 BLOCKED로 돌아가면 거짓 완료 표시만 무효화한다', async () => {
    const dir = tmpProject('next-reopened-blocked')
    makeGoalFile(dir, 0, 'DONE')
    makeGoalFile(dir, 1, 'BLOCKED')
    adoptStateDir(dir)
    const nextTask = join(dir, 'docs/state/next-task.md')
    writeFileSync(
      nextTask,
      [
        '# Next Task',
        '',
        '_Auto-updated 2026-01-01T00:00:00.000Z via `vhk goal next`._',
        '',
        '```',
        'TASK: 없음 — 모든 goal 이 완료되었습니다.',
        '```',
        '',
      ].join('\n'),
      'utf-8',
    )
    process.chdir(dir)
    try {
      const { goalNext } = await import('../src/commands/goal.js')
      await goalNext()
      const text = readFileSync(nextTask, 'utf-8')
      expect(text).not.toContain('모든 goal 이 완료')
      expect(text).toContain('실행 가능한 goal 없음')
      expect(text).not.toContain('2026-01-01T00:00:00.000Z')
      expect(text).toMatch(/_Auto-updated \d{4}-\d{2}-\d{2}T[^\r\n]+ via `vhk goal next`\._/)
      expect(existsSync(join(dir, '.vhk', 'backups'))).toBe(false)
    } finally {
      process.chdir(origCwd)
      removeDirSync(dir)
    }
  })

  // 112-T2/T6: 공개 경계 정리로 docs/state/ 를 제거한 레포에서 next 가 디렉터리를 되살리면
  // 작업 상태의 원본이 로드맵과 next-task.md 둘로 갈린다.
  it('docs/state/ 가 없으면 디렉터리를 만들지 않는다 (원본 이원화 방지)', async () => {
    const dir = tmpProject('next-nostate')
    makeGoalFile(dir, 1, 'NOT_STARTED')
    process.chdir(dir)
    try {
      const { goalNext } = await import('../src/commands/goal.js')
      await goalNext()
      expect(existsSync(join(dir, 'docs', 'state'))).toBe(false)
      expect(existsSync(join(dir, 'docs', 'state', 'next-task.md'))).toBe(false)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('docs/state/ 가 없어도 active goal 은 안내한다 (조용한 무동작 금지)', async () => {
    const dir = tmpProject('next-nostate-out')
    makeGoalFile(dir, 1, 'NOT_STARTED')
    process.chdir(dir)
    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((m?: unknown) => { logs.push(String(m)) })
    try {
      const { goalNext } = await import('../src/commands/goal.js')
      await goalNext()
      const out = logs.join('\n')
      expect(out).toContain('Goal 1')
      expect(out).toContain('docs/state')
      expect(out).toContain('vhk goal init')
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('docs/state/ 가 이미 있으면 종전대로 갱신한다 (기본 경로 회귀 0)', async () => {
    const dir = tmpProject('next-withstate')
    makeGoalFile(dir, 3, 'IN_PROGRESS')
    adoptStateDir(dir)
    process.chdir(dir)
    try {
      const { goalNext } = await import('../src/commands/goal.js')
      await goalNext()
      const text = readFileSync(join(dir, 'docs/state/next-task.md'), 'utf-8')
      expect(text).toContain('Goal 3')
      expect(text).toContain('via `vhk goal next`')
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
      const meta = readFileSync(join(dir, 'goals/_meta.md'), 'utf-8')
      expect(meta).toContain('# 선택: depends_on: 1,2')
      expect(meta).not.toMatch(/^depends_on:\s*1$/m)
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
    mockSafeExecFile.mockReset()
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
    // 실제 bash 실행 없이 스크립트 파일만 존재 시키고 mock 으로 결과 강제.
    writeFileSync(join(dir, 'scripts/check-goal-3.sh'), '#!/usr/bin/env bash\nexit 1\n', 'utf-8')
    mockSafeExecFile.mockReturnValue({ ok: false, out: 'gate failed', err: 'exit 1' })
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

  it('선행 Goal이 DONE이 아니면 게이트를 실행하지 않고 완료 처리를 거부한다', async () => {
    const dir = tmpProject('done-dependency-waiting')
    makeGoalFile(dir, 1, 'NOT_STARTED')
    makeGoalFile(dir, 2, 'IN_PROGRESS', '1')
    mkdirSync(join(dir, 'scripts'), { recursive: true })
    writeFileSync(join(dir, 'scripts/check-goal-2.mjs'), 'process.exit(0)\n', 'utf-8')
    const before = readFileSync(join(dir, 'goals/2-test.md'), 'utf-8')
    process.chdir(dir)
    try {
      const { goalDone } = await import('../src/commands/goal.js')
      const logSpy = vi.spyOn(console, 'log')
      await goalDone({ id: '2' })
      const after = readFileSync(join(dir, 'goals/2-test.md'), 'utf-8')
      expect(after).toBe(before)
      expect(mockSafeExecFile).not.toHaveBeenCalled()
      expect(logSpy.mock.calls.map((c) => String(c[0])).join('\n')).toContain('먼저 끝내야 할 Goal: 1')
      expect(process.exitCode).toBe(1)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('게이트 통과 시 status DONE + completed 날짜 기록', async () => {
    const dir = tmpProject('done-pass')
    makeGoalFile(dir, 5, 'IN_PROGRESS')
    mkdirSync(join(dir, 'scripts'), { recursive: true })
    writeFileSync(join(dir, 'scripts/check-goal-5.sh'), '#!/usr/bin/env bash\nexit 0\n', 'utf-8')
    mockSafeExecFile.mockReturnValue({ ok: true, out: 'all good', err: '' })
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

  it('#612 미완 Task가 있어도 DONE 전이하고 advisory 경고만 낸다', async () => {
    const dir = tmpProject('done-pending-task')
    const body = ['### Phase 10', '- [x] **Task 100** 끝', '- [ ] **Task 110** 남음'].join('\n')
    makeGoalFile(dir, 5, 'IN_PROGRESS', undefined, body)
    mkdirSync(join(dir, 'scripts'), { recursive: true })
    writeFileSync(join(dir, 'scripts/check-goal-5.sh'), '#!/usr/bin/env bash\nexit 0\n', 'utf-8')
    mockSafeExecFile.mockReturnValue({ ok: true, out: 'all good', err: '' })
    process.chdir(dir)
    process.exitCode = 0
    try {
      const { goalDone } = await import('../src/commands/goal.js')
      const logSpy = vi.spyOn(console, 'log')
      await goalDone({ id: '5' })
      const after = readFileSync(join(dir, 'goals/5-test.md'), 'utf-8')
      expect(after).toContain('status: DONE')
      expect(process.exitCode === 1).toBe(false)
      const logs = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(logs).toMatch(/미완 Task 1개\(110\)/)
      expect(logs).toMatch(/그래도 DONE 처리했습니다/)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('goalCheck — DONE goal 게이트 스킵 (#155)', () => {
  let origCwd: string
  let origExitCode: number | string | undefined
  beforeEach(() => {
    origCwd = process.cwd()
    origExitCode = process.exitCode
    process.exitCode = 0
    mockSafeExecFile.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    process.exitCode = origExitCode
    vi.restoreAllMocks()
  })

  it('DONE goal 은 게이트 실행 없이 스킵 (exit 0)', async () => {
    const dir = tmpProject('check-done-skip')
    makeGoalFile(dir, 5, 'DONE')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    process.chdir(dir)
    try {
      const { goalCheck } = await import('../src/commands/goal.js')
      await goalCheck({ id: '5' })
      expect(process.exitCode).not.toBe(1)
      expect(mockSafeExecFile).not.toHaveBeenCalled() // 게이트 미실행
      const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(out).toContain('스킵')
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('--force 면 DONE goal 도 게이트 실행 (스크립트 없으면 실패 exit 1)', async () => {
    const dir = tmpProject('check-done-force')
    makeGoalFile(dir, 5, 'DONE')
    process.chdir(dir)
    try {
      const { goalCheck } = await import('../src/commands/goal.js')
      await goalCheck({ id: '5', force: true })
      // DONE 스킵 무시 → findGateScript 진입, 스크립트 없음 → exit 1
      expect(process.exitCode).toBe(1)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('게이트 스크립트 부재 시 vhk goal sync 복구 경로를 안내한다 (#523)', async () => {
    const dir = tmpProject('check-missing-gate')
    makeGoalFile(dir, 7, 'IN_PROGRESS')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    process.chdir(dir)
    try {
      const { goalCheck } = await import('../src/commands/goal.js')
      await goalCheck({ id: '7' })
      const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(out).toContain('게이트 스크립트 없음')
      expect(out).toContain('vhk goal sync')
      expect(process.exitCode).toBe(1)
      expect(existsSync(join(dir, 'scripts', 'check-goal-7.mjs'))).toBe(false)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('goalSync — 누락 게이트 스크립트 백필 (goal 7)', () => {
  let origCwd: string
  beforeEach(() => {
    origCwd = process.cwd()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    vi.restoreAllMocks()
  })

  it('스크립트 없는 goal 마다 check-goal-{id}.mjs 생성', async () => {
    const dir = tmpProject('sync')
    makeGoalFile(dir, 0, 'DONE')
    makeGoalFile(dir, 1, 'NOT_STARTED')
    process.chdir(dir)
    try {
      const { goalSync } = await import('../src/commands/goal.js')
      const res = await goalSync()
      expect(res.created.sort()).toEqual([0, 1])
      expect(res.skipped).toEqual([])
      const s0 = readFileSync(join(dir, 'scripts/check-goal-0.mjs'), 'utf-8')
      expect(s0.startsWith('#!/usr/bin/env node')).toBe(true)
      expect(s0).toContain('goal 0')
      expect(s0).toContain('VHK_GATES_SKIP_DEEP')
      expect(existsSync(join(dir, 'scripts/check-goal-1.mjs'))).toBe(true)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // CodeQL #1·#3·#7·#9 dismiss 후속 하드닝(src/lib/exec.ts·scripts/_lib.mjs 와 동일 근거) —
  // generateGateScript 가 만드는 run() 함수도 같은 cmd.exe 인용 탈출 위험 구조를 복제하므로
  // 신규 생성분부터는 같은 방어(위험 문자 있는 인자 거부)를 갖춰야 한다.
  it('생성된 check-goal-N.mjs 의 run() 이 cmd.exe shim 경로에 위험문자 인자 거부 가드를 포함', async () => {
    const dir = tmpProject('sync-hardening')
    makeGoalFile(dir, 0, 'NOT_STARTED')
    process.chdir(dir)
    try {
      const { goalSync } = await import('../src/commands/goal.js')
      await goalSync()
      const s0 = readFileSync(join(dir, 'scripts/check-goal-0.mjs'), 'utf-8')
      // 구체적 거부 문구로 검증 — "" 처럼 흔한 문자 하나만 보면 기존(비하드닝) 코드에도
      // 우연히 존재해 헛통과할 수 있어서, 하드닝 특유의 메시지 문자열로 좁힘.
      expect(s0).toContain('안전하지 않은 인자 거부')
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('기존 스크립트(.mjs/.sh)는 덮어쓰지 않음 (idempotent)', async () => {
    const dir = tmpProject('sync-idem')
    makeGoalFile(dir, 0, 'DONE')
    makeGoalFile(dir, 1, 'NOT_STARTED')
    makeGoalFile(dir, 2, 'NOT_STARTED')
    mkdirSync(join(dir, 'scripts'), { recursive: true })
    writeFileSync(join(dir, 'scripts/check-goal-0.mjs'), 'EXISTING', 'utf-8')
    writeFileSync(join(dir, 'scripts/check-goal-1.sh'), '#!/usr/bin/env bash\nexit 0\n', 'utf-8')
    process.chdir(dir)
    try {
      const { goalSync } = await import('../src/commands/goal.js')
      const res = await goalSync()
      // 0(.mjs 존재) → skip(절대 덮어쓰기 금지). 1(.sh 만) → .mjs 백필. 2 → 신규.
      expect(res.created.sort()).toEqual([1, 2])
      expect(res.skipped).toEqual([0])
      expect(readFileSync(join(dir, 'scripts/check-goal-0.mjs'), 'utf-8')).toBe('EXISTING')
      // .sh 만 있던 1 은 Windows 1급 위해 .mjs 백필됨.
      expect(existsSync(join(dir, 'scripts/check-goal-1.mjs'))).toBe(true)
      // 기존 .sh 는 그대로 보존.
      expect(existsSync(join(dir, 'scripts/check-goal-1.sh'))).toBe(true)
      expect(existsSync(join(dir, 'scripts/check-goal-2.mjs'))).toBe(true)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('goals 없으면 created 0', async () => {
    const dir = tmpProject('sync-empty')
    mkdirSync(join(dir, 'goals'), { recursive: true })
    process.chdir(dir)
    try {
      const { goalSync } = await import('../src/commands/goal.js')
      const res = await goalSync()
      expect(res.created).toEqual([])
      expect(res.skipped).toEqual([])
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('findSkippedGoalFiles — 스키마 불일치 silent skip 탐지 (VHK-021)', () => {
  let origCwd: string
  beforeEach(() => {
    origCwd = process.cwd()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    vi.restoreAllMocks()
  })

  function writeRaw(dir: string, name: string, fm: string): void {
    mkdirSync(join(dir, 'goals'), { recursive: true })
    writeFileSync(join(dir, 'goals', name), `---\n${fm}\n---\nbody\n`, 'utf-8')
  }

  it('id 가 문자열(G1)이면 skip 후보로 잡힘', async () => {
    const dir = tmpProject('skip-id')
    writeRaw(dir, 'G1.md', 'vhk_format: 1\ntype: goal\nid: G1\ntitle: T\nstatus: NOT_STARTED')
    try {
      const { findSkippedGoalFiles } = await import('../src/lib/goal-frontmatter.js')
      const skipped = findSkippedGoalFiles(join(dir, 'goals'))
      expect(skipped.map((s) => s.file)).toContain('G1.md')
      expect(skipped[0].reason).toMatch(/숫자/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('type: goal 누락이면 skip 후보 (id 만 있음)', async () => {
    const dir = tmpProject('skip-type')
    writeRaw(dir, '1-x.md', 'vhk_format: 1\nid: 1\ntitle: T\nstatus: NOT_STARTED')
    try {
      const { findSkippedGoalFiles } = await import('../src/lib/goal-frontmatter.js')
      const skipped = findSkippedGoalFiles(join(dir, 'goals'))
      expect(skipped.map((s) => s.file)).toContain('1-x.md')
      expect(skipped[0].reason).toMatch(/type: goal/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('유효 goal / type:meta / _meta.md 는 경고 안 함', async () => {
    const dir = tmpProject('skip-clean')
    makeGoalFile(dir, 1, 'NOT_STARTED') // 유효
    writeRaw(dir, '_meta-self.md', 'vhk_format: 1\ntype: meta\nproject: x') // 의도적 메타
    writeRaw(dir, '_meta.md', 'vhk_format: 1\ntype: meta\nproject: y')
    try {
      const { findSkippedGoalFiles } = await import('../src/lib/goal-frontmatter.js')
      expect(findSkippedGoalFiles(join(dir, 'goals'))).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('goalList 가 무시된 파일을 경고 출력 (더 이상 silent 아님)', async () => {
    const dir = tmpProject('skip-warn')
    makeGoalFile(dir, 0, 'NOT_STARTED')
    writeRaw(dir, 'G1.md', 'vhk_format: 1\ntype: goal\nid: G1\ntitle: Bad\nstatus: NOT_STARTED')
    process.chdir(dir)
    try {
      const { goalList } = await import('../src/commands/goal.js')
      const logSpy = vi.spyOn(console, 'log')
      await goalList()
      const joined = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(joined).toMatch(/무시된 파일/)
      expect(joined).toContain('G1.md')
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('NL goal sync 라우팅+디스패치 (Codex #1 회귀)', () => {
  let origCwd: string
  beforeEach(() => {
    origCwd = process.cwd()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    vi.restoreAllMocks()
  })

  it('routeNaturalLanguage: "게이트 스크립트 동기화" → goal sync', async () => {
    const { routeNaturalLanguage } = await import('../src/lib/nlp-router.js')
    const r = routeNaturalLanguage('게이트 스크립트 동기화')
    expect(r?.command).toBe('goal')
    expect(r?.args).toEqual(['sync'])
  })

  it('"목표 체크 스크립트 생성" → sync (check 규칙이 가로채지 않음)', async () => {
    const { routeNaturalLanguage } = await import('../src/lib/nlp-router.js')
    const r = routeNaturalLanguage('목표 체크 스크립트 생성')
    expect(r?.args).toEqual(['sync'])
  })

  it('"목표 체크" → check (스크립트 없으면 기존대로, 가드가 정상 라우팅 안 깨뜨림)', async () => {
    const { routeNaturalLanguage } = await import('../src/lib/nlp-router.js')
    const r = routeNaturalLanguage('목표 체크')
    expect(r?.args).toEqual(['check'])
  })

  // 이 테스트가 파일 내에서 nlp-run.js 를 첫 import → 콜드 transform/import 비용이
  // 이 테스트의 타임아웃에 전가된다. Windows+node22 느린 러너에서 기본 5s 초과(flaky,
  // PR #291 CI 발견). 로직 자체는 순수·즉시이므로 콜드 import 여유만 부여(원인=타임아웃 과소).
  it('goal sync 자연어는 파일 쓰기 전에 confirmation 대상', async () => {
    const { routeNaturalLanguage } = await import('../src/lib/nlp-router.js')
    const { requiresConfirmation } = await import('../src/lib/nlp-run.js')
    const r = routeNaturalLanguage('게이트 스크립트 동기화')
    expect(r).not.toBeNull()
    expect(requiresConfirmation(r!)).toBe(true)
  }, 20000)

  it('dispatchNlpRoute goal/sync → goalSync 실행(스크립트 생성), goalList 아님', async () => {
    const dir = tmpProject('nl-sync')
    makeGoalFile(dir, 0, 'NOT_STARTED')
    process.chdir(dir)
    try {
      const { dispatchNlpRoute } = await import('../src/lib/nlp-run.js')
      await dispatchNlpRoute(
        { command: 'goal', args: ['sync'], explanation: '', confidence: 'high' },
        '게이트 스크립트 동기화'
      )
      // goalSync 만 파일을 생성 — goalList 면 생성 안 됨.
      expect(existsSync(join(dir, 'scripts/check-goal-0.mjs'))).toBe(true)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('Windows 1급 게이트 (goal 9)', () => {
  let origCwd: string
  let origExitCode: number | string | undefined
  beforeEach(() => {
    origCwd = process.cwd()
    origExitCode = process.exitCode
    mockSafeExecFile.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    process.exitCode = origExitCode
    vi.restoreAllMocks()
  })

  it('findGateScript — .mjs 와 .sh 둘 다 있으면 .mjs 우선', async () => {
    const dir = tmpProject('win-prefer')
    mkdirSync(join(dir, 'scripts'), { recursive: true })
    writeFileSync(join(dir, 'scripts/check-goal-1.mjs'), '// mjs', 'utf-8')
    writeFileSync(join(dir, 'scripts/check-goal-1.sh'), '#!/usr/bin/env bash', 'utf-8')
    process.chdir(dir)
    try {
      const { findGateScript } = await import('../src/commands/goal.js')
      const found = findGateScript(1)
      expect(found).not.toBeNull()
      expect(found!.endsWith('.mjs')).toBe(true)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('공통 검사 스크립트 탐색도 경로로 바뀔 수 있는 ID를 거부한다', async () => {
    const { findCheckScript } = await import('../src/commands/goal.js')
    expect(findCheckScript('goal', '../outside')).toBeNull()
    expect(findCheckScript('rule', 'bad/id')).toBeNull()
  })

  it('goalCheck — .mjs 게이트는 node 로 실행 (bash 불필요)', async () => {
    const dir = tmpProject('win-node')
    makeGoalFile(dir, 1, 'NOT_STARTED')
    mkdirSync(join(dir, 'scripts'), { recursive: true })
    writeFileSync(join(dir, 'scripts/check-goal-1.mjs'), 'process.exit(0)', 'utf-8')
    mockSafeExecFile.mockReturnValue({ ok: true, out: 'ok', err: '' })
    process.chdir(dir)
    try {
      const { goalCheck } = await import('../src/commands/goal.js')
      await goalCheck({ id: '1' })
      expect(mockSafeExecFile).toHaveBeenCalled()
      // 첫 인자(runner)가 bash 가 아니라 node — Windows 에서 bash 없이 동작.
      expect(mockSafeExecFile.mock.calls[0][0]).toBe('node')
      expect(String((mockSafeExecFile.mock.calls[0][1] as string[])[0])).toMatch(
        /check-goal-1\.mjs$/
      )
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('goal 엣지케이스 보강 (roadmap §4)', () => {
  let origCwd: string
  let origExitCode: number | string | undefined
  beforeEach(() => {
    origCwd = process.cwd()
    origExitCode = process.exitCode
    mockSafeExecFile.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    process.exitCode = origExitCode
    vi.restoreAllMocks()
  })

  // ① 중복 id 경고
  it('goalList — 중복 id 면 경고 출력', async () => {
    const dir = tmpProject('dup')
    makeGoalFile(dir, 1, 'NOT_STARTED')
    // 같은 id(1) 의 두 번째 파일 (다른 파일명)
    writeFileSync(
      join(dir, 'goals', '1-dup.md'),
      `---\nvhk_format: 1\ntype: goal\nid: 1\ntitle: Dup\nstatus: NOT_STARTED\n---\nbody\n`,
      'utf-8'
    )
    process.chdir(dir)
    try {
      const { goalList } = await import('../src/commands/goal.js')
      const logSpy = vi.spyOn(console, 'log')
      await goalList()
      const joined = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(joined).toMatch(/중복된 goal id/)
      expect(joined).toMatch(/\b1\b/)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('goalList — 중복 없으면 경고 안 함', async () => {
    const dir = tmpProject('nodup')
    makeGoalFile(dir, 0, 'NOT_STARTED')
    makeGoalFile(dir, 1, 'NOT_STARTED')
    process.chdir(dir)
    try {
      const { goalList } = await import('../src/commands/goal.js')
      const logSpy = vi.spyOn(console, 'log')
      await goalList()
      const joined = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(joined).not.toMatch(/중복된 goal id/)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // #317: 빈/공백/소수/문자 --id 는 Number() 강제변환으로 goal 0 을 조용히 건드리면 안 됨.
  //        (Number('')===0, Number('   ')===0, Number(' 1')===1 모두 finite 라 옛 코드는 통과시켰다.)
  describe('#317 goalDone — 파괴적 --id 강제변환 차단 (goal 0 오염 방지)', () => {
    // goal 0 + 통과하는 게이트를 깔아두고, 잘못된 --id 가 goal 0 을 DONE 으로 바꾸지 않음을 확인.
    function setupGoalZero(label: string): string {
      const dir = tmpProject(label)
      makeGoalFile(dir, 0, 'NOT_STARTED')
      mkdirSync(join(dir, 'scripts'), { recursive: true })
      writeFileSync(join(dir, 'scripts/check-goal-0.sh'), '#!/usr/bin/env bash\nexit 0\n', 'utf-8')
      mockSafeExecFile.mockReturnValue({ ok: true, out: 'ok', err: '' })
      return dir
    }

    for (const bad of ['', '   ', ' 1', 'abc', '1.5', '2zzz', '-1', '0x1']) {
      it(`--id ${JSON.stringify(bad)} → 거부 + goal 0 상태 변경 0`, async () => {
        const dir = setupGoalZero('id-bad')
        const before = readFileSync(join(dir, 'goals/0-test.md'), 'utf-8')
        process.chdir(dir)
        try {
          const { goalDone } = await import('../src/commands/goal.js')
          const logSpy = vi.spyOn(console, 'log')
          await goalDone({ id: bad })
          const after = readFileSync(join(dir, 'goals/0-test.md'), 'utf-8')
          // 파괴적 부작용 0: frontmatter 완전 보존
          expect(after).toBe(before)
          expect(after).toContain('status: NOT_STARTED')
          // 친절 메시지로 거부
          const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
          expect(out).toMatch(/유효하지 않은 goal 번호/)
        } finally {
          process.chdir(origCwd)
          rmSync(dir, { recursive: true, force: true })
        }
      })
    }

    it('정상 --id "1" 회귀 — 게이트 통과 시 DONE 처리됨', async () => {
      const dir = tmpProject('id-good')
      makeGoalFile(dir, 1, 'NOT_STARTED')
      mkdirSync(join(dir, 'scripts'), { recursive: true })
      writeFileSync(join(dir, 'scripts/check-goal-1.sh'), '#!/usr/bin/env bash\nexit 0\n', 'utf-8')
      mockSafeExecFile.mockReturnValue({ ok: true, out: 'ok', err: '' })
      process.chdir(dir)
      try {
        const { goalDone } = await import('../src/commands/goal.js')
        await goalDone({ id: '1' })
        const after = readFileSync(join(dir, 'goals/1-test.md'), 'utf-8')
        expect(after).toContain('status: DONE')
      } finally {
        process.chdir(origCwd)
        rmSync(dir, { recursive: true, force: true })
      }
    })

    it('goalCheck 도 동일하게 빈 --id 거부 (게이트 실행 전 차단)', async () => {
      const dir = tmpProject('check-bad')
      makeGoalFile(dir, 0, 'NOT_STARTED')
      process.chdir(dir)
      try {
        const { goalCheck } = await import('../src/commands/goal.js')
        const logSpy = vi.spyOn(console, 'log')
        await goalCheck({ id: '' })
        const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
        expect(out).toMatch(/유효하지 않은 goal 번호/)
        // goal 0 을 "없음"으로 잘못 보고하지 않음 (강제변환 0 으로 새지 않음)
        expect(out).not.toMatch(/goal id 0 없음/)
      } finally {
        process.chdir(origCwd)
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })

  // ② 없는 --id 메시지 통일 — check 와 done 이 같은 메시지
  it('goalCheck/goalDone — 없는 --id 면 둘 다 "goal id N 없음" 통일', async () => {
    const dir = tmpProject('notfound')
    makeGoalFile(dir, 0, 'NOT_STARTED')
    process.chdir(dir)
    try {
      const goal = await import('../src/commands/goal.js')

      const checkSpy = vi.spyOn(console, 'log')
      await goal.goalCheck({ id: '99' })
      const checkOut = checkSpy.mock.calls.map((c) => String(c[0])).join('\n')

      checkSpy.mockClear()
      await goal.goalDone({ id: '99' })
      const doneOut = checkSpy.mock.calls.map((c) => String(c[0])).join('\n')

      // 둘 다 동일한 not-found 문구 ("goal id 99 없음")
      expect(checkOut).toMatch(/goal id 99 없음/)
      expect(doneOut).toMatch(/goal id 99 없음/)
      // 옛 불일치 메시지(스크립트 없음 / 파일 없음)로 새지 않음
      expect(checkOut).not.toMatch(/게이트 스크립트 없음/)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// #328: goal init 직후 첫 goal next 가 init 스캐폴드를 '수동 편집본'으로 오탐하면 안 됨.
describe('#328 goalNext — init 스캐폴드 오탐 방지', () => {
  let origCwd: string
  beforeEach(() => {
    origCwd = process.cwd()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    vi.restoreAllMocks()
  })

  it('init 직후 첫 next 는 "수동 편집본" 경고를 내지 않음', async () => {
    const dir = tmpProject('first-next')
    process.chdir(dir)
    try {
      const { goalInit, goalNext } = await import('../src/commands/goal.js')
      await goalInit() // init 이 스캐폴드 next-task.md 생성
      makeGoalFile(dir, 1, 'NOT_STARTED')
      const logSpy = vi.spyOn(console, 'log')
      await goalNext() // 스캐폴드 위에서 첫 next
      const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(out).not.toMatch(/수동 편집본/)
      // 정상 갱신은 됐어야 함
      expect(out).toMatch(/next-task\.md 갱신/)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('실제 수동 편집본(마커 없는 임의 내용)은 여전히 경고', async () => {
    const dir = tmpProject('manual-next')
    mkdirSync(join(dir, 'docs/state'), { recursive: true })
    writeFileSync(join(dir, 'docs/state/next-task.md'), '사용자가 손으로 쓴 메모\n', 'utf-8')
    makeGoalFile(dir, 1, 'NOT_STARTED')
    process.chdir(dir)
    try {
      const { goalNext } = await import('../src/commands/goal.js')
      const logSpy = vi.spyOn(console, 'log')
      await goalNext()
      const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(out).toMatch(/수동 편집본/) // 회귀: 진짜 수동 편집은 계속 잡아야 함
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// #329: 전부 DONE / 0개일 때 check·done 이 next 와 일관된 안내 + exit 0.
describe('#329 goalCheck/goalDone — 전부완료·0개 일관 안내', () => {
  let origCwd: string
  let origExitCode: number | string | undefined
  beforeEach(() => {
    origCwd = process.cwd()
    origExitCode = process.exitCode
    process.exitCode = 0
    mockSafeExecFile.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    process.exitCode = origExitCode
    vi.restoreAllMocks()
  })

  it('전부 DONE 이면 check 가 "모든 goal 완료" 안내 + exit 0 (generic 문구 아님)', async () => {
    const dir = tmpProject('check-alldone')
    makeGoalFile(dir, 1, 'DONE')
    process.chdir(dir)
    try {
      const { goalCheck } = await import('../src/commands/goal.js')
      const logSpy = vi.spyOn(console, 'log')
      await goalCheck({})
      const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(out).toMatch(/모든 goal/)
      expect(out).not.toMatch(/대상 goal 을 결정할 수 없습니다/)
      expect(process.exitCode).not.toBe(1)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('전부 DONE 이면 done 이 "모든 goal 완료" 안내 + exit 0', async () => {
    const dir = tmpProject('done-alldone')
    makeGoalFile(dir, 1, 'DONE')
    process.chdir(dir)
    try {
      const { goalDone } = await import('../src/commands/goal.js')
      const logSpy = vi.spyOn(console, 'log')
      await goalDone({})
      const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(out).toMatch(/모든 goal/)
      expect(out).not.toMatch(/대상 goal 을 결정할 수 없습니다/)
      expect(process.exitCode).not.toBe(1)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('0개(빈)일 때 check 가 "정의된 goal 없음" 안내 (next 와 일관) + exit 0', async () => {
    const dir = tmpProject('check-empty')
    mkdirSync(join(dir, 'goals'), { recursive: true })
    process.chdir(dir)
    try {
      const { goalCheck } = await import('../src/commands/goal.js')
      const logSpy = vi.spyOn(console, 'log')
      await goalCheck({})
      const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(out).toMatch(/정의된 goal 이 없습니다/)
      expect(out).not.toMatch(/대상 goal 을 결정할 수 없습니다/)
      expect(process.exitCode).not.toBe(1)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('0개일 때 done 도 "정의된 goal 없음" 안내 + exit 0', async () => {
    const dir = tmpProject('done-empty')
    mkdirSync(join(dir, 'goals'), { recursive: true })
    process.chdir(dir)
    try {
      const { goalDone } = await import('../src/commands/goal.js')
      const logSpy = vi.spyOn(console, 'log')
      await goalDone({})
      const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(out).toMatch(/정의된 goal 이 없습니다/)
      expect(out).not.toMatch(/대상 goal 을 결정할 수 없습니다/)
      expect(process.exitCode).not.toBe(1)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('active goal 이 있는데 --id 없으면 정상 동작(회귀) — generic 차단 메시지 안 뜸', async () => {
    const dir = tmpProject('check-active')
    makeGoalFile(dir, 1, 'NOT_STARTED')
    process.chdir(dir)
    try {
      const { goalCheck } = await import('../src/commands/goal.js')
      const logSpy = vi.spyOn(console, 'log')
      await goalCheck({}) // 스크립트 없음 → '게이트 스크립트 없음' 으로 진입(대상은 정상 결정)
      const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(out).not.toMatch(/대상 goal 을 결정할 수 없습니다/)
      expect(out).not.toMatch(/모든 goal/)
      expect(out).not.toMatch(/정의된 goal 이 없습니다/)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// #330: 비숫자 --id 는 '유효하지 않은 goal 번호' 로 진짜 원인 지목 (#317 로 이미 해결 — 회귀 가드).
describe('#330 goalCheck/goalDone — 비숫자 --id 진짜 원인 지목', () => {
  let origCwd: string
  let origExitCode: number | string | undefined
  beforeEach(() => {
    origCwd = process.cwd()
    origExitCode = process.exitCode
    process.exitCode = 0
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    process.exitCode = origExitCode
    vi.restoreAllMocks()
  })

  for (const cmd of ['goalCheck', 'goalDone'] as const) {
    it(`${cmd} --id abc → '유효하지 않은 goal 번호' 지목 + 모순 '대상 결정 불가' 안 뜸`, async () => {
      const dir = tmpProject(`nonnum-${cmd}`)
      makeGoalFile(dir, 1, 'NOT_STARTED')
      process.chdir(dir)
      try {
        const goal = await import('../src/commands/goal.js')
        const logSpy = vi.spyOn(console, 'log')
        await goal[cmd]({ id: 'abc' })
        const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
        expect(out).toMatch(/유효하지 않은 goal 번호/)
        expect(out).toMatch(/abc/)
        // 모순 메시지(--id 명시 필요)로 새지 않음
        expect(out).not.toMatch(/대상 goal 을 결정할 수 없습니다/)
        expect(process.exitCode).toBe(1)
      } finally {
        process.chdir(origCwd)
        rmSync(dir, { recursive: true, force: true })
      }
    })
  }
})

// #287: stdout 파이프가 게이트 로그 도중 조기 종료(EPIPE)돼도 status 전이는 보존돼야 한다.
//        (Windows 는 파이프 write 가 동기 → EPIPE throw 가 스택을 풀어 옛 코드는 write 전 종료.)
describe('#287 goalDone — 파이프 조기종료(EPIPE) 시에도 상태 전이 보장', () => {
  let origCwd: string
  let origExitCode: number | string | undefined
  beforeEach(() => {
    origCwd = process.cwd()
    origExitCode = process.exitCode
    mockSafeExecFile.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    process.exitCode = origExitCode
    vi.restoreAllMocks()
  })

  it('게이트 출력 print 가 EPIPE 로 죽어도 frontmatter 는 DONE 으로 전이됨', async () => {
    const dir = tmpProject('epipe-done')
    makeGoalFile(dir, 4, 'NOT_STARTED')
    mkdirSync(join(dir, 'scripts'), { recursive: true })
    writeFileSync(join(dir, 'scripts/check-goal-4.sh'), '#!/usr/bin/env bash\nexit 0\n', 'utf-8')
    // 게이트 통과시키고, 게이트 출력에 마커를 심어 그 출력 console.log 에서만 EPIPE 를 던지게 한다.
    // (PowerShell `... | Select -First N` 처럼 소비자가 게이트 로그 도중 파이프를 닫는 상황 모사.)
    const MARK = '__VHK287_EPIPE_MARK__'
    mockSafeExecFile.mockReturnValue({ ok: true, out: MARK, err: '' })
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      if (String(a[0]).includes(MARK)) {
        throw Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })
      }
    })
    process.chdir(dir)
    try {
      const { goalDone } = await import('../src/commands/goal.js')
      let thrown: unknown = null
      try {
        await goalDone({ id: '4' })
      } catch (e) {
        // 옛 코드: write 전 throw → 여기로(상태 미전이). 수정 코드: write 후 throw → 여기로(상태 전이됨).
        thrown = e
      }
      // 시뮬레이션이 실제로 EPIPE 를 던졌는지 확인 — 테스트가 헛돌지 않게 가드.
      expect((thrown as NodeJS.ErrnoException | null)?.code).toBe('EPIPE')
      // 핵심: 출력이 EPIPE 로 끊겼어도 상태 전이는 디스크에 남아야 한다.
      const after = readFileSync(join(dir, 'goals/4-test.md'), 'utf-8')
      expect(after).toContain('status: DONE')
      expect(after).not.toContain('status: NOT_STARTED')
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
