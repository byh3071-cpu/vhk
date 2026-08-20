import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  appendPolicyDecision,
  readPolicyLog,
  lastLevelLine,
  POLICY_LOG_PATH_REL,
  POLICY_LOG_SCHEMA_VERSION,
  type PolicyDecisionV1,
} from '../src/lib/policy-log.js'
import { removeDirSync } from '../src/lib/fs-remove.js'

/*
 * RFC 0066 §3 · §4.5 — 판정 원장 (124-T3).
 *
 * 두 가지가 이 모듈의 전부다.
 *   ① 기록 조건 — `record` 또는 `enforce` 일 때만 쓴다(ADR-019). 아무 플래그도 없으면 0줄.
 *   ② 마지막 라인 CAS — 병렬 worktree 둘이 몇 초 차이로 종결하면 같은 previous 를 읽고
 *      둘 다 승급을 쓴다. append 직전에 원장 끝을 다시 읽어 base 와 같을 때만 쓴다.
 *
 * CAS 는 완전한 잠금이 아니다. 파일 잠금 없이 마지막 라인만 비교하는 낙관적 방식이라
 * 극단적 경합에서는 창이 남는다. 여기서 막으려는 것은 흔한 사고다.
 */

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-policy-log-'))
  fs.mkdirSync(path.join(dir, '.vhk', 'events'), { recursive: true })
})
afterEach(() => {
  removeDirSync(dir)
})

function levelEntry(over: Partial<PolicyDecisionV1> = {}): PolicyDecisionV1 {
  return {
    schemaVersion: POLICY_LOG_SCHEMA_VERSION,
    ts: '2026-08-20T00:00:00.000Z',
    kind: 'level',
    verdict: 'allow',
    reasonCode: 'PROMOTE_ROLLING_CLEAN',
    from: 'L1',
    to: 'L2',
    transition: 'promote',
    judgedRuns: 12,
    rollingFailures: 0,
    window: 10,
    ...over,
  } as PolicyDecisionV1
}

describe('기록 조건 (ADR-019 · §7.1)', () => {
  it('아무 플래그도 없으면 쓰지 않는다 — 부작용 0', () => {
    const r = appendPolicyDecision(dir, levelEntry(), { record: false, enforce: false })
    expect(r.written).toBe(false)
    expect(fs.existsSync(path.join(dir, POLICY_LOG_PATH_REL))).toBe(false)
  })

  it('record 만 켜도 쓴다 — 집행 없이 이력만', () => {
    expect(appendPolicyDecision(dir, levelEntry(), { record: true, enforce: false }).written).toBe(true)
    expect(readPolicyLog(dir)).toHaveLength(1)
  })

  it('enforce 면 쓴다', () => {
    expect(appendPolicyDecision(dir, levelEntry(), { record: false, enforce: true }).written).toBe(true)
  })
})

describe('읽기', () => {
  it('없는 파일은 빈 배열', () => {
    expect(readPolicyLog(dir)).toEqual([])
  })

  it('손상 라인은 건너뛴다 — 한 줄이 전체를 죽이지 않는다', () => {
    const p = path.join(dir, POLICY_LOG_PATH_REL)
    fs.writeFileSync(p, `${JSON.stringify(levelEntry())}\n{ broken\n${JSON.stringify(levelEntry())}\n`, 'utf-8')
    expect(readPolicyLog(dir)).toHaveLength(2)
  })

  it('schemaVersion 이 없는 라인은 손상으로 보고 skip', () => {
    const p = path.join(dir, POLICY_LOG_PATH_REL)
    const broken = { ...levelEntry() } as Record<string, unknown>
    delete broken.schemaVersion
    fs.writeFileSync(p, `${JSON.stringify(broken)}\n`, 'utf-8')
    expect(readPolicyLog(dir)).toHaveLength(0)
  })

  it('lastLevelLine 은 level 종류만 본다', () => {
    const opts = { record: true, enforce: false }
    appendPolicyDecision(dir, levelEntry({ to: 'L2' }), opts)
    appendPolicyDecision(dir, { ...levelEntry(), kind: 'risk', to: undefined } as PolicyDecisionV1, opts)
    expect(lastLevelLine(dir)?.to).toBe('L2')
  })

  it('level 라인이 없으면 null — 케이스 0 의 입력이다', () => {
    expect(lastLevelLine(dir)).toBeNull()
  })
})

describe('마지막 라인 CAS (§4.5)', () => {
  it('base 가 현재 마지막과 같으면 쓴다', () => {
    const opts = { record: true, enforce: false }
    appendPolicyDecision(dir, levelEntry({ to: 'L2', judgedRuns: 12 }), opts)
    const base = lastLevelLine(dir)
    const r = appendPolicyDecision(dir, levelEntry({ from: 'L2', to: 'L3', judgedRuns: 13 }), opts, base)
    expect(r.written).toBe(true)
    expect(r.conflict).toBe(false)
  })

  // 병렬 worktree 두 개가 같은 previous 를 읽고 둘 다 승급을 쓰는 상황.
  it('그 사이 다른 세션이 썼으면 쓰지 않는다', () => {
    const opts = { record: true, enforce: false }
    appendPolicyDecision(dir, levelEntry({ to: 'L2', judgedRuns: 12 }), opts)
    const base = lastLevelLine(dir)

    // 다른 세션이 먼저 승급을 기록했다
    appendPolicyDecision(dir, levelEntry({ from: 'L2', to: 'L3', judgedRuns: 13 }), opts)

    const r = appendPolicyDecision(dir, levelEntry({ from: 'L2', to: 'L3', judgedRuns: 13 }), opts, base)
    expect(r.written).toBe(false)
    expect(r.conflict).toBe(true)
    expect(r.reasonCode).toBe('CAS_CONFLICT')
    expect(readPolicyLog(dir)).toHaveLength(2) // 중복 승급이 안 쌓였다
  })

  it('base 가 null 인데 이미 level 라인이 있으면 충돌', () => {
    const opts = { record: true, enforce: false }
    appendPolicyDecision(dir, levelEntry(), opts)
    const r = appendPolicyDecision(dir, levelEntry(), opts, null)
    expect(r.conflict).toBe(true)
  })

  it('base 를 주지 않으면 CAS 를 걸지 않는다 — 관측 기록용', () => {
    const opts = { record: true, enforce: false }
    appendPolicyDecision(dir, levelEntry(), opts)
    expect(appendPolicyDecision(dir, levelEntry(), opts).written).toBe(true)
  })
})
