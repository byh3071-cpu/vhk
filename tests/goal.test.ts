import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
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
