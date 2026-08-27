import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync, appendFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { removeDirSync, removeFileSync } from '../src/lib/fs-remove.js'
import { writePolicyBaseline } from '../src/lib/policy-baseline.js'
import { readRunState, RUN_STATE_LOCK_REL, RUN_STATE_REL } from '../src/lib/run-state.js'
import { readAutonomyLog } from '../src/lib/autonomy-log.js'
import { calcAutonomyStats } from '../src/lib/autonomy-stats.js'

const autonomyAppendFailure = vi.hoisted(() => ({ runId: null as string | null }))

vi.mock('../src/lib/autonomy-log.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/autonomy-log.js')>()
  return {
    ...actual,
    appendAutonomyEntry: (...args: Parameters<typeof actual.appendAutonomyEntry>): void => {
      const entry = args[1]
      if (entry.runId === autonomyAppendFailure.runId && entry.event !== 'start') {
        throw Object.assign(new Error('forced terminal append failure'), { code: 'EIO' })
      }
      actual.appendAutonomyEntry(...args)
    },
  }
})

/*
 * 124-T3·T4 배선 — `vhk autonomy-log` 종결 경로에서만 판정 원장을 쓴다 (RFC 0066 §4.3 · §7.1 · ADR-019).
 *
 * 계약 넷.
 *   ① 기본 off: record/enforce 가 없거나 false 면 새 쓰기 0 · stdout 도 종전과 같다.
 *   ② 시작 이벤트는 판정하지 않는다. 종결(complete/hardstop/blocked) 직후에만 쓴다.
 *   ③ 집행 0: 판정이 무엇이든 종결 기록은 그대로 남고 명령은 실패하지 않는다.
 *   ④ 원장 append 실패는 삼키지 않는다 — 종결 기록은 남되 거짓 성공(exit 0)으로 끝내지 않는다.
 */

const AUTONOMY = '.vhk/events/autonomy-run.jsonl'
const LEDGER = '.vhk/events/policy-decision.jsonl'
const POLICY = '.vhk/policy.json'

let origCwd: string
let dir: string
let origExitCode: number | string | undefined
let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  autonomyAppendFailure.runId = null
  origCwd = process.cwd()
  origExitCode = process.exitCode
  dir = mkdtempSync(join(tmpdir(), 'vhk-agent-policy-'))
  process.chdir(dir)
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  autonomyAppendFailure.runId = null
  process.chdir(origCwd)
  process.exitCode = origExitCode
  vi.restoreAllMocks()
  removeDirSync(dir)
})

function writePolicy(config: Record<string, unknown>): void {
  mkdirSync(join(dir, '.vhk'), { recursive: true })
  writeFileSync(join(dir, POLICY), JSON.stringify(config, null, 2), 'utf-8')
}

function writePolicyBody(body: string): void {
  mkdirSync(join(dir, '.vhk'), { recursive: true })
  writeFileSync(join(dir, POLICY), body, 'utf-8')
}

function latestStartRunId(): string {
  const starts = readJsonl(AUTONOMY).filter((line) => line.event === 'start')
  const start = starts[starts.length - 1]
  if (typeof start?.runId !== 'string') throw new Error('start runId missing')
  return start.runId
}

/** 판정 대상이 되는 start 라인(v2 + sha)을 심는다. 종결은 명령이 쓴다. */
function seedStart(runId: string): void {
  mkdirSync(join(dir, '.vhk', 'events'), { recursive: true })
  appendFileSync(
    join(dir, AUTONOMY),
    `${JSON.stringify({ ts: '2026-08-27T00:00:00.000Z', runId, event: 'start', schemaVersion: 2, sha: `sample-sha-${runId}` })}\n`,
    'utf-8',
  )
}

/** 정책 marker 도입 전 terminal 한 줄을 심는다. */
function seedUnmarkedTerminal(
  runId: string,
  overrides: Record<string, unknown> = {},
): void {
  mkdirSync(join(dir, '.vhk', 'events'), { recursive: true })
  appendFileSync(
    join(dir, AUTONOMY),
    `${JSON.stringify({
      ts: '2026-08-27T01:00:00.000Z',
      runId,
      event: 'complete',
      schemaVersion: 2,
      sha: null,
      taskKind: 'unknown',
      ticks: 2,
      interventions: 1,
      ...overrides,
    })}\n`,
    'utf-8',
  )
}

function readJsonl(rel: string): Array<Record<string, unknown>> {
  if (!existsSync(join(dir, rel))) return []
  return readFileSync(join(dir, rel), 'utf-8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>)
}

function printed(): string {
  return logSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n')
}

function runGit(args: string[]): void {
  const result = spawnSync('git', args, { cwd: dir, encoding: 'utf-8' })
  if (result.status !== 0) {
    throw new Error(`git ${args[0] ?? ''} failed: ${result.stderr}`)
  }
}

describe('① 기본 off — 새 쓰기 0 · 출력 불변', () => {
  it('policy.json 이 없으면 종결해도 판정 원장이 생기지 않는다', async () => {
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'complete', runId: 'fixed-run-id', ticks: 3, interventions: 0 })
    expect(readJsonl(AUTONOMY)).toHaveLength(1)
    expect(existsSync(join(dir, LEDGER))).toBe(false)
    expect(existsSync(join(dir, '.vhk', '.gitignore'))).toBe(false)
    expect(existsSync(join(dir, RUN_STATE_LOCK_REL))).toBe(false)
    expect(printed()).not.toContain('권한')
    expect(process.exitCode).toBe(origExitCode)
  })

  it('record:false · enforce:false 를 명시해도 같다', async () => {
    writePolicy({ schemaVersion: 1, record: false, enforce: false })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'hardstop', runId: 'fixed-run-id' })
    expect(readJsonl(AUTONOMY)).toHaveLength(1)
    expect(existsSync(join(dir, LEDGER))).toBe(false)
    expect(printed()).not.toContain('권한')
  })

  it('record·enforce가 꺼져도 terminal append 재시도는 최초 요청 전체를 이어 쓴다', async () => {
    writePolicy({ schemaVersion: 1, record: false, enforce: false })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()

    autonomyAppendFailure.runId = runId
    await autonomyLog({
      event: 'blocked',
      runId,
      ticks: 2,
      interventions: 1,
      failureKind: 'infra',
    })
    expect(process.exitCode).toBe(1)
    expect(readJsonl(AUTONOMY).map(line => line.event)).toEqual(['start'])
    expect(readRunState(dir)[runId]?.terminalRequestExpected).toMatchObject({
      event: 'blocked',
      policyInvalidated: false,
      ticks: 2,
      interventions: 1,
      failureKind: 'infra',
    })

    autonomyAppendFailure.runId = null
    process.exitCode = origExitCode
    await autonomyLog({
      event: 'blocked',
      runId,
      ticks: 9,
      interventions: 7,
      failureKind: 'product',
    })

    expect(process.exitCode).toBe(origExitCode)
    expect(readJsonl(AUTONOMY).at(-1)).toMatchObject({
      event: 'blocked',
      ticks: 2,
      interventions: 1,
      failureKind: 'infra',
    })
    expect(existsSync(join(dir, LEDGER))).toBe(false)
    expect(readRunState(dir)[runId]).toBeUndefined()
  })

  it('off 상태의 종결 라인은 배선 전과 같은 모양이다 — taskKind 유도 규칙 불변', async () => {
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'complete', runId: 'fixed-run-id', ticks: 4, interventions: 0 })
    const [line] = readJsonl(AUTONOMY)
    expect(line).toMatchObject({ event: 'complete', runId: 'fixed-run-id', ticks: 4, interventions: 0, schemaVersion: 2, taskKind: 'unknown' })
    // 배선이 종결 라인에 새 키를 얹지 않는다 — 판정 정보는 별도 원장(policy-decision.jsonl)에만 간다.
    const KNOWN_KEYS = ['ts', 'runId', 'goal', 'event', 'ticks', 'interventions', 'reviewRejected', 'schemaVersion', 'sha', 'taskKind', 'failureKind']
    for (const key of Object.keys(line)) expect(KNOWN_KEYS).toContain(key)
  })
})

describe('② 시작 이벤트는 판정하지 않는다', () => {
  it('record:true 여도 start 는 판정 원장을 만들지 않는다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    expect(readJsonl(AUTONOMY)).toHaveLength(1)
    expect(existsSync(join(dir, LEDGER))).toBe(false)
    expect(existsSync(join(dir, '.vhk/policy-baseline.json'))).toBe(false)
  })

  it('--run-id 없는 종결은 종결이 아니다 — 판정도 없다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'complete' })
    expect(process.exitCode).toBe(1)
    expect(existsSync(join(dir, LEDGER))).toBe(false)
  })

  it('private 상태 생성 뒤 start 원장 append가 실패하면 상태와 잠금을 되돌린다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    mkdirSync(join(dir, AUTONOMY), { recursive: true })
    const { autonomyLog } = await import('../src/commands/agent.js')

    await expect(autonomyLog({ event: 'start' })).resolves.toBeUndefined()

    expect(readRunState(dir)).toEqual({})
    expect(existsSync(join(dir, RUN_STATE_LOCK_REL))).toBe(false)
    expect(process.exitCode).toBe(1)
    expect(printed()).toContain('런 시작 원장을 기록하지 못했습니다')
  })
})

describe('정책 기준선 — enforce와 무관하게 런 시작·종결에서 fail-closed', () => {
  it('시작 전에 설정이 기준선과 다르면 start를 기록하지 않는다', async () => {
    writePolicy({ schemaVersion: 1, record: false, enforce: false })
    writePolicyBaseline(dir)
    writePolicy({ schemaVersion: 1, record: true, enforce: false })

    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })

    expect(readJsonl(AUTONOMY)).toEqual([])
    expect(process.exitCode).toBe(1)
    expect(printed()).toContain('POLICY_CONFIG_MUTATED')
  })

  it('런 종결 전에 설정이 바뀌면 complete를 blocked로 무효화하고 판정 원장을 쓰지 않는다', async () => {
    writePolicy({ schemaVersion: 1, record: true, enforce: false })
    writePolicyBaseline(dir)
    writePolicy({ schemaVersion: 1, record: true, enforce: true })

    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'complete', runId: 'sample-mutated-run', interventions: 0 })

    expect(readJsonl(AUTONOMY)[0]).toMatchObject({
      event: 'blocked',
      runId: 'sample-mutated-run',
      failureKind: 'product',
    })
    expect(existsSync(join(dir, LEDGER))).toBe(false)
    expect(process.exitCode).toBe(1)
    expect(printed()).toContain('POLICY_CONFIG_MUTATED')
  })

  it('손상 설정 + 기준선 없음이면 start를 기록하지 않는다', async () => {
    writePolicyBody('{ broken')
    writeFileSync(join(dir, '.vhk', '.gitignore'), '!policy.json\n', 'utf-8')
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    expect(readJsonl(AUTONOMY)).toEqual([])
    expect(process.exitCode).toBe(1)
    expect(printed()).toContain('POLICY_CONFIG_UNREADABLE')
    const ignored = readFileSync(join(dir, '.vhk', '.gitignore'), 'utf-8').split(/\r?\n/)
    expect(ignored.lastIndexOf('policy.json')).toBeGreaterThan(ignored.lastIndexOf('!policy.json'))
    expect(ignored).toContain('policy-baseline.json')
    expect(ignored).toContain('run-state.json')
  })

  it('대상이 끊긴 정책 링크면 default-off로 통과하지 않고 start를 막는다', async () => {
    mkdirSync(join(dir, '.vhk'), { recursive: true })
    try {
      const fs = await import('node:fs')
      fs.symlinkSync(join(dir, '.vhk', 'missing-policy.json'), join(dir, POLICY), 'file')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return
      throw error
    }
    const { autonomyLog } = await import('../src/commands/agent.js')

    await autonomyLog({ event: 'start' })

    expect(readJsonl(AUTONOMY)).toEqual([])
    expect(process.exitCode).toBe(1)
    expect(printed()).toContain('POLICY_CONFIG_UNREADABLE')
  })

  it('미지원 버전이 같은 해시로 고정돼 있어도 start를 기록하지 않는다', async () => {
    const body = '{"schemaVersion":999,"record":true}'
    writePolicyBody(body)
    const hash = createHash('sha256').update(body).digest('hex')
    writeFileSync(join(dir, '.vhk', 'policy-baseline.json'), JSON.stringify({ hash }), 'utf-8')
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    expect(readJsonl(AUTONOMY)).toEqual([])
    expect(process.exitCode).toBe(1)
    expect(printed()).toContain('POLICY_CONFIG_UNSUPPORTED_VERSION')
  })

  it('정상 start 뒤 설정이 손상되면 complete를 blocked/product로 무효화한다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()
    writePolicyBody('{ broken')
    await autonomyLog({ event: 'complete', runId, interventions: 0 })

    expect(readJsonl(AUTONOMY).at(-1)).toMatchObject({ event: 'blocked', runId, failureKind: 'product' })
    expect(existsSync(join(dir, LEDGER))).toBe(false)
    expect(process.exitCode).toBe(1)

    process.exitCode = origExitCode
    await autonomyLog({ event: 'complete', runId, interventions: 0 })
    expect(readJsonl(AUTONOMY).map(line => line.event)).toEqual(['start', 'blocked'])
    expect(existsSync(join(dir, LEDGER))).toBe(false)
    expect(process.exitCode).toBe(1)
  })

  it('손상 설정에서 append가 실패해도 설정 복구 재시도가 blocked 결과를 complete로 바꾸지 않는다', async () => {
    const originalPolicy = { schemaVersion: 1, record: false, enforce: false }
    writePolicy(originalPolicy)
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()

    writePolicyBody('{ broken')
    autonomyAppendFailure.runId = runId
    await autonomyLog({ event: 'complete', runId, ticks: 3, interventions: 0 })

    expect(process.exitCode).toBe(1)
    expect(readJsonl(AUTONOMY).map(line => line.event)).toEqual(['start'])
    expect(readRunState(dir)[runId]?.terminalRequestExpected).toMatchObject({
      event: 'complete',
      policyInvalidated: true,
      ticks: 3,
      interventions: 0,
    })

    writePolicy(originalPolicy)
    autonomyAppendFailure.runId = null
    process.exitCode = origExitCode
    await autonomyLog({ event: 'complete', runId, ticks: 9, interventions: 7 })

    expect(readJsonl(AUTONOMY).at(-1)).toMatchObject({
      event: 'blocked',
      ticks: 3,
      interventions: 0,
      failureKind: 'product',
    })
    expect(process.exitCode).toBe(1)
    expect(existsSync(join(dir, LEDGER))).toBe(false)
    expect(readRunState(dir)[runId]).toBeUndefined()
  })

  it('베이스라인이 없던 런도 A→B 변경 뒤 B를 재고정하면 무효다', async () => {
    writePolicy({ schemaVersion: 1, record: true, maxLevel: 'L1' })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()
    writePolicy({ schemaVersion: 1, record: true, maxLevel: 'L2' })
    writePolicyBaseline(dir)
    expect(readJsonl(AUTONOMY)[0]).toMatchObject({ policyConfigSnapshot: 'run-state-v1' })

    await autonomyLog({ event: 'complete', runId, interventions: 0 })
    expect(readJsonl(AUTONOMY).at(-1)).toMatchObject({ event: 'blocked', failureKind: 'product' })
    expect(existsSync(join(dir, LEDGER))).toBe(false)
    expect(process.exitCode).toBe(1)
  })

  it('설정 없음으로 시작한 런에 설정이 생기면 무효다', async () => {
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()
    expect(readJsonl(AUTONOMY)[0]).toMatchObject({ policyConfigSnapshot: 'absent' })
    writePolicy({ schemaVersion: 1, record: false })
    await autonomyLog({ event: 'complete', runId, interventions: 0 })
    expect(readJsonl(AUTONOMY).at(-1)).toMatchObject({ event: 'blocked', failureKind: 'product' })
  })

  it('설정 없음이 유지되면 종전처럼 정상 complete다', async () => {
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()
    await autonomyLog({ event: 'complete', runId, interventions: 0 })
    expect(readJsonl(AUTONOMY).at(-1)).toMatchObject({ event: 'complete', runId })
    expect(process.exitCode).toBe(origExitCode)
  })

  it('정책 없는 런은 무관한 손상 run-state 파일 때문에 종결이 막히지 않는다', async () => {
    mkdirSync(join(dir, '.vhk'), { recursive: true })
    writeFileSync(join(dir, RUN_STATE_REL), '{ broken', 'utf-8')
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()

    await autonomyLog({ event: 'complete', runId, interventions: 0 })

    expect(readJsonl(AUTONOMY).map(line => line.event)).toEqual(['start', 'complete'])
    expect(process.exitCode).toBe(origExitCode)
    expect(readFileSync(join(dir, RUN_STATE_REL), 'utf-8')).toBe('{ broken')
  })

  it('run-state-v1 포인터인데 private 상태가 손상되면 fail-closed', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()
    writeFileSync(join(dir, RUN_STATE_REL), '{ broken', 'utf-8')
    await autonomyLog({ event: 'complete', runId, interventions: 0 })
    expect(readJsonl(AUTONOMY).map(line => line.event)).toEqual(['start'])
    expect(printed()).toContain('비공개 런 상태가 손상됐습니다')
    expect(process.exitCode).toBe(1)
  })

  it('private 시작 해시는 남았는데 공개 start 기록이 유실되면 legacy 종결로 통과시키지 않는다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()
    expect(readRunState(dir)[runId]?.policyConfigHash).toMatch(/^[a-f0-9]{64}$/)

    // 손상 복구기가 start를 읽지 못하는 상황. private 상태가 새 런이었다는 증거다.
    writeFileSync(join(dir, AUTONOMY), '{ broken\n', 'utf-8')
    await autonomyLog({ event: 'complete', runId, interventions: 0 })

    const lastLine = readFileSync(join(dir, AUTONOMY), 'utf-8').trim().split(/\r?\n/).at(-1)
    expect(lastLine).toBeDefined()
    expect(JSON.parse(lastLine ?? '{}')).toMatchObject({ event: 'blocked', runId, failureKind: 'product' })
    expect(existsSync(join(dir, LEDGER))).toBe(false)
    expect(process.exitCode).toBe(1)
    expect(printed()).toContain('RUN_START_MISSING')
  })

  it('private 시작 해시가 있으면 공개 start의 marker만 제거해도 legacy로 통과시키지 않는다', async () => {
    writePolicy({ schemaVersion: 1, record: true, maxLevel: 'L1' })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()
    const [start] = readJsonl(AUTONOMY)
    delete start.policyConfigSnapshot
    writeFileSync(join(dir, AUTONOMY), `${JSON.stringify(start)}\n`, 'utf-8')
    writePolicy({ schemaVersion: 1, record: true, maxLevel: 'L2' })
    writePolicyBaseline(dir)

    await autonomyLog({ event: 'complete', runId, interventions: 0 })

    expect(readJsonl(AUTONOMY).at(-1)).toMatchObject({ event: 'blocked', runId, failureKind: 'product' })
    expect(existsSync(join(dir, LEDGER))).toBe(false)
    expect(process.exitCode).toBe(1)
    expect(printed()).toContain('RUN_START_MISSING')
  })

  it('private 시작 해시를 남긴 채 marker를 absent로 바꾸고 설정을 지워도 무효다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()
    const [start] = readJsonl(AUTONOMY)
    start.policyConfigSnapshot = 'absent'
    writeFileSync(join(dir, AUTONOMY), `${JSON.stringify(start)}\n`, 'utf-8')
    removeFileSync(join(dir, POLICY))
    writePolicyBaseline(dir)

    await autonomyLog({ event: 'complete', runId, interventions: 0 })

    expect(readJsonl(AUTONOMY).at(-1)).toMatchObject({ event: 'blocked', runId, failureKind: 'product' })
    expect(process.exitCode).toBe(1)
    expect(printed()).toContain('RUN_START_MISSING')
  })

  it('공개 start 원장에는 정책 해시를 쓰지 않고 종결 뒤 private 상태를 정리한다', async () => {
    writePolicy({ schemaVersion: 1, record: false })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()
    const [start] = readJsonl(AUTONOMY)
    expect(start).toMatchObject({ policyConfigSnapshot: 'run-state-v1' })
    expect(start).not.toHaveProperty('policyConfigHash')
    expect(readRunState(dir)[runId]?.policyConfigHash).toMatch(/^[a-f0-9]{64}$/)

    await autonomyLog({ event: 'complete', runId, interventions: 0 })
    expect(readRunState(dir)[runId]).toBeUndefined()
  })
})

describe('record 켜짐 — 종결 직후 level · risk 를 남긴다', () => {
  it('complete: init 라인 + risk 라인, runId·sha 가 종결 라인과 조인된다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'complete', runId: 'fixed-run-id', ticks: 2, interventions: 0 })

    const ledger = readJsonl(LEDGER)
    expect(ledger.map((l) => l.kind)).toEqual(['level', 'risk'])
    expect(ledger[0]).toMatchObject({
      schemaVersion: 1,
      kind: 'level',
      runId: 'fixed-run-id',
      sha: null, // git 레포가 아니라 CLI 가 못 쟀다 — 추측하지 않는다
      from: null,
      to: 'L1',
      transition: 'init',
      reasonCode: 'LEDGER_EMPTY',
      taskKind: 'unknown',
    })
    // 범위를 못 구했으니 human 고정 — 낙관 추정 금지.
    expect(ledger[1]).toMatchObject({ kind: 'risk', riskClass: 'human', derivedFrom: 'none', reasonCode: 'RISK_SCOPE_UNKNOWN', verdict: 'require-human' })
    expect(printed()).toContain('권한 판정 기록')
    expect(process.exitCode).toBe(origExitCode)
  })

  for (const event of ['hardstop', 'blocked'] as const) {
    it(`${event} 도 종결이다 — 같은 규칙으로 남긴다`, async () => {
      writePolicy({ schemaVersion: 1, record: true })
      const { autonomyLog } = await import('../src/commands/agent.js')
      await autonomyLog({ event, runId: 'fixed-run-id' })
      expect(readJsonl(LEDGER).map((l) => l.kind)).toEqual(['level', 'risk'])
    })
  }

  it('판정 대상 런이 늘어야 level 이 또 남는다 — 안 늘면 risk 만 (§4.3)', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    // 1) 판정 불가 런(start sha 없음) 종결 → init 라인 (judgedRuns 0)
    await autonomyLog({ event: 'complete', runId: 'unjudged-1' })
    // 2) 또 판정 불가 런 → level 없음
    await autonomyLog({ event: 'complete', runId: 'unjudged-2' })
    expect(readJsonl(LEDGER).map((l) => l.kind)).toEqual(['level', 'risk', 'risk'])
    expect(printed()).toContain('NO_NEW_JUDGED_RUN')
    // 3) 판정 대상 런(start 에 sha) 종결 → judgedRuns 1 > 0 → hold 라인이 남는다
    seedStart('judged-1')
    await autonomyLog({ event: 'complete', runId: 'judged-1', interventions: 0 })
    const levels = readJsonl(LEDGER).filter((l) => l.kind === 'level')
    expect(levels).toHaveLength(2)
    expect(levels[1]).toMatchObject({ from: 'L1', to: 'L1', transition: 'hold', reasonCode: 'INSUFFICIENT_SAMPLE', judgedRuns: 1, runId: 'judged-1' })
  })
})

describe('③ 집행 0 — 판정 결과가 무엇이든 종결 기록과 명령 결과는 그대로다', () => {
  it('maxLevel:L0(verdict deny) 이어도 종결 라인은 남고 exit 는 성공이다', async () => {
    writePolicy({ schemaVersion: 1, record: true, enforce: true, maxLevel: 'L0' })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'complete', runId: 'fixed-run-id', ticks: 1, interventions: 0 })
    expect(readJsonl(AUTONOMY)[0]).toMatchObject({ event: 'complete', runId: 'fixed-run-id' })
    expect(readJsonl(LEDGER)[0]).toMatchObject({ kind: 'level', to: 'L0', verdict: 'deny' })
    expect(readJsonl(LEDGER)[1]).toMatchObject({ kind: 'risk', verdict: 'require-human' })
    expect(process.exitCode).toBe(origExitCode)
  })
})

describe('④ append 실패는 거짓 성공이 되지 않는다', () => {
  it('원장 경로가 막혀 있으면 종결 기록은 남되 exit 1 + 실패 출력', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    // 원장 경로를 디렉터리로 막아 appendFileSync 가 던지게 한다.
    mkdirSync(join(dir, LEDGER), { recursive: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await expect(autonomyLog({ event: 'complete', runId: 'fixed-run-id' })).resolves.toBeUndefined()
    expect(readJsonl(AUTONOMY)).toHaveLength(1)
    expect(process.exitCode).toBe(1)
    expect(printed()).toContain('권한 판정 원장 기록 실패')
    expect(printed()).not.toContain(dir)
  })

  it('private 상태가 없는 manual 종결도 원장 장애를 고친 뒤 같은 terminal로 보충한다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    mkdirSync(join(dir, LEDGER), { recursive: true })
    const { autonomyLog } = await import('../src/commands/agent.js')

    await autonomyLog({ event: 'complete', runId: 'manual-retry' })
    expect(process.exitCode).toBe(1)
    expect(readJsonl(AUTONOMY)).toHaveLength(1)
    expect(readJsonl(AUTONOMY)[0]).toMatchObject({
      policyRecordExpected: true,
      policyRecordSnapshot: 'terminal-v1',
    })
    expect(readRunState(dir)['manual-retry']).toMatchObject({
      policySnapshotOrigin: 'terminal-v1',
    })

    removeDirSync(join(dir, LEDGER))
    process.exitCode = origExitCode
    await autonomyLog({ event: 'complete', runId: 'manual-retry' })

    expect(readJsonl(AUTONOMY)).toHaveLength(1)
    expect(readJsonl(LEDGER).map(line => line.kind)).toEqual(['level', 'risk'])
    expect(readRunState(dir)['manual-retry']).toBeUndefined()
    expect(process.exitCode).toBe(origExitCode)
  })

  it('run-state-v1 start의 unmarked terminal도 현재 gate가 켜져 있으면 원장을 보충한다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()
    seedUnmarkedTerminal(runId)

    await autonomyLog({ event: 'complete', runId, ticks: 9, interventions: 7 })

    expect(readJsonl(AUTONOMY)).toHaveLength(2)
    expect(readJsonl(LEDGER).map(line => line.kind)).toEqual(['level', 'risk'])
    expect(readRunState(dir)[runId]).toBeUndefined()
    expect(process.exitCode).toBe(origExitCode)
  })

  it('unmarked manual terminal의 backfill 실패는 최초 snapshot을 고정하고 policy off에도 의무를 보존한다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    seedUnmarkedTerminal('manual-unmarked-retry')
    mkdirSync(join(dir, LEDGER), { recursive: true })
    const { autonomyLog } = await import('../src/commands/agent.js')

    await autonomyLog({
      event: 'complete',
      runId: 'manual-unmarked-retry',
      ticks: 9,
      interventions: 7,
    })

    expect(process.exitCode).toBe(1)
    const prepared = readRunState(dir)['manual-unmarked-retry']
    expect(prepared).toMatchObject({
      policyConfigHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      policySnapshotOrigin: 'terminal-v1',
      policyRecordPending: true,
      policyRecordLegacyBackfill: true,
      policyRiskExpected: {
        sha: null,
        taskKind: 'unknown',
      },
      terminalRequestExpected: {
        ts: '2026-08-27T01:00:00.000Z',
        event: 'complete',
        ticks: 2,
        interventions: 1,
      },
    })

    removeDirSync(join(dir, LEDGER))
    writePolicy({ schemaVersion: 1, record: false, enforce: false })
    process.exitCode = origExitCode
    await autonomyLog({ event: 'complete', runId: 'manual-unmarked-retry' })

    expect(process.exitCode).toBe(1)
    expect(existsSync(join(dir, LEDGER))).toBe(false)
    expect(readRunState(dir)['manual-unmarked-retry']).toEqual(prepared)

    writePolicy({ schemaVersion: 1, record: true })
    process.exitCode = origExitCode
    await autonomyLog({ event: 'complete', runId: 'manual-unmarked-retry' })

    expect(readJsonl(LEDGER).map(line => line.kind)).toEqual(['level', 'risk'])
    expect(readRunState(dir)['manual-unmarked-retry']).toBeUndefined()
    expect(process.exitCode).toBe(origExitCode)
  })

  it('pending 명시 blocked terminal을 complete로 바꿔 재시도하지 못한다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()
    mkdirSync(join(dir, LEDGER), { recursive: true })

    await autonomyLog({ event: 'blocked', runId, failureKind: 'product' })
    expect(process.exitCode).toBe(1)
    expect(readRunState(dir)[runId]?.terminalRequestExpected).toMatchObject({
      event: 'blocked',
      policyInvalidated: false,
    })

    removeDirSync(join(dir, LEDGER))
    process.exitCode = origExitCode
    await autonomyLog({ event: 'complete', runId })

    expect(process.exitCode).toBe(1)
    expect(existsSync(join(dir, LEDGER))).toBe(false)
    expect(readRunState(dir)[runId]?.policyRecordPending).toBe(true)
    expect(readJsonl(AUTONOMY).map(line => line.event)).toEqual(['start', 'blocked'])
    expect(printed()).toContain('이미 blocked로 종결된 runId는 complete로 바꿀 수 없습니다')
  })

  it('start 없는 invalid manual complete는 request를 고정해 rebaseline 후 신규 정책 backfill을 막는다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    writeFileSync(join(dir, '.vhk', 'policy-baseline.json'), '{ broken', 'utf-8')
    const { autonomyLog } = await import('../src/commands/agent.js')

    await autonomyLog({
      event: 'complete',
      runId: 'manual-invalid-request',
      ticks: 3,
      interventions: 1,
    })

    expect(process.exitCode).toBe(1)
    expect(readJsonl(AUTONOMY)).toHaveLength(1)
    expect(readJsonl(AUTONOMY)[0]).toMatchObject({
      event: 'blocked',
      failureKind: 'product',
    })
    const invalidRequest = readRunState(dir)['manual-invalid-request']
    expect(invalidRequest?.terminalRequestExpected).toMatchObject({
      event: 'complete',
      policyInvalidated: true,
      ticks: 3,
      interventions: 1,
    })

    writePolicyBaseline(dir)
    process.exitCode = origExitCode
    await autonomyLog({
      event: 'complete',
      runId: 'manual-invalid-request',
      ticks: 9,
      interventions: 7,
    })

    expect(process.exitCode).toBe(1)
    expect(existsSync(join(dir, LEDGER))).toBe(false)
    expect(readJsonl(AUTONOMY)).toHaveLength(1)
    expect(readRunState(dir)['manual-invalid-request']).toEqual(invalidRequest)
    expect(printed()).toContain('이후 정책을 신규 승인처럼 사용해 원장을 보충하지 않습니다')
  })

  it('start 없는 invalid manual의 terminal append 재시도 성공 뒤에도 request pin을 보존한다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    writeFileSync(join(dir, '.vhk', 'policy-baseline.json'), '{ broken', 'utf-8')
    const { autonomyLog } = await import('../src/commands/agent.js')
    const runId = 'manual-invalid-append-retry'

    autonomyAppendFailure.runId = runId
    await autonomyLog({
      event: 'complete',
      runId,
      ticks: 3,
      interventions: 1,
    })

    expect(process.exitCode).toBe(1)
    expect(readJsonl(AUTONOMY)).toEqual([])
    const invalidRequest = readRunState(dir)[runId]
    expect(invalidRequest?.terminalRequestExpected).toMatchObject({
      event: 'complete',
      policyInvalidated: true,
      ticks: 3,
      interventions: 1,
    })

    autonomyAppendFailure.runId = null
    process.exitCode = origExitCode
    await autonomyLog({
      event: 'complete',
      runId,
      ticks: 9,
      interventions: 7,
    })

    expect(process.exitCode).toBe(1)
    expect(readJsonl(AUTONOMY)).toHaveLength(1)
    expect(readJsonl(AUTONOMY)[0]).toMatchObject({
      event: 'blocked',
      failureKind: 'product',
      ticks: 3,
      interventions: 1,
    })
    expect(readRunState(dir)[runId]).toEqual(invalidRequest)

    writePolicyBaseline(dir)
    process.exitCode = origExitCode
    await autonomyLog({ event: 'complete', runId })

    expect(process.exitCode).toBe(1)
    expect(existsSync(join(dir, LEDGER))).toBe(false)
    expect(readJsonl(AUTONOMY)).toHaveLength(1)
    expect(readRunState(dir)[runId]).toEqual(invalidRequest)
    expect(printed()).toContain('이후 정책을 신규 승인처럼 사용해 원장을 보충하지 않습니다')
  })

  it('unmarked legacy blocked/product backfill이 성공해도 실패 exit 상태를 유지한다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    seedUnmarkedTerminal('legacy-blocked-product', {
      event: 'blocked',
      failureKind: 'product',
    })
    const { autonomyLog } = await import('../src/commands/agent.js')

    await autonomyLog({
      event: 'blocked',
      runId: 'legacy-blocked-product',
      failureKind: 'product',
    })

    expect(readJsonl(LEDGER).map(line => line.kind)).toEqual(['level', 'risk'])
    expect(readRunState(dir)['legacy-blocked-product']).toBeUndefined()
    expect(process.exitCode).toBe(1)
  })

  it('manual 종결의 미완료 기록 의무는 정책 손상·off 변경으로 사라지지 않는다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    mkdirSync(join(dir, LEDGER), { recursive: true })
    const { autonomyLog } = await import('../src/commands/agent.js')

    await autonomyLog({ event: 'complete', runId: 'manual-policy-lost' })
    expect(process.exitCode).toBe(1)
    expect(readJsonl(AUTONOMY)[0]).toMatchObject({ policyRecordExpected: true })

    removeDirSync(join(dir, LEDGER))
    writePolicy({ schemaVersion: 1, record: false, enforce: false })
    process.exitCode = origExitCode
    await autonomyLog({ event: 'complete', runId: 'manual-policy-lost' })

    expect(process.exitCode).toBe(1)
    expect(readJsonl(AUTONOMY)).toHaveLength(1)
    expect(existsSync(join(dir, LEDGER))).toBe(false)
    expect(printed()).toContain('성공으로 재사용하지 않습니다')
  })

  it('manual pending은 record:true를 유지한 정책 내용 변경·재고정에도 최초 해시로 닫힌다', async () => {
    writePolicy({ schemaVersion: 1, record: true, maxLevel: 'L1' })
    mkdirSync(join(dir, LEDGER), { recursive: true })
    const { autonomyLog } = await import('../src/commands/agent.js')

    await autonomyLog({ event: 'complete', runId: 'manual-hash-pinned' })
    expect(process.exitCode).toBe(1)
    const originalHash = readRunState(dir)['manual-hash-pinned']?.policyConfigHash

    removeDirSync(join(dir, LEDGER))
    writePolicy({ schemaVersion: 1, record: true, maxLevel: 'L2' })
    writePolicyBaseline(dir)
    process.exitCode = origExitCode
    await autonomyLog({ event: 'complete', runId: 'manual-hash-pinned' })

    expect(process.exitCode).toBe(1)
    expect(readJsonl(AUTONOMY)).toHaveLength(1)
    expect(existsSync(join(dir, LEDGER))).toBe(false)
    expect(readRunState(dir)['manual-hash-pinned']?.policyConfigHash).toBe(originalHash)
  })

  it('필드 없는 legacy run-state도 첫 manual terminal에서 private pending snapshot으로 승격한다', async () => {
    writePolicy({ schemaVersion: 1, record: true, maxLevel: 'L1' })
    mkdirSync(join(dir, '.vhk'), { recursive: true })
    writeFileSync(join(dir, RUN_STATE_REL), JSON.stringify({
      'legacy-private': {
        startedAtUtc: '2026-08-27T00:00:00.000Z',
        commandCount: 0,
        lastSeenUtc: '2026-08-27T00:00:00.000Z',
        clockAnomaly: false,
      },
    }) + '\n', 'utf-8')
    mkdirSync(join(dir, LEDGER), { recursive: true })
    const { autonomyLog } = await import('../src/commands/agent.js')

    await autonomyLog({ event: 'complete', runId: 'legacy-private' })

    expect(process.exitCode).toBe(1)
    expect(readJsonl(AUTONOMY)[0]).toMatchObject({
      policyRecordExpected: true,
      policyRecordSnapshot: 'terminal-v1',
    })
    expect(readRunState(dir)['legacy-private']).toMatchObject({
      policySnapshotOrigin: 'terminal-v1',
      policyRecordPending: true,
    })
  })

  it('정책 원장 실패 때 private 상태를 보존하고 재시도 성공 뒤에만 정리한다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()
    mkdirSync(join(dir, LEDGER), { recursive: true })

    await autonomyLog({ event: 'complete', runId, interventions: 0 })
    expect(readRunState(dir)[runId]).toBeDefined()
    expect(readJsonl(AUTONOMY)).toHaveLength(2)
    expect(readJsonl(AUTONOMY).at(-1)).toMatchObject({ policyRecordExpected: true })
    expect(process.exitCode).toBe(1)

    removeDirSync(join(dir, LEDGER))
    process.exitCode = origExitCode
    await autonomyLog({ event: 'complete', runId, interventions: 0 })

    expect(readJsonl(LEDGER).map((line) => line.kind)).toEqual(['level', 'risk'])
    expect(readJsonl(AUTONOMY)).toHaveLength(2)
    expect(readRunState(dir)[runId]).toBeUndefined()
    const stats = calcAutonomyStats(readAutonomyLog(dir))
    expect(stats).toMatchObject({ starts: 1, complete: 1, selfReportedRate: 1 })
    expect(process.exitCode).toBe(origExitCode)
  })

  it('terminal append 전 중단 뒤 같은 SHA 재시도는 최초 private 판정을 이어 쓴다', async () => {
    runGit(['init', '--quiet'])
    writeFileSync(join(dir, 'README.md'), '# before\n', 'utf-8')
    runGit(['add', 'README.md'])
    runGit([
      '-c', 'user.name=VHK Test',
      '-c', 'user.email=opensource@yohanstudio.co',
      'commit', '--quiet', '-m', 'test: base',
    ])
    writePolicy({ schemaVersion: 1, record: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()

    writeFileSync(join(dir, 'README.md'), '# after\n', 'utf-8')
    runGit(['add', 'README.md'])
    runGit([
      '-c', 'user.name=VHK Test',
      '-c', 'user.email=opensource@yohanstudio.co',
      'commit', '--quiet', '-m', 'test: docs change',
    ])
    const terminalSha = spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: dir,
      encoding: 'utf-8',
    }).stdout.trim()

    // 프로세스 강제 종료는 같은 프로세스에서 포착할 수 없으므로, private pin 내구화 직후이자
    // 공개 terminal append 직전의 정확한 상태를 심는다. 이후 Git 범위 재유도도 실패시킨다.
    const rawState = JSON.parse(readFileSync(join(dir, RUN_STATE_REL), 'utf-8')) as Record<
      string,
      Record<string, unknown>
    >
    rawState[runId] = {
      ...rawState[runId],
      policyRecordPending: true,
      policyRiskExpected: {
        sha: terminalSha,
        taskKind: 'docs',
        riskClass: 'auto',
        verdict: 'allow',
        reasonCode: 'RISK_AUTO_KIND',
        unclassifiedPaths: 0,
        derivedFrom: 'paths',
      },
      terminalRequestExpected: {
        ts: '2026-08-27T00:01:00.000Z',
        event: 'complete',
        policyInvalidated: false,
        interventions: 0,
      },
    }
    writeFileSync(join(dir, RUN_STATE_REL), `${JSON.stringify(rawState, null, 2)}\n`, 'utf-8')
    const entries = readJsonl(AUTONOMY)
    entries[0]!.sha = 'missing-commit-object'
    writeFileSync(
      join(dir, AUTONOMY),
      `${entries.map(entry => JSON.stringify(entry)).join('\n')}\n`,
      'utf-8',
    )

    await autonomyLog({ event: 'complete', runId, interventions: 0 })

    expect(process.exitCode).toBe(origExitCode)
    expect(readJsonl(AUTONOMY).at(-1)).toMatchObject({
      event: 'complete',
      sha: terminalSha,
      taskKind: 'docs',
      policyRecordExpected: true,
    })
    expect(readJsonl(LEDGER).at(-1)).toMatchObject({
      kind: 'risk',
      sha: terminalSha,
      taskKind: 'docs',
      riskClass: 'auto',
      verdict: 'allow',
    })
    expect(readRunState(dir)[runId]).toBeUndefined()
  })

  it('terminal append 전 고정한 종료 종류는 같은 runId의 complete가 바꾸지 못한다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()
    const rawState = JSON.parse(readFileSync(join(dir, RUN_STATE_REL), 'utf-8')) as Record<
      string,
      Record<string, unknown>
    >
    rawState[runId] = {
      ...rawState[runId],
      policyRecordPending: true,
      policyRiskExpected: {
        sha: null,
        taskKind: 'unknown',
        riskClass: 'human',
        verdict: 'require-human',
        reasonCode: 'RISK_SCOPE_UNKNOWN',
        unclassifiedPaths: 0,
        derivedFrom: 'none',
      },
      terminalRequestExpected: {
        ts: '2026-08-27T00:01:00.000Z',
        event: 'hardstop',
        policyInvalidated: false,
        reviewRejected: true,
        failureKind: 'infra',
      },
    }
    writeFileSync(join(dir, RUN_STATE_REL), `${JSON.stringify(rawState, null, 2)}\n`, 'utf-8')

    await autonomyLog({ event: 'complete', runId, interventions: 0 })

    expect(process.exitCode).toBe(1)
    expect(readJsonl(AUTONOMY)).toHaveLength(1)
    expect(existsSync(join(dir, LEDGER))).toBe(false)
    expect(readRunState(dir)[runId]?.terminalRequestExpected).toMatchObject({
      event: 'hardstop',
      failureKind: 'infra',
    })
    expect(printed()).toContain('현재 종료 종류가 달라')
  })

  it('같은 종료 종류 재시도는 최초 failureKind와 계측값을 이어 쓴다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()
    const rawState = JSON.parse(readFileSync(join(dir, RUN_STATE_REL), 'utf-8')) as Record<
      string,
      Record<string, unknown>
    >
    rawState[runId] = {
      ...rawState[runId],
      policyRecordPending: true,
      policyRiskExpected: {
        sha: null,
        taskKind: 'unknown',
        riskClass: 'human',
        verdict: 'require-human',
        reasonCode: 'RISK_SCOPE_UNKNOWN',
        unclassifiedPaths: 0,
        derivedFrom: 'none',
      },
      terminalRequestExpected: {
        ts: '2026-08-27T00:01:00.000Z',
        event: 'blocked',
        policyInvalidated: false,
        ticks: 2,
        interventions: 1,
        failureKind: 'infra',
      },
    }
    writeFileSync(join(dir, RUN_STATE_REL), `${JSON.stringify(rawState, null, 2)}\n`, 'utf-8')

    await autonomyLog({
      event: 'blocked',
      runId,
      ticks: 9,
      interventions: 7,
      failureKind: 'product',
    })

    expect(process.exitCode).toBe(origExitCode)
    expect(readJsonl(AUTONOMY).at(-1)).toMatchObject({
      event: 'blocked',
      ticks: 2,
      interventions: 1,
      failureKind: 'infra',
    })
    expect(readRunState(dir)[runId]).toBeUndefined()
  })

  it('필수 필드가 빠진 risk 라인은 pending 종결의 완료 증거가 아니다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()
    mkdirSync(join(dir, LEDGER), { recursive: true })

    await autonomyLog({ event: 'complete', runId, interventions: 0 })
    expect(process.exitCode).toBe(1)
    removeDirSync(join(dir, LEDGER))
    writeFileSync(
      join(dir, LEDGER),
      JSON.stringify({ schemaVersion: 1, kind: 'risk', runId }) + '\n',
      'utf-8',
    )
    process.exitCode = origExitCode

    await autonomyLog({ event: 'complete', runId, interventions: 0 })

    const ledger = readJsonl(LEDGER)
    expect(ledger.map(line => line.kind)).toEqual(['risk', 'level', 'risk'])
    expect(ledger.at(-1)).toMatchObject({
      runId,
      verdict: 'require-human',
      riskClass: 'human',
      derivedFrom: 'none',
    })
    expect(readRunState(dir)[runId]).toBeUndefined()
    expect(process.exitCode).toBe(origExitCode)
  })

  it('taskKind와 모순된 risk 라인은 pending 의무를 지우지 않고 올바른 판정을 보충한다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()
    mkdirSync(join(dir, LEDGER), { recursive: true })

    await autonomyLog({ event: 'complete', runId, interventions: 0 })
    expect(process.exitCode).toBe(1)
    removeDirSync(join(dir, LEDGER))
    writeFileSync(join(dir, LEDGER), `${JSON.stringify({
      schemaVersion: 1,
      ts: '2026-08-27T00:00:00.000Z',
      kind: 'risk',
      runId,
      sha: null,
      taskKind: 'security',
      riskClass: 'auto',
      verdict: 'allow',
      reasonCode: 'RISK_AUTO_KIND',
      unclassifiedPaths: 0,
      derivedFrom: 'paths',
    })}\n`, 'utf-8')
    process.exitCode = origExitCode

    await autonomyLog({ event: 'complete', runId, interventions: 0 })

    const ledger = readJsonl(LEDGER)
    expect(ledger.map(line => line.kind)).toEqual(['risk', 'level', 'risk'])
    expect(ledger.at(-1)).toMatchObject({
      runId,
      taskKind: 'unknown',
      riskClass: 'human',
      verdict: 'require-human',
      reasonCode: 'RISK_SCOPE_UNKNOWN',
    })
    expect(readRunState(dir)[runId]).toBeUndefined()
    expect(process.exitCode).toBe(origExitCode)
  })

  it('pending 재시도는 현재 재분류 대신 최초 private risk 스냅샷을 그대로 쓴다', async () => {
    runGit(['init', '--quiet'])
    writeFileSync(join(dir, 'README.md'), '# before\n', 'utf-8')
    runGit(['add', 'README.md'])
    runGit([
      '-c', 'user.name=VHK Test',
      '-c', 'user.email=opensource@yohanstudio.co',
      'commit', '--quiet', '-m', 'test: base',
    ])
    writePolicy({ schemaVersion: 1, record: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()

    writeFileSync(join(dir, 'README.md'), '# after\n', 'utf-8')
    runGit(['add', 'README.md'])
    runGit([
      '-c', 'user.name=VHK Test',
      '-c', 'user.email=opensource@yohanstudio.co',
      'commit', '--quiet', '-m', 'test: docs change',
    ])
    mkdirSync(join(dir, LEDGER), { recursive: true })
    await autonomyLog({ event: 'complete', runId, interventions: 0 })
    expect(readJsonl(AUTONOMY).at(-1)).toMatchObject({ taskKind: 'docs' })
    const pending = readRunState(dir)[runId]
    expect(pending?.policyRiskExpected).toMatchObject({
      taskKind: 'docs',
      riskClass: 'auto',
      unclassifiedPaths: 0,
      derivedFrom: 'paths',
    })
    expect(process.exitCode).toBe(1)

    removeDirSync(join(dir, LEDGER))
    const rawState = JSON.parse(readFileSync(join(dir, RUN_STATE_REL), 'utf-8')) as Record<
      string,
      Record<string, unknown>
    >
    rawState[runId]!.policyRiskExpected = {
      ...(rawState[runId]!.policyRiskExpected as Record<string, unknown>),
      riskClass: 'human',
      verdict: 'require-human',
      reasonCode: 'RISK_UNCLASSIFIED_PATH',
      unclassifiedPaths: 1,
    }
    writeFileSync(join(dir, RUN_STATE_REL), `${JSON.stringify(rawState, null, 2)}\n`, 'utf-8')
    const entries = readJsonl(AUTONOMY)
    entries[0]!.sha = 'missing-commit-object'
    writeFileSync(
      join(dir, AUTONOMY),
      `${entries.map(entry => JSON.stringify(entry)).join('\n')}\n`,
      'utf-8',
    )
    process.exitCode = origExitCode

    await autonomyLog({ event: 'complete', runId, interventions: 0 })

    expect(process.exitCode).toBe(origExitCode)
    expect(readJsonl(LEDGER).at(-1)).toMatchObject({
      taskKind: 'docs',
      riskClass: 'human',
      verdict: 'require-human',
      reasonCode: 'RISK_UNCLASSIFIED_PATH',
      unclassifiedPaths: 1,
      derivedFrom: 'paths',
    })
    expect(readRunState(dir)[runId]).toBeUndefined()
  })

  it.each([
    { label: '정책 기본-off', record: false },
    { label: '판정 기록 완료', record: true },
  ])('$label terminal은 나중에 Git 범위를 못 읽어도 멱등 재호출된다', async ({ record }) => {
    runGit(['init', '--quiet'])
    writeFileSync(join(dir, 'README.md'), '# before\n', 'utf-8')
    runGit(['add', 'README.md'])
    runGit([
      '-c', 'user.name=VHK Test',
      '-c', 'user.email=opensource@yohanstudio.co',
      'commit', '--quiet', '-m', 'test: base',
    ])
    if (record) writePolicy({ schemaVersion: 1, record: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()

    writeFileSync(join(dir, 'README.md'), '# after\n', 'utf-8')
    runGit(['add', 'README.md'])
    runGit([
      '-c', 'user.name=VHK Test',
      '-c', 'user.email=opensource@yohanstudio.co',
      'commit', '--quiet', '-m', 'test: docs change',
    ])
    await autonomyLog({ event: 'complete', runId, interventions: 0 })
    expect(process.exitCode).toBe(origExitCode)
    expect(readRunState(dir)[runId]).toBeUndefined()
    expect(existsSync(join(dir, LEDGER))).toBe(record)

    const entries = readJsonl(AUTONOMY)
    entries[0]!.sha = 'missing-commit-object'
    writeFileSync(
      join(dir, AUTONOMY),
      `${entries.map(entry => JSON.stringify(entry)).join('\n')}\n`,
      'utf-8',
    )

    await autonomyLog({ event: 'complete', runId, interventions: 0 })

    expect(process.exitCode).toBe(origExitCode)
    expect(readJsonl(AUTONOMY)).toHaveLength(2)
    expect(printed()).toContain('런 종결 기록 재사용')
  })

  it('신형 pending terminal의 SHA·taskKind가 유실되면 legacy로 강등하지 않는다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()
    mkdirSync(join(dir, LEDGER), { recursive: true })

    await autonomyLog({ event: 'complete', runId, interventions: 0 })
    expect(process.exitCode).toBe(1)
    removeDirSync(join(dir, LEDGER))
    const entries = readJsonl(AUTONOMY)
    const terminal = entries.at(-1)!
    delete terminal.sha
    delete terminal.taskKind
    writeFileSync(
      join(dir, AUTONOMY),
      `${entries.map(entry => JSON.stringify(entry)).join('\n')}\n`,
      'utf-8',
    )
    process.exitCode = origExitCode

    await autonomyLog({ event: 'complete', runId, interventions: 0 })

    expect(process.exitCode).toBe(1)
    expect(existsSync(join(dir, LEDGER))).toBe(false)
    expect(readRunState(dir)[runId]).toBeDefined()
    expect(printed()).toContain('SHA 또는 작업 유형이 손상됐습니다')
  })

  it('신형 pending의 private risk 스냅샷이 유실되면 현재 규칙으로 다시 추정하지 않는다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()
    mkdirSync(join(dir, LEDGER), { recursive: true })

    await autonomyLog({ event: 'complete', runId, interventions: 0 })
    expect(process.exitCode).toBe(1)
    removeDirSync(join(dir, LEDGER))
    const rawState = JSON.parse(readFileSync(join(dir, RUN_STATE_REL), 'utf-8')) as Record<
      string,
      Record<string, unknown>
    >
    delete rawState[runId]!.policyRiskExpected
    writeFileSync(join(dir, RUN_STATE_REL), `${JSON.stringify(rawState, null, 2)}\n`, 'utf-8')
    process.exitCode = origExitCode

    await autonomyLog({ event: 'complete', runId, interventions: 0 })

    expect(process.exitCode).toBe(1)
    expect(existsSync(join(dir, LEDGER))).toBe(false)
    expect(readRunState(dir)[runId]).toBeDefined()
    expect(printed()).toContain('최초 위험도 판정 또는 종료 요청 스냅샷이 없습니다')
  })

  it('terminal append 전 pending의 private 준비값이 모두 유실돼도 현재 입력으로 재생성하지 않는다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()
    const rawState = JSON.parse(readFileSync(join(dir, RUN_STATE_REL), 'utf-8')) as Record<
      string,
      Record<string, unknown>
    >
    rawState[runId]!.policyRecordPending = true
    delete rawState[runId]!.policyRiskExpected
    delete rawState[runId]!.terminalRequestExpected
    writeFileSync(join(dir, RUN_STATE_REL), `${JSON.stringify(rawState, null, 2)}\n`, 'utf-8')

    await autonomyLog({ event: 'complete', runId, interventions: 0 })

    expect(process.exitCode).toBe(1)
    expect(readJsonl(AUTONOMY)).toHaveLength(1)
    expect(existsSync(join(dir, LEDGER))).toBe(false)
    expect(readRunState(dir)[runId]?.policyRecordPending).toBe(true)
    expect(printed()).toContain('최초 종결 준비 정보가 불완전합니다')
  })

  it('manual pre-terminal 준비값이 손상되면 현재 complete로 새로 만들지 않는다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    mkdirSync(join(dir, LEDGER), { recursive: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'hardstop', runId: 'manual-corrupt', failureKind: 'infra' })
    expect(process.exitCode).toBe(1)

    // 공개 terminal append 직전 종료 상태를 재현하고, 최초 hardstop 요청의 시각만 손상시킨다.
    writeFileSync(join(dir, AUTONOMY), '', 'utf-8')
    removeDirSync(join(dir, LEDGER))
    const rawState = JSON.parse(readFileSync(join(dir, RUN_STATE_REL), 'utf-8')) as Record<
      string,
      Record<string, unknown>
    >
    const prepared = rawState['manual-corrupt']!.terminalRequestExpected as Record<string, unknown>
    delete prepared.ts
    writeFileSync(join(dir, RUN_STATE_REL), `${JSON.stringify(rawState, null, 2)}\n`, 'utf-8')
    process.exitCode = origExitCode

    await autonomyLog({ event: 'start' })
    expect(process.exitCode).toBe(1)
    expect(readJsonl(AUTONOMY)).toEqual([])
    const afterOtherStart = JSON.parse(readFileSync(join(dir, RUN_STATE_REL), 'utf-8')) as Record<
      string,
      Record<string, unknown>
    >
    expect(afterOtherStart['manual-corrupt']?.terminalRequestExpected).toMatchObject({
      event: 'hardstop',
      failureKind: 'infra',
    })
    process.exitCode = origExitCode

    await autonomyLog({ event: 'complete', runId: 'manual-corrupt', interventions: 0 })

    expect(process.exitCode).toBe(1)
    expect(readJsonl(AUTONOMY)).toEqual([])
    expect(existsSync(join(dir, LEDGER))).toBe(false)
    expect(printed()).toContain('비공개 런 상태가 손상됐습니다')
    const preserved = JSON.parse(readFileSync(join(dir, RUN_STATE_REL), 'utf-8')) as Record<
      string,
      Record<string, unknown>
    >
    expect(preserved['manual-corrupt']?.terminalRequestExpected).toMatchObject({
      event: 'hardstop',
      failureKind: 'infra',
    })
  })

  it('pending 공개 terminal의 계측·failureKind 변조는 정책 원장 보충을 막는다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()
    mkdirSync(join(dir, LEDGER), { recursive: true })
    await autonomyLog({ event: 'complete', runId, ticks: 2, interventions: 0 })
    expect(process.exitCode).toBe(1)

    removeDirSync(join(dir, LEDGER))
    const lines = readJsonl(AUTONOMY)
    lines[1]!.ts = '2099-01-01T00:00:00.000Z'
    lines[1]!.interventions = 7
    lines[1]!.failureKind = 'infra'
    writeFileSync(
      join(dir, AUTONOMY),
      `${lines.map(line => JSON.stringify(line)).join('\n')}\n`,
      'utf-8',
    )
    process.exitCode = origExitCode

    await autonomyLog({ event: 'complete', runId, ticks: 2, interventions: 0 })

    expect(process.exitCode).toBe(1)
    expect(existsSync(join(dir, LEDGER))).toBe(false)
    expect(readRunState(dir)[runId]).toBeDefined()
    expect(printed()).toContain('공개 종결 기록이 비공개 최초 종료 요청과 일치하지 않습니다')
  })

  it('정책 원장 실패 뒤 private 상태까지 유실되면 종결 기록을 성공으로 재사용하지 않는다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()
    mkdirSync(join(dir, LEDGER), { recursive: true })

    await autonomyLog({ event: 'complete', runId, interventions: 0 })
    expect(process.exitCode).toBe(1)
    writeFileSync(join(dir, RUN_STATE_REL), '{}\n', 'utf-8')
    removeDirSync(join(dir, LEDGER))
    process.exitCode = origExitCode

    await autonomyLog({ event: 'complete', runId, interventions: 0 })

    expect(process.exitCode).toBe(1)
    expect(existsSync(join(dir, LEDGER))).toBe(false)
    expect(readJsonl(AUTONOMY).map(line => line.event)).toEqual(['start', 'complete'])
    expect(printed()).toContain('최초 정책 증거를 안전하게 재사용할 수 없습니다')
  })

  it('start-backed pending은 private 상태와 공개 start marker가 함께 유실돼도 legacy로 강등하지 않는다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()
    mkdirSync(join(dir, LEDGER), { recursive: true })

    await autonomyLog({ event: 'complete', runId, interventions: 0 })
    expect(process.exitCode).toBe(1)
    const lines = readJsonl(AUTONOMY)
    delete lines[0].policyConfigSnapshot
    writeFileSync(
      join(dir, AUTONOMY),
      lines.map(line => JSON.stringify(line)).join('\n') + '\n',
      'utf-8',
    )
    writeFileSync(join(dir, RUN_STATE_REL), '{}\n', 'utf-8')
    removeDirSync(join(dir, LEDGER))
    process.exitCode = origExitCode

    await autonomyLog({ event: 'complete', runId, interventions: 0 })

    expect(process.exitCode).toBe(1)
    expect(existsSync(join(dir, LEDGER))).toBe(false)
    expect(readJsonl(AUTONOMY)).toHaveLength(2)
    expect(printed()).toContain('최초 정책 증거를 안전하게 재사용할 수 없습니다')
  })

  it('pending terminal의 공개 의무 필드를 지워도 private marker가 성공 재사용을 막는다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()
    mkdirSync(join(dir, LEDGER), { recursive: true })

    await autonomyLog({ event: 'complete', runId, interventions: 0 })
    expect(process.exitCode).toBe(1)
    const lines = readJsonl(AUTONOMY)
    delete lines[1].policyRecordExpected
    delete lines[1].policyRecordSnapshot
    writeFileSync(
      join(dir, AUTONOMY),
      lines.map(line => JSON.stringify(line)).join('\n') + '\n',
      'utf-8',
    )
    removeDirSync(join(dir, LEDGER))
    process.exitCode = origExitCode

    await autonomyLog({ event: 'complete', runId, interventions: 0 })

    expect(process.exitCode).toBe(1)
    expect(existsSync(join(dir, LEDGER))).toBe(false)
    expect(readRunState(dir)[runId]?.policyRecordPending).toBe(true)
    expect(printed()).toContain('최초 정책 증거를 안전하게 재사용할 수 없습니다')
  })

  it('원장 실패 뒤 다른 terminal 이벤트로 재시도하면 기존 종결을 바꾸지 않는다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()
    mkdirSync(join(dir, LEDGER), { recursive: true })
    await autonomyLog({ event: 'complete', runId, interventions: 0 })
    removeDirSync(join(dir, LEDGER))
    process.exitCode = origExitCode

    await autonomyLog({ event: 'blocked', runId })

    expect(readJsonl(AUTONOMY).map(line => line.event)).toEqual(['start', 'complete'])
    expect(existsSync(join(dir, LEDGER))).toBe(false)
    expect(readRunState(dir)[runId]).toBeDefined()
    expect(process.exitCode).toBe(1)
  })

  it('같은 runId를 두 프로세스가 동시에 complete해도 terminal과 risk는 한 번만 남긴다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()
    const moduleHref = pathToFileURL(join(origCwd, 'src', 'commands', 'agent.ts')).href
    const child = (): Promise<void> => new Promise((resolve, reject) => {
      const source = [
        `process.chdir(${JSON.stringify(dir)})`,
        `const { autonomyLog } = await import(${JSON.stringify(moduleHref)})`,
        `await autonomyLog({ event: 'complete', runId: ${JSON.stringify(runId)}, interventions: 0 })`,
        'if (process.exitCode) process.exit(process.exitCode)',
      ].join(';')
      const proc = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], {
        cwd: origCwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stderr = ''
      proc.stderr.setEncoding('utf-8')
      proc.stderr.on('data', (chunk: string) => { stderr += chunk })
      proc.on('error', reject)
      proc.on('exit', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`autonomy complete child failed (${code}): ${stderr}`))
      })
    })

    await Promise.all([child(), child()])

    expect(readJsonl(AUTONOMY).map(line => line.event)).toEqual(['start', 'complete'])
    expect(readJsonl(LEDGER).map(line => line.kind)).toEqual(['level', 'risk'])
    expect(readRunState(dir)[runId]).toBeUndefined()
  }, 20_000)

  it('정책 설정이 없는 runId도 두 프로세스의 동시 complete를 한 줄로 직렬화한다', async () => {
    const { autonomyLog } = await import('../src/commands/agent.js')
    await autonomyLog({ event: 'start' })
    const runId = latestStartRunId()
    const moduleHref = pathToFileURL(join(origCwd, 'src', 'commands', 'agent.ts')).href
    const child = (): Promise<void> => new Promise((resolve, reject) => {
      const source = [
        `process.chdir(${JSON.stringify(dir)})`,
        `const { autonomyLog } = await import(${JSON.stringify(moduleHref)})`,
        `await autonomyLog({ event: 'complete', runId: ${JSON.stringify(runId)}, interventions: 0 })`,
        'if (process.exitCode) process.exit(process.exitCode)',
      ].join(';')
      const proc = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], {
        cwd: origCwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stderr = ''
      proc.stderr.setEncoding('utf-8')
      proc.stderr.on('data', (chunk: string) => { stderr += chunk })
      proc.on('error', reject)
      proc.on('exit', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`autonomy default-off child failed (${code}): ${stderr}`))
      })
    })

    await Promise.all([child(), child()])

    expect(readJsonl(AUTONOMY).map(line => line.event)).toEqual(['start', 'complete'])
    expect(existsSync(join(dir, LEDGER))).toBe(false)
  }, 20_000)
})

describe('조회 명령은 record 가 켜져 있어도 쓰지 않는다 (§4.3)', () => {
  it('policy level · risk · show 를 불러도 판정 원장은 생기지 않는다', async () => {
    writePolicy({ schemaVersion: 1, record: true, enforce: true })
    const { policyLevel, policyRisk, policyShow } = await import('../src/commands/policy.js')
    policyLevel(dir)
    policyRisk(dir)
    policyShow(dir)
    expect(existsSync(join(dir, LEDGER))).toBe(false)
  })

  it('policy 커맨드는 종결 기록 모듈을 import 하지 않는다 — 모듈 경계로 강제', () => {
    const source = readFileSync(join(origCwd, 'src', 'commands', 'policy.ts'), 'utf-8')
    const imports = source
      .split(/\r?\n/)
      .filter((l) => l.trimStart().startsWith('import'))
      .join(' ')
    expect(imports).not.toContain('policy-record')
    expect(imports).not.toContain('recordRunTermination')
  })
})
