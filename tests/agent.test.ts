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

describe('learn — memory v2 통합 SoT (Goal 18 breaking: learnings.md 분리 폐지)', () => {
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

  it('learn 호출은 memory v2 failures.lesson 에 기록, learnings.md 신규 기록 안 함 (통합)', async () => {
    const { learn } = await import('../src/commands/agent.js')
    await learn('새 교훈')
    // 통합: memory.json 에 기록
    expect(existsSync(join(dir, '.vhk/memory.json'))).toBe(true)
    const mem = JSON.parse(readFileSync(join(dir, '.vhk/memory.json'), 'utf-8'))
    expect(mem.schemaVersion).toBe(2)
    expect(mem.failures[0].lesson).toBe('새 교훈')
    // learnings.md 신규 기록 중단
    expect(existsSync(join(dir, 'docs/state/learnings.md'))).toBe(false)
  })

  it('빈 lesson 이면 기록 안 함', async () => {
    const { learn } = await import('../src/commands/agent.js')
    await learn('  ')
    expect(existsSync(join(dir, '.vhk/memory.json'))).toBe(false)
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

// 이슈 #373: autonomyLog() CLI 레이어 — start 는 runId 발급, 종결은 run-id 필수(없으면 기록 안 함).
describe('autonomyLog — CLI 레이어 (이슈 #373 자율성완주율)', () => {
  let origCwd: string
  let dir: string
  let origExitCode: number | string | undefined
  beforeEach(() => {
    origCwd = process.cwd()
    origExitCode = process.exitCode
    dir = tmpProject('autonomy-log')
    process.chdir(dir)
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(origCwd)
    process.exitCode = origExitCode
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('start — runId 발급 + jsonl 에 1줄 append', async () => {
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const content = readFileSync(join(dir, '.vhk/events/autonomy-run.jsonl'), 'utf-8')
    const lines = content.trim().split('\n')
    expect(lines).toHaveLength(1)
    const parsed = JSON.parse(lines[0])
    expect(parsed.event).toBe('start')
    expect(typeof parsed.runId).toBe('string')
    expect(parsed.runId.length).toBeGreaterThan(0)
  })

  it('complete — --run-id 있으면 종결 기록(ticks/interventions 반영)', async () => {
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'complete', runId: 'fixed-run-id', ticks: 4, interventions: 0 })
    const content = readFileSync(join(dir, '.vhk/events/autonomy-run.jsonl'), 'utf-8')
    const parsed = JSON.parse(content.trim().split('\n')[0])
    expect(parsed).toMatchObject({ event: 'complete', runId: 'fixed-run-id', ticks: 4, interventions: 0 })
  })

  it('hardstop — --review-rejected 반영', async () => {
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'hardstop', runId: 'fixed-run-id', reviewRejected: true })
    const content = readFileSync(join(dir, '.vhk/events/autonomy-run.jsonl'), 'utf-8')
    const parsed = JSON.parse(content.trim().split('\n')[0])
    expect(parsed).toMatchObject({ event: 'hardstop', runId: 'fixed-run-id', reviewRejected: true })
  })

  it('blocked — --run-id 로 종결 기록', async () => {
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'blocked', runId: 'fixed-run-id' })
    const content = readFileSync(join(dir, '.vhk/events/autonomy-run.jsonl'), 'utf-8')
    const parsed = JSON.parse(content.trim().split('\n')[0])
    expect(parsed).toMatchObject({ event: 'blocked', runId: 'fixed-run-id' })
  })

  it('--run-id 없이 종결 이벤트(complete) 호출 시 exitCode=1, append 안 함', async () => {
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'complete' })
    expect(existsSync(join(dir, '.vhk/events/autonomy-run.jsonl'))).toBe(false)
    expect(process.exitCode).toBe(1)
  })

  it('--goal 생략 시 active goal 자동감지(activeGoalId 재사용)와 동일 관례 — goal 없어도 에러 없이 기록', async () => {
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const content = readFileSync(join(dir, '.vhk/events/autonomy-run.jsonl'), 'utf-8')
    const parsed = JSON.parse(content.trim().split('\n')[0])
    expect(parsed.goal).toBeUndefined()
  })
})

// 검증(적대적 재검토)에서 발견: --goal/--ticks/--interventions 가 index.ts 에서 Number() 로
// 무검증 변환돼 'abc'→NaN(활성goal 자동감지 무력화), ' 1'(공백패딩)→조용히 1 로 오염되는 실버그.
// #317(resolveGoalId, goal.ts)과 동일한 /^\d+$/ 가드를 여기도 적용해야 한다.
describe('parseAutonomyIntArg — 파괴적 숫자 입력 차단 (#373 재검증)', () => {
  it('생략(undefined)이면 undefined 통과', async () => {
    const { parseAutonomyIntArg } = await import('../src/commands/agent.js')
    expect(parseAutonomyIntArg(undefined)).toBeUndefined()
  })

  for (const good of ['0', '1', '12']) {
    it(`'${good}' → 숫자로 정상 변환`, async () => {
      const { parseAutonomyIntArg } = await import('../src/commands/agent.js')
      expect(parseAutonomyIntArg(good)).toBe(Number(good))
    })
  }

  for (const bad of ['', '   ', ' 1', 'abc', '1.5', '2zzz', '-1', '0x1']) {
    it(`${JSON.stringify(bad)} → INVALID_AUTONOMY_ARG 거부`, async () => {
      const { parseAutonomyIntArg, INVALID_AUTONOMY_ARG } = await import('../src/commands/agent.js')
      expect(parseAutonomyIntArg(bad)).toBe(INVALID_AUTONOMY_ARG)
    })
  }
})
