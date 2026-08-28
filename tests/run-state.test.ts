import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import {
  startRun,
  endRun,
  readRunState,
  bumpCommandCount,
  pruneExpired,
  runStateCoordinationLockPath,
  RUN_STATE_LOCK_REL,
  RUN_STATE_REL,
} from '../src/lib/run-state.js'
import { removeDirSync, removeFileSync } from '../src/lib/fs-remove.js'

const lockOpenState = vi.hoisted(() => ({
  target: null as string | null,
  calls: 0,
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    openSync: (...args: Parameters<typeof actual.openSync>): number => {
      if (lockOpenState.target !== null && String(args[0]) === lockOpenState.target) {
        lockOpenState.calls++
        throw Object.assign(new Error('persistent permission failure'), { code: 'EPERM' })
      }
      return actual.openSync(...args)
    },
  }
})

/*
 * RFC 0067 §5.3-3 — 런 단위 상태 (125a-T4).
 *
 * 자율 런은 명령마다 새 프로세스를 띄우므로 메모리 카운터로는 셀 수 없다.
 * read-modify-write 라 append 의 원자성이 없어 프로세스 잠금으로 전체 갱신을 직렬화하고,
 * 같은 런의 낡은 판정은 CAS로 거부한다.
 */

let dir: string
const T0 = '2026-08-21T00:00:00.000Z'
const POLICY_HASH = 'a'.repeat(64)

beforeEach(() => {
  lockOpenState.target = null
  lockOpenState.calls = 0
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-run-state-'))
  fs.mkdirSync(path.join(dir, '.vhk'), { recursive: true })
})
afterEach(() => removeDirSync(dir))

describe('런 시작·종결', () => {
  it('시작하면 레코드가 0 부터 생긴다', () => {
    const r = startRun(dir, 'run-1', T0)
    expect(r.commandCount).toBe(0)
    expect(r.clockAnomaly).toBe(false)
    expect(fs.existsSync(path.join(dir, RUN_STATE_REL))).toBe(true)
    const ignored = fs.readFileSync(path.join(dir, '.vhk', '.gitignore'), 'utf-8')
    for (const name of [
      'policy.json',
      'policy-baseline.json',
      '.policy-baseline.json.tmp-*',
      'run-state.json',
      'run-state.lock',
      'run-state-recovery.lock',
      '.run-state.json.tmp-*',
    ]) {
      expect(ignored.split(/\r?\n/)).toContain(name)
    }
    expect(fs.existsSync(path.join(dir, RUN_STATE_LOCK_REL))).toBe(false)
  })

  // 재시작이 카운터를 리셋하면 그게 곧 우회다.
  it('이미 있는 런을 다시 시작해도 덮지 않는다', () => {
    startRun(dir, 'run-1', T0, POLICY_HASH)
    bumpCommandCount(dir, 'run-1', 0, T0, false)
    const again = startRun(dir, 'run-1', '2026-08-21T01:00:00.000Z', 'b'.repeat(64))
    expect(again.commandCount).toBe(1)
    expect(again.policyConfigHash).toBe(POLICY_HASH)
  })

  it('정책 해시를 private run-state에 저장하고 다시 읽는다', () => {
    startRun(dir, 'run-policy', T0, POLICY_HASH)
    expect(readRunState(dir)['run-policy'].policyConfigHash).toBe(POLICY_HASH)
    expect(readRunState(dir)['run-policy'].policySnapshotOrigin).toBe('start-v1')
  })

  it('손상된 시각·호출 수·clockAnomaly 레코드는 정상 상태로 노출하지 않는다', () => {
    fs.writeFileSync(
      path.join(dir, RUN_STATE_REL),
      JSON.stringify({
        badTime: { startedAtUtc: 'bad', commandCount: 0, lastSeenUtc: T0, clockAnomaly: false },
        negative: { startedAtUtc: T0, commandCount: -1, lastSeenUtc: T0, clockAnomaly: false },
        fractional: { startedAtUtc: T0, commandCount: 0.5, lastSeenUtc: T0, clockAnomaly: false },
        badFlag: { startedAtUtc: T0, commandCount: 0, lastSeenUtc: T0, clockAnomaly: 'false' },
        valid: { startedAtUtc: T0, commandCount: 0, lastSeenUtc: T0, clockAnomaly: false },
      }) + '\n',
      'utf-8',
    )

    expect(readRunState(dir)).toEqual({
      valid: { startedAtUtc: T0, commandCount: 0, lastSeenUtc: T0, clockAnomaly: false },
    })
  })

  it('손상 레코드가 하나라도 있으면 모든 writer가 원본 전체를 보존한다', () => {
    const raw = `${JSON.stringify({
      broken: { startedAtUtc: T0, commandCount: -1, lastSeenUtc: T0, clockAnomaly: false },
      valid: { startedAtUtc: T0, commandCount: 0, lastSeenUtc: T0, clockAnomaly: false },
    }, null, 2)}\n`
    const file = path.join(dir, RUN_STATE_REL)
    fs.writeFileSync(file, raw, 'utf-8')

    for (const mutate of [
      () => startRun(dir, 'new-run', T0, POLICY_HASH),
      () => bumpCommandCount(dir, 'valid', 0, T0, false),
      () => endRun(dir, 'valid'),
    ]) {
      expect(mutate).toThrowError(expect.objectContaining({ code: 'RUN_STATE_CORRUPT' }))
      expect(fs.readFileSync(file, 'utf-8')).toBe(raw)
    }
  })

  it('Git 초기화 여부가 바뀌어도 같은 OS-temp 잠금 경로를 쓴다', () => {
    const before = runStateCoordinationLockPath(dir)
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true })
    const after = runStateCoordinationLockPath(dir)
    expect(after).toBe(before)
    expect(path.dirname(path.dirname(after))).toBe(os.tmpdir())
    expect(path.basename(path.dirname(after))).toMatch(/^vhk-workspace-locks-/)
  })

  it('종결하면 레코드가 사라진다', () => {
    startRun(dir, 'run-1', T0)
    endRun(dir, 'run-1')
    expect(readRunState(dir)['run-1']).toBeUndefined()
  })

  it('병행 런이 서로를 덮지 않는다', () => {
    startRun(dir, 'run-1', T0)
    startRun(dir, 'run-2', T0)
    bumpCommandCount(dir, 'run-1', 0, T0, false)
    expect(readRunState(dir)['run-1'].commandCount).toBe(1)
    expect(readRunState(dir)['run-2'].commandCount).toBe(0)
  })

  it('프로토타입과 겹치는 runId도 일반 레코드로 시작·증가·종결한다', () => {
    for (const runId of ['__proto__', 'constructor']) {
      expect(startRun(dir, runId, T0).commandCount).toBe(0)
      expect(bumpCommandCount(dir, runId, 0, T0, false).record?.commandCount).toBe(1)
      expect(Object.prototype.hasOwnProperty.call(readRunState(dir), runId)).toBe(true)
      endRun(dir, runId)
      expect(Object.prototype.hasOwnProperty.call(readRunState(dir), runId)).toBe(false)
    }
  })

  it('여러 프로세스가 동시에 시작해도 모든 런 레코드를 보존한다', async () => {
    const moduleHref = pathToFileURL(path.join(process.cwd(), 'src', 'lib', 'run-state.ts')).href
    const child = (prefix: string): Promise<void> => new Promise((resolve, reject) => {
      const source = [
        `const { startRun } = await import(${JSON.stringify(moduleHref)})`,
        `const cwd = ${JSON.stringify(dir)}`,
        `for (let i = 0; i < 20; i++) startRun(cwd, ${JSON.stringify(prefix)} + i, ${JSON.stringify(T0)}, ${JSON.stringify(POLICY_HASH)})`,
      ].join(';')
      const proc = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stderr = ''
      proc.stderr.setEncoding('utf-8')
      proc.stderr.on('data', (chunk: string) => { stderr += chunk })
      proc.on('error', reject)
      proc.on('exit', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`run-state child failed (${code}): ${stderr}`))
      })
    })

    await Promise.all(['a-', 'b-', 'c-', 'd-'].map(child))

    expect(Object.keys(readRunState(dir))).toHaveLength(80)
    expect(fs.existsSync(path.join(dir, RUN_STATE_LOCK_REL))).toBe(false)
    expect(fs.existsSync(runStateCoordinationLockPath(dir))).toBe(false)
  }, 20_000)

  it('소유 정보가 덜 쓰인 잠금은 오래돼도 자동 삭제하지 않고 수동 복구를 안내한다', () => {
    const lockPath = runStateCoordinationLockPath(dir)
    fs.mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 })
    fs.writeFileSync(lockPath, '{', 'utf-8')
    fs.utimesSync(lockPath, new Date(0), new Date(0))

    let error: unknown
    try {
      startRun(dir, 'must-not-start', T0, POLICY_HASH)
    } catch (caught) {
      error = caught
    }

    expect(error).toMatchObject({ code: 'RUN_STATE_LOCK_TIMEOUT' })
    expect((error as Error).message).toContain('사람이 직접 정리')
    expect(fs.existsSync(lockPath)).toBe(true)
    expect(readRunState(dir)['must-not-start']).toBeUndefined()
    removeFileSync(lockPath)
  }, 10_000)

  it('잠금 파일이 보이지 않는 영구 EPERM도 제한 시간 뒤 즉시 실패한다', () => {
    let fakeNow = 0
    const now = vi.spyOn(Date, 'now').mockImplementation(() => {
      fakeNow += 6_000
      return fakeNow
    })
    lockOpenState.target = runStateCoordinationLockPath(dir)

    try {
      expect(() => startRun(dir, 'bounded-eperm', T0, POLICY_HASH)).toThrowError(
        expect.objectContaining({ code: 'RUN_STATE_LOCK_TIMEOUT' }),
      )
      expect(lockOpenState.calls).toBe(1)
      expect(fs.existsSync(lockOpenState.target)).toBe(false)
    } finally {
      lockOpenState.target = null
      now.mockRestore()
    }
  })
})

describe('카운터 CAS', () => {
  it('base 가 맞으면 증가한다', () => {
    startRun(dir, 'run-1', T0)
    const r = bumpCommandCount(dir, 'run-1', 0, T0, false)
    expect(r.ok).toBe(true)
    expect(r.record?.commandCount).toBe(1)
  })

  it('그 사이 다른 프로세스가 올렸으면 충돌', () => {
    startRun(dir, 'run-1', T0)
    bumpCommandCount(dir, 'run-1', 0, T0, false) // 다른 프로세스
    const r = bumpCommandCount(dir, 'run-1', 0, T0, false) // 낡은 base
    expect(r.ok).toBe(false)
    expect(r.conflict).toBe(true)
    expect(readRunState(dir)['run-1'].commandCount).toBe(1) // 중복 증가 없음
  })

  // 런 시작을 안 거친 호출은 자율 레인 fail-closed 대상이다.
  it('레코드가 없으면 실패한다 — 충돌이 아니라 미시작', () => {
    const r = bumpCommandCount(dir, 'unknown', 0, T0, false)
    expect(r.ok).toBe(false)
    expect(r.conflict).toBe(false)
  })

  it('이상 시계는 한 번 켜지면 유지된다', () => {
    startRun(dir, 'run-1', T0)
    bumpCommandCount(dir, 'run-1', 0, T0, true)
    const r = bumpCommandCount(dir, 'run-1', 1, T0, false)
    expect(r.record?.clockAnomaly).toBe(true)
  })
})

describe('만료 정리', () => {
  it('오래된 레코드를 지운다', () => {
    const state = {
      old: { startedAtUtc: T0, commandCount: 1, lastSeenUtc: T0, clockAnomaly: false },
      fresh: {
        startedAtUtc: '2026-08-22T00:00:00.000Z',
        commandCount: 1,
        lastSeenUtc: '2026-08-22T00:00:00.000Z',
        clockAnomaly: false,
      },
    }
    const out = pruneExpired(state, '2026-08-22T01:00:00.000Z')
    expect(out.old).toBeUndefined()
    expect(out.fresh).toBeDefined()
  })

  it('정책 원장 보충 대기 상태는 TTL이 지나도 증거를 보존한다', () => {
    const pending = {
      startedAtUtc: T0,
      commandCount: 0,
      lastSeenUtc: T0,
      clockAnomaly: false,
      policyConfigHash: POLICY_HASH,
      policySnapshotOrigin: 'terminal-v1' as const,
      policyRecordPending: true,
    }
    expect(pruneExpired({ pending }, '2026-08-28T00:00:00.000Z').pending).toEqual(pending)
  })

  it('정책 원장 의무가 없는 최초 terminal 요청도 종결 전에는 TTL로 지우지 않는다', () => {
    const prepared = {
      startedAtUtc: T0,
      commandCount: 0,
      lastSeenUtc: T0,
      clockAnomaly: false,
      terminalRequestExpected: {
        ts: '2026-08-21T00:01:00.000Z',
        event: 'blocked' as const,
        policyInvalidated: false,
        ticks: 2,
        interventions: 1,
        failureKind: 'infra' as const,
      },
    }
    expect(pruneExpired({ prepared }, '2026-08-28T00:00:00.000Z').prepared).toEqual(prepared)
  })
})

describe('손상 처리', () => {
  it('파일이 깨졌으면 빈 상태 — 판정 측이 미시작으로 fail-closed 한다', () => {
    fs.writeFileSync(path.join(dir, RUN_STATE_REL), '{ broken', 'utf-8')
    expect(readRunState(dir)).toEqual({})
  })

  it('정책 해시 타입·길이가 잘못된 레코드는 읽지 않는다', () => {
    fs.writeFileSync(
      path.join(dir, RUN_STATE_REL),
      JSON.stringify({
        bad: {
          startedAtUtc: T0,
          commandCount: 0,
          lastSeenUtc: T0,
          clockAnomaly: false,
          policyConfigHash: '짧음',
        },
      }),
      'utf-8',
    )
    expect(readRunState(dir)).toEqual({})
  })
})
