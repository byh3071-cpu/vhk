import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { removeDirSync } from '../../src/lib/fs-remove.js'

const gitRoot = { value: '' }
const addSpy = vi.fn()

vi.mock('../../src/lib/hard-stop-guard.js', () => ({ ensureNotHardStopped: () => true }))
vi.mock('../../src/lib/git-repo.js', () => ({ getGitRoot: () => gitRoot.value }))
vi.mock('../../src/worktree/add.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/worktree/add.js')>()
  return { ...actual, addWorktree: (...args: unknown[]) => addSpy(...args) }
})

describe('worktreeAdd preview gate', () => {
  let origCwd: string
  let origExit: number | string | undefined
  let dir: string

  beforeEach(() => {
    origCwd = process.cwd()
    origExit = process.exitCode
    process.exitCode = 0
    addSpy.mockReset()
    dir = join(tmpdir(), `vhk-wt-add-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    mkdirSync(dir, { recursive: true })
    gitRoot.value = dir
    process.chdir(dir)
  })

  afterEach(() => {
    process.chdir(origCwd)
    process.exitCode = origExit
    removeDirSync(dir)
  })

  it('--dry-run 은 미리보기만 하고 addWorktree 를 호출하지 않는다', async () => {
    const { worktreeAdd } = await import('../../src/commands/worktree.js')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await worktreeAdd('feat/login', { dryRun: true, stdinTty: false })
    const logs = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(logs).toContain('source:')
    expect(logs).toContain('target:')
    expect(logs).toContain('feat/login')
    expect(logs).toMatch(/Git·복사·install 없음/)
    expect(addSpy).not.toHaveBeenCalled()
    expect(process.exitCode === 1).toBe(false)
    logSpy.mockRestore()
  })

  it('비-TTY 는 --yes 없이 거부하고 addWorktree 를 호출하지 않는다', async () => {
    const { worktreeAdd } = await import('../../src/commands/worktree.js')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await worktreeAdd('feat/login', { stdinTty: false })
    const logs = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(logs).toContain('target:')
    expect(logs).toMatch(/--yes 없이/)
    expect(addSpy).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
    logSpy.mockRestore()
  })
})
