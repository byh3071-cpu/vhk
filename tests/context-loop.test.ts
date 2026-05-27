import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function tmpProject(label: string): string {
  const dir = join(
    tmpdir(),
    `vhk-ctx-loop-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

function makeGoalFile(dir: string, id: number, status: string, title: string): void {
  mkdirSync(join(dir, 'goals'), { recursive: true })
  writeFileSync(
    join(dir, 'goals', `${id}-test.md`),
    `---\nvhk_format: 1\ntype: goal\nid: ${id}\ntitle: ${title}\nstatus: ${status}\npriority: P0\nversion: v0.${id}\n---\nbody\n`,
    'utf-8'
  )
}

describe('vhk context — Goal 2 자율 루프 확장', () => {
  let origCwd: string
  let dir: string
  beforeEach(() => {
    origCwd = process.cwd()
    dir = tmpProject('context-loop')
    process.chdir(dir)
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'tp', version: '0.0.0' }), 'utf-8')
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('## Active Goal + ## Recent Learnings 섹션 포함', async () => {
    makeGoalFile(dir, 0, 'DONE', 'Done Goal')
    makeGoalFile(dir, 1, 'IN_PROGRESS', '진행 중 미션')
    const { appendLearning } = await import('../src/lib/state-files.js')
    appendLearning('lesson alpha')
    appendLearning('lesson bravo')
    appendLearning('lesson charlie')

    const { context } = await import('../src/commands/context.js')
    await context()

    const out = readFileSync(join(dir, '.vhk/context.md'), 'utf-8')
    expect(out).toContain('## Active Goal')
    expect(out).toContain('id**: 1')
    expect(out).toContain('진행 중 미션')
    expect(out).toContain('## Recent Learnings')
    expect(out).toContain('lesson alpha')
    expect(out).toContain('lesson charlie')
  })

  it('HARD_STOP 활성 시 경고 섹션 포함', async () => {
    makeGoalFile(dir, 1, 'IN_PROGRESS', '진행')
    const { writeHardStop } = await import('../src/lib/state-files.js')
    writeHardStop('test reason')

    const { context } = await import('../src/commands/context.js')
    await context()

    const out = readFileSync(join(dir, '.vhk/context.md'), 'utf-8')
    expect(out).toContain('HARD_STOP 활성')
    expect(out).toContain('vhk resume --confirm')
  })

  it('goals 디렉토리 없으면 Active Goal 섹션 생략 (기존 동작 보존)', async () => {
    const { context } = await import('../src/commands/context.js')
    await context()

    const out = readFileSync(join(dir, '.vhk/context.md'), 'utf-8')
    expect(out).not.toContain('## Active Goal')
    expect(out).not.toContain('## Recent Learnings')
  })
})
