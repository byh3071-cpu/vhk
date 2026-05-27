import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function tmpProject(label: string): string {
  const dir = join(
    tmpdir(),
    `vhk-agent-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('blocker', () => {
  let origCwd: string
  let dir: string
  let origExitCode: number | string | undefined
  beforeEach(() => {
    origCwd = process.cwd()
    origExitCode = process.exitCode
    dir = tmpProject('blocker')
    process.chdir(dir)
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    process.exitCode = origExitCode
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('빈 설명이면 기록 안 함', async () => {
    const { blocker } = await import('../src/commands/agent.js')
    await blocker('')
    expect(existsSync(join(dir, 'docs/state/blockers.md'))).toBe(false)
  })

  it('블로커 1건 기록', async () => {
    const { blocker } = await import('../src/commands/agent.js')
    await blocker('tsc 에러')
    const content = readFileSync(join(dir, 'docs/state/blockers.md'), 'utf-8')
    expect(content).toContain('tsc 에러')
  })

  it('3건 누적 시 HARD_STOP 자동 생성', async () => {
    const { blocker } = await import('../src/commands/agent.js')
    await blocker('b1')
    await blocker('b2')
    expect(existsSync(join(dir, '.vhk/HARD_STOP'))).toBe(false)
    await blocker('b3')
    expect(existsSync(join(dir, '.vhk/HARD_STOP'))).toBe(true)
  })
})

describe('learn — SoT 일관성 (memory.json 격리)', () => {
  let origCwd: string
  let dir: string
  beforeEach(() => {
    origCwd = process.cwd()
    dir = tmpProject('learn')
    process.chdir(dir)
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('learn 호출은 learnings.md 만 갱신, memory.json 무영향 (Forbidden 이중 기록 금지)', async () => {
    const { learn } = await import('../src/commands/agent.js')
    await learn('새 교훈')
    expect(existsSync(join(dir, 'docs/state/learnings.md'))).toBe(true)
    expect(existsSync(join(dir, '.vhk/memory.json'))).toBe(false)
  })

  it('빈 lesson 이면 기록 안 함', async () => {
    const { learn } = await import('../src/commands/agent.js')
    await learn('  ')
    expect(existsSync(join(dir, 'docs/state/learnings.md'))).toBe(false)
  })
})

describe('resume — --confirm 없으면 거부 (Forbidden 자동 호출 금지)', () => {
  let origCwd: string
  let dir: string
  let origExitCode: number | string | undefined
  beforeEach(() => {
    origCwd = process.cwd()
    origExitCode = process.exitCode
    dir = tmpProject('resume')
    process.chdir(dir)
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    process.exitCode = origExitCode
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('HARD_STOP 없으면 no-op (--confirm 무관)', async () => {
    const { resume } = await import('../src/commands/agent.js')
    await resume({ confirm: true })
    expect(existsSync(join(dir, '.vhk/HARD_STOP'))).toBe(false)
  })

  it('HARD_STOP 있는데 --confirm 없으면 거부 + 파일 보존', async () => {
    mkdirSync(join(dir, '.vhk'), { recursive: true })
    const { writeHardStop } = await import('../src/lib/state-files.js')
    writeHardStop('manual reason')
    const { resume } = await import('../src/commands/agent.js')
    await resume({})
    expect(existsSync(join(dir, '.vhk/HARD_STOP'))).toBe(true)
    expect(process.exitCode).toBe(1)
  })

  it('--confirm 있으면 HARD_STOP 제거', async () => {
    mkdirSync(join(dir, '.vhk'), { recursive: true })
    const { writeHardStop } = await import('../src/lib/state-files.js')
    writeHardStop('reason')
    const { resume } = await import('../src/commands/agent.js')
    await resume({ confirm: true })
    expect(existsSync(join(dir, '.vhk/HARD_STOP'))).toBe(false)
  })
})
