import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { recordRunTermination, CAS_MAX_ATTEMPTS, type RunTerminationInput } from '../src/lib/policy-record.js'
import { readPolicyLog, POLICY_LOG_PATH_REL } from '../src/lib/policy-log.js'
import { AUTONOMY_LOG_PATH_REL } from '../src/lib/autonomy-log.js'
import { POLICY_CONFIG_REL } from '../src/lib/policy-config.js'
import { ROLLING_WINDOW } from '../src/lib/autonomy-stats.js'
import { removeDirSync } from '../src/lib/fs-remove.js'

/*
 * RFC 0066 §4.3 · §7.1 · ADR-019 — 자율 런 종결 시 판정 원장 기록 (124-T3·T4 배선).
 *
 * 이 모듈이 지켜야 하는 것 셋.
 *   ① 기록 게이트(record | enforce)가 꺼져 있으면 파일을 하나도 만들지 않는다. 기본 off 의 정의다.
 *   ② 켜져 있어도 전이는 판정 대상 런이 실제로 늘었을 때만 남긴다(NO_NEW_JUDGED_RUN 은 기록 없음).
 *   ③ 켜져 있어도 집행은 없다 — 이 모듈은 판정을 원장에 남길 뿐 무엇도 막지 않는다.
 */

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-policy-record-'))
  fs.mkdirSync(path.join(dir, '.vhk', 'events'), { recursive: true })
})
afterEach(() => {
  vi.restoreAllMocks()
  removeDirSync(dir)
})

function writePolicy(config: Record<string, unknown> | string): void {
  const body = typeof config === 'string' ? config : JSON.stringify(config, null, 2)
  fs.writeFileSync(path.join(dir, POLICY_CONFIG_REL), body, 'utf-8')
}

/** 판정 대상 런(v2 + sha + 종결)을 n 개 심는다. receipt 가 없으니 전부 verified=false 다. */
function seedJudgedRuns(n: number): void {
  const lines: string[] = []
  for (let i = 0; i < n; i++) {
    const runId = `sample-run-${i}`
    const sha = `sample-sha-${i}`
    lines.push(
      JSON.stringify({ ts: `2026-08-0${(i % 9) + 1}T00:00:00.000Z`, runId, event: 'start', schemaVersion: 2, sha }),
      JSON.stringify({ ts: `2026-08-0${(i % 9) + 1}T01:00:00.000Z`, runId, event: 'complete', schemaVersion: 2, sha, interventions: 0 }),
    )
  }
  fs.appendFileSync(path.join(dir, AUTONOMY_LOG_PATH_REL), `${lines.join('\n')}\n`, 'utf-8')
}

function input(over: Partial<RunTerminationInput> = {}): RunTerminationInput {
  return {
    runId: 'sample-run-id',
    sha: 'sample-sha',
    breakdown: { kind: 'docs', total: 1, unclassified: 0 },
    derivedFrom: 'paths',
    nowIso: '2026-08-28T00:00:00.000Z',
    ...over,
  }
}

function ledgerExists(): boolean {
  return fs.existsSync(path.join(dir, POLICY_LOG_PATH_REL))
}

describe('기본 off — 게이트가 꺼져 있으면 파일을 만들지 않는다 (§7.1 · ADR-019)', () => {
  it('policy.json 이 없으면 아무것도 쓰지 않는다', () => {
    const r = recordRunTermination(dir, input())
    expect(r.recordingOff).toBe(true)
    expect(r.level).toBeNull()
    expect(r.risk).toBeNull()
    expect(ledgerExists()).toBe(false)
  })

  it('record:false · enforce:false 를 명시해도 같다', () => {
    writePolicy({ schemaVersion: 1, record: false, enforce: false })
    expect(recordRunTermination(dir, input()).recordingOff).toBe(true)
    expect(ledgerExists()).toBe(false)
  })

  it('설정이 손상돼 신뢰할 수 없으면 기록하지 않는다 — fail-closed 는 켜짐이 아니다', () => {
    writePolicy('{ "schemaVersion": 1, "record": true, ')
    expect(recordRunTermination(dir, input()).recordingOff).toBe(true)
    expect(ledgerExists()).toBe(false)
  })

  it('record 가 boolean 이 아니면 판단 불가 → 기록하지 않는다', () => {
    writePolicy({ schemaVersion: 1, record: 'yes' })
    expect(recordRunTermination(dir, input()).recordingOff).toBe(true)
    expect(ledgerExists()).toBe(false)
  })
})

describe('record 켜짐 — 종결 직후 level·risk 두 줄을 남긴다 (§3.3 · §3.4)', () => {
  beforeEach(() => writePolicy({ schemaVersion: 1, record: true }))

  it('원장이 비었으면 init 라인 — L1 · LEDGER_EMPTY (§4.4 케이스 0)', () => {
    const r = recordRunTermination(dir, input())
    expect(r.recordingOff).toBe(false)
    expect(r.level).toMatchObject({ from: null, to: 'L1', transition: 'init', reasonCode: 'LEDGER_EMPTY', written: true })

    const lines = readPolicyLog(dir)
    expect(lines.map((l) => l.kind)).toEqual(['level', 'risk'])
    const level = lines[0]
    expect(level).toMatchObject({
      schemaVersion: 1,
      ts: '2026-08-28T00:00:00.000Z',
      kind: 'level',
      verdict: 'allow',
      reasonCode: 'LEDGER_EMPTY',
      runId: 'sample-run-id',
      sha: 'sample-sha',
      taskKind: 'docs',
      from: null,
      to: 'L1',
      transition: 'init',
      judgedRuns: 0,
      rollingFailures: null,
      window: ROLLING_WINDOW,
    })
  })

  it('risk 라인 — 기계 유도 taskKind · riskClass · 미분류 수 · 유도 출처를 남긴다', () => {
    recordRunTermination(dir, input())
    const risk = readPolicyLog(dir)[1]
    expect(risk).toMatchObject({
      kind: 'risk',
      verdict: 'allow',
      reasonCode: 'RISK_AUTO_KIND',
      runId: 'sample-run-id',
      sha: 'sample-sha',
      taskKind: 'docs',
      riskClass: 'auto',
      unclassifiedPaths: 0,
      derivedFrom: 'paths',
    })
  })

  it('enforce 만 켜도 기록한다 — enforce 는 record 를 함의한다', () => {
    writePolicy({ schemaVersion: 1, enforce: true })
    const r = recordRunTermination(dir, input())
    expect(r.recordingOff).toBe(false)
    expect(readPolicyLog(dir)).toHaveLength(2)
  })

  it('sha 를 못 쟀으면 null 로 남긴다 — 추측하지 않는다 (§3.2)', () => {
    recordRunTermination(dir, input({ sha: null }))
    const raw = fs.readFileSync(path.join(dir, POLICY_LOG_PATH_REL), 'utf-8').split('\n')[0]
    expect(JSON.parse(raw).sha).toBeNull()
  })

  it('maxLevel 로 상한을 낮추면 그만큼만 — L0 이면 verdict deny (읽기만 가능한 단계)', () => {
    writePolicy({ schemaVersion: 1, record: true, maxLevel: 'L0' })
    const r = recordRunTermination(dir, input())
    expect(r.level?.to).toBe('L0')
    expect(readPolicyLog(dir)[0].verdict).toBe('deny')
  })
})

describe('전이 트리거 — 판정 대상 런이 늘었을 때만 level 라인을 쓴다 (§4.3 치명 3)', () => {
  beforeEach(() => writePolicy({ schemaVersion: 1, record: true }))

  it('표본이 그대로면 level 은 NO_NEW_JUDGED_RUN 으로 기록 없음 · risk 만 남는다', () => {
    recordRunTermination(dir, input())
    const second = recordRunTermination(dir, input({ runId: 'sample-run-2' }))
    expect(second.level).toMatchObject({ written: false, skipReason: 'NO_NEW_JUDGED_RUN', to: 'L1' })
    expect(second.risk?.written).toBe(true)
    expect(readPolicyLog(dir).map((l) => l.kind)).toEqual(['level', 'risk', 'risk'])
  })

  it('표본이 늘면 전이 판정이 돌고 hold 도 라인으로 남는다 — 다음 판정의 기준값이 된다', () => {
    recordRunTermination(dir, input())
    seedJudgedRuns(1)
    const r = recordRunTermination(dir, input({ runId: 'sample-run-0' }))
    expect(r.level).toMatchObject({
      from: 'L1',
      to: 'L1',
      transition: 'hold',
      reasonCode: 'INSUFFICIENT_SAMPLE',
      written: true,
    })
    const levels = readPolicyLog(dir).filter((l) => l.kind === 'level')
    expect(levels).toHaveLength(2)
    expect(levels[1]).toMatchObject({ from: 'L1', to: 'L1', judgedRuns: 1 })
  })

  it('창이 차고 실패가 쌓였으면 축소 한 칸 — 판정 결과를 그대로 남긴다', () => {
    seedJudgedRuns(ROLLING_WINDOW)
    // 시작 단계를 L2 로 만들어 두고(원장 라인) 그 뒤 표본을 하나 더 늘린다.
    fs.appendFileSync(
      path.join(dir, POLICY_LOG_PATH_REL),
      `${JSON.stringify({ schemaVersion: 1, ts: '2026-08-01T00:00:00.000Z', kind: 'level', verdict: 'allow', reasonCode: 'PROMOTE_ROLLING_CLEAN', from: 'L1', to: 'L2', transition: 'promote', judgedRuns: 5, rollingFailures: 0, window: ROLLING_WINDOW })}\n`,
      'utf-8',
    )
    const r = recordRunTermination(dir, input())
    // receipt 가 없으니 최근 10회 전부 verified=false → 축소 임계 초과.
    expect(r.level).toMatchObject({ from: 'L2', to: 'L1', transition: 'demote', reasonCode: 'DEMOTE_ROLLING_FAILURES', written: true })
    const last = readPolicyLog(dir).filter((l) => l.kind === 'level').at(-1)
    expect(last).toMatchObject({ judgedRuns: ROLLING_WINDOW, rollingFailures: ROLLING_WINDOW })
  })
})

describe('위험도 — 미분류·범위 불명은 전부 human (§5.3 치명 1)', () => {
  beforeEach(() => writePolicy({ schemaVersion: 1, record: true }))

  const cases: Array<[string, Partial<RunTerminationInput>, string, string, string]> = [
    ['docs 만', { breakdown: { kind: 'docs', total: 1, unclassified: 0 } }, 'auto', 'allow', 'RISK_AUTO_KIND'],
    ['docs + 미분류 하나', { breakdown: { kind: 'docs', total: 2, unclassified: 1 } }, 'human', 'require-human', 'RISK_UNCLASSIFIED_PATH'],
    ['source', { breakdown: { kind: 'source', total: 3, unclassified: 0 } }, 'human', 'require-human', 'RISK_HUMAN_KIND'],
    ['경로 0개', { breakdown: { kind: 'unknown', total: 0, unclassified: 0 } }, 'human', 'require-human', 'RISK_SCOPE_UNKNOWN'],
    ['범위 못 구함', { derivedFrom: 'none', breakdown: { kind: 'unknown', total: 0, unclassified: 0 } }, 'human', 'require-human', 'RISK_SCOPE_UNKNOWN'],
  ]

  for (const [label, over, riskClass, verdict, reasonCode] of cases) {
    it(`${label} → ${riskClass} / ${reasonCode}`, () => {
      const r = recordRunTermination(dir, input(over))
      expect(r.risk).toMatchObject({ riskClass, reasonCode, written: true })
      const line = readPolicyLog(dir).find((l) => l.kind === 'risk')
      expect(line).toMatchObject({ verdict, reasonCode, riskClass, unclassifiedPaths: over.breakdown?.unclassified ?? 0 })
    })
  }
})

describe('마지막 라인 CAS — 재시도 상한에 닿으면 기록 없이 CAS_CONFLICT (§4.5)', () => {
  it('level 은 재시도 뒤 포기하고, 관측 기록인 risk 는 그대로 남는다', async () => {
    writePolicy({ schemaVersion: 1, record: true })
    vi.resetModules()
    const appendSpy = vi.fn()
    vi.doMock('../src/lib/policy-log.js', async (importOriginal) => {
      const orig = await importOriginal<typeof import('../src/lib/policy-log.js')>()
      return {
        ...orig,
        appendPolicyDecision: (
          ...args: Parameters<typeof orig.appendPolicyDecision>
        ): ReturnType<typeof orig.appendPolicyDecision> => {
          appendSpy(args[1].kind, args[3])
          // base 가 주어진(=CAS 를 거는) 호출만 다른 세션이 끼어든 것처럼 군다.
          if (args[3] !== undefined) return { written: false, conflict: true, reasonCode: 'CAS_CONFLICT' }
          return orig.appendPolicyDecision(...args)
        },
      }
    })
    try {
      const mod = await import('../src/lib/policy-record.js')
      const r = mod.recordRunTermination(dir, input())
      expect(r.level).toMatchObject({ written: false, skipReason: 'CAS_CONFLICT' })
      expect(r.risk?.written).toBe(true)
      const levelAttempts = appendSpy.mock.calls.filter(([kind]) => kind === 'level')
      expect(levelAttempts).toHaveLength(CAS_MAX_ATTEMPTS)
      expect(readPolicyLog(dir).map((l) => l.kind)).toEqual(['risk'])
    } finally {
      vi.doUnmock('../src/lib/policy-log.js')
      vi.resetModules()
    }
  })
})
