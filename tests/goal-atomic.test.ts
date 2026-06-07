import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Goal 40: goal.ts 영속 쓰기(goalNext/goalInit/goalDone)를 atomicWriteFile 로.
// 결과 내용 동일 + 성공 경로에 temp(.tmp-) 잔여 0 회귀 가드.
// (실패-경로 cleanup 은 OS-의존 시뮬이 atomic rename 을 우회해 깨지므로 검증 안 함 — 성공 경로만.)

function tmpProject(label: string): string {
  const dir = join(tmpdir(), `vhk-goalatomic-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
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
const noTmp = (d: string) => readdirSync(d).filter((f) => f.includes('.tmp-'))

describe('goal.ts atomic 쓰기 (Goal 40)', () => {
  let origCwd: string
  beforeEach(() => {
    origCwd = process.cwd()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    process.exitCode = 0
    vi.restoreAllMocks()
  })

  it('goalNext — next-task.md 내용 정확 + temp 잔여 0', async () => {
    const dir = tmpProject('next')
    makeGoalFile(dir, 1, 'NOT_STARTED')
    process.chdir(dir)
    try {
      const { goalNext } = await import('../src/commands/goal.js')
      await goalNext()
      const text = readFileSync(join(dir, 'docs/state/next-task.md'), 'utf-8')
      expect(text).toContain('Goal 1')
      expect(noTmp(join(dir, 'docs/state'))).toHaveLength(0)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('goalInit — scaffold 4파일 생성 + temp 잔여 0', async () => {
    const dir = tmpProject('init')
    process.chdir(dir)
    try {
      const { goalInit } = await import('../src/commands/goal.js')
      await goalInit()
      expect(readFileSync(join(dir, 'goals/_meta.md'), 'utf-8').length).toBeGreaterThan(0)
      expect(readFileSync(join(dir, 'docs/state/blockers.md'), 'utf-8').length).toBeGreaterThan(0)
      expect(noTmp(join(dir, 'goals'))).toHaveLength(0)
      expect(noTmp(join(dir, 'docs/state'))).toHaveLength(0)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('goalDone — 게이트 통과 후 frontmatter DONE + temp 잔여 0', async () => {
    const dir = tmpProject('done')
    makeGoalFile(dir, 5, 'NOT_STARTED')
    // 통과하는 trivial 게이트(node exit 0) — runGate 가 `node scripts/check-goal-5.mjs` 실행.
    mkdirSync(join(dir, 'scripts'), { recursive: true })
    writeFileSync(join(dir, 'scripts', 'check-goal-5.mjs'), 'process.exit(0)\n', 'utf-8')
    process.chdir(dir)
    try {
      const { goalDone } = await import('../src/commands/goal.js')
      await goalDone({ id: '5' })
      const text = readFileSync(join(dir, 'goals', '5-test.md'), 'utf-8')
      expect(text).toContain('status: DONE')
      expect(text).toContain('completed:')
      expect(noTmp(join(dir, 'goals'))).toHaveLength(0)
    } finally {
      process.chdir(origCwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
