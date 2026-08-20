import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  startRun,
  endRun,
  readRunState,
  bumpCommandCount,
  pruneExpired,
  RUN_STATE_REL,
} from '../src/lib/run-state.js'
import { removeDirSync } from '../src/lib/fs-remove.js'

/*
 * RFC 0067 §5.3-3 — 런 단위 상태 (125a-T4).
 *
 * 자율 런은 명령마다 새 프로세스를 띄우므로 메모리 카운터로는 셀 수 없다.
 * read-modify-write 라 append 의 원자성이 없어 CAS 를 건다 — 막으려는 것은
 * 같은 런 안에서 순차로 도는 명령들의 누락이다.
 */

let dir: string
const T0 = '2026-08-21T00:00:00.000Z'

beforeEach(() => {
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
  })

  // 재시작이 카운터를 리셋하면 그게 곧 우회다.
  it('이미 있는 런을 다시 시작해도 덮지 않는다', () => {
    startRun(dir, 'run-1', T0)
    bumpCommandCount(dir, 'run-1', 0, T0, false)
    const again = startRun(dir, 'run-1', '2026-08-21T01:00:00.000Z')
    expect(again.commandCount).toBe(1)
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
})

describe('손상 처리', () => {
  it('파일이 깨졌으면 빈 상태 — 판정 측이 미시작으로 fail-closed 한다', () => {
    fs.writeFileSync(path.join(dir, RUN_STATE_REL), '{ broken', 'utf-8')
    expect(readRunState(dir)).toEqual({})
  })
})
