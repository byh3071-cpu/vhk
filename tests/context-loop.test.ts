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

  it('## Active Goal + 교훈(memory v2 흡수) 섹션 포함', async () => {
    makeGoalFile(dir, 0, 'DONE', 'Done Goal')
    makeGoalFile(dir, 1, 'IN_PROGRESS', '진행 중 미션')
    // v2: learnings.md 의 교훈은 readMemory 가 failures 로 흡수 → "저장된 기억" 섹션에 노출.
    // (v2.0 에서 appendLearning 제거 — learnings.md 는 마이그레이션 읽기 소스로만 남음. 직접 작성해 흡수 검증.)
    mkdirSync(join(dir, 'docs', 'state'), { recursive: true })
    writeFileSync(
      join(dir, 'docs', 'state', 'learnings.md'),
      '# Learnings\n\n- [2026-01-01 no-goal] lesson alpha\n- [2026-01-02 no-goal] lesson bravo\n- [2026-01-03 no-goal] lesson charlie\n',
      'utf-8'
    )

    const { context } = await import('../src/commands/context.js')
    await context()

    const out = readFileSync(join(dir, '.vhk/context.md'), 'utf-8')
    expect(out).toContain('## Active Goal')
    expect(out).toContain('id**: 1')
    expect(out).toContain('진행 중 미션')
    expect(out).toContain('저장된 기억') // v2 memory 섹션(구 Recent Learnings 통합)
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

describe('vhk context --compact (배치2 토큰 절감)', () => {
  let origCwd: string
  let dir: string
  beforeEach(() => {
    origCwd = process.cwd()
    dir = tmpProject('context-compact')
    process.chdir(dir)
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'tp', version: '0.0.0' }), 'utf-8')
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('compact 모드는 전체 명령 목록을 빼고 참조 문서 링크를 넣는다', async () => {
    makeGoalFile(dir, 1, 'IN_PROGRESS', '진행중')
    const { context } = await import('../src/commands/context.js')
    await context({ compact: true })
    const out = readFileSync(join(dir, '.vhk/context.md'), 'utf-8')
    expect(out).toContain('## Active Goal')
    expect(out).not.toContain('## VHK CLI 명령어')
    expect(out).toContain('참조 문서')
    expect(out).toContain('docs/state/next-task.md')
  })

  it('기본(full) 모드는 전체 명령 목록을 유지한다 (back-compat)', async () => {
    const { context } = await import('../src/commands/context.js')
    await context()
    const out = readFileSync(join(dir, '.vhk/context.md'), 'utf-8')
    expect(out).toContain('## VHK CLI 명령어')
  })

  it('active blockers 를 최근 N개만 포함한다', async () => {
    const { appendBlocker } = await import('../src/lib/state-files.js')
    appendBlocker('막힘 하나', 4)
    const { context } = await import('../src/commands/context.js')
    await context({ compact: true })
    const out = readFileSync(join(dir, '.vhk/context.md'), 'utf-8')
    expect(out).toContain('Active Blockers')
    expect(out).toContain('막힘 하나')
  })

  it('memory 가 여러 개면 최근 5개만 포함한다', async () => {
    mkdirSync(join(dir, '.vhk'), { recursive: true })
    const mems = Array.from({ length: 7 }, (_, i) => ({
      content: `메모리항목${i}`,
      addedAt: new Date(2026, 0, i + 1).toISOString(),
    }))
    writeFileSync(join(dir, '.vhk/memory.json'), JSON.stringify(mems), 'utf-8')
    const { context } = await import('../src/commands/context.js')
    await context({ compact: true })
    const out = readFileSync(join(dir, '.vhk/context.md'), 'utf-8')
    expect(out).toContain('메모리항목6')
    expect(out).not.toContain('메모리항목0')
    expect(out).not.toContain('메모리항목1')
  })
})
