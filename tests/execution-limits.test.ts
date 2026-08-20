import { describe, it, expect } from 'vitest'
import {
  evaluateCallBudget,
  evaluateTimeBudget,
  resolveClock,
  type ExecutionLimits,
} from '../src/lib/execution-limits.js'

/*
 * RFC 0067 §5.3-3 · §5.4 — 한도 판정 (125a-T3).
 *
 * **기계가 직접 세는 값만 쓴다.** 단조 시계 경과와 명령 호출 수다.
 * 자기 보고 비용(`cost.jsonl`)은 하드리밋 근거가 될 수 없다 — 안 부르는 것이 가장 쉬운 우회이고,
 * 그건 110 전체의 전제("자기 보고는 카운터 자격이 없다")와 정면으로 부딪힌다.
 * 정확한 달러 금액은 아니지만 **막으려는 것은 금액이 아니라 폭주**다.
 */

const limits: ExecutionLimits = {
  perRunSec: 3600,
  perCommandSec: 900,
  perRunCommandCount: 40,
}

describe('호출 수 판정 (§5.3-3)', () => {
  it('상한 미만이면 통과', () => {
    expect(evaluateCallBudget(39, limits).exceeded).toBe(false)
  })

  // 실행 전에 세므로 count 는 "이번 것을 포함하기 직전" 값이다.
  it('상한에 도달하면 거부 — 이번 호출이 상한을 넘긴다', () => {
    const r = evaluateCallBudget(40, limits)
    expect(r.exceeded).toBe(true)
    expect(r.reasonCode).toBe('CALL_BUDGET_EXCEEDED')
  })

  it('상한을 이미 넘겼어도 거부', () => {
    expect(evaluateCallBudget(99, limits).exceeded).toBe(true)
  })
})

describe('시간 판정 — 두 층을 다른 시계로 (§5.3-3)', () => {
  const started = '2026-08-21T00:00:00.000Z'

  it('경과가 상한 미만이면 통과', () => {
    const r = evaluateTimeBudget({
      startedAtUtc: started,
      lastSeenUtc: started,
      nowUtc: '2026-08-21T00:10:00.000Z', // 600초
      limits,
      commandMaxSec: 900,
    })
    expect(r.exceeded).toBe(false)
    expect(r.clockAnomaly).toBe(false)
  })

  it('런 누적이 perRunSec 를 넘으면 거부', () => {
    const r = evaluateTimeBudget({
      startedAtUtc: started,
      lastSeenUtc: started,
      nowUtc: '2026-08-21T02:00:00.000Z', // 7200초 > 3600
      limits,
      commandMaxSec: 900,
    })
    expect(r.exceeded).toBe(true)
    expect(r.reasonCode).toBe('TIME_LIMIT_EXCEEDED')
  })

  // 지금 시작하면 상한을 넘을 게 확정인 경우 — 띄우기 전에 막는다.
  it('이번 명령을 돌리면 런 상한을 넘길 게 확실하면 사전 거부', () => {
    const r = evaluateTimeBudget({
      startedAtUtc: started,
      lastSeenUtc: started,
      nowUtc: '2026-08-21T00:55:00.000Z', // 3300초 경과, 남은 300초
      limits,
      commandMaxSec: 900, // 900초짜리를 띄우면 4200초가 된다
    })
    expect(r.exceeded).toBe(true)
    expect(r.reasonCode).toBe('TIME_LIMIT_WOULD_EXCEED')
  })
})

describe('이상 시계 — 드문 상황에서 관대해지지 않는다 (§5.3-3)', () => {
  const started = '2026-08-21T01:00:00.000Z'

  it('경과가 음수면 0 으로 클램프하고 이상으로 표시', () => {
    const r = evaluateTimeBudget({
      startedAtUtc: started,
      lastSeenUtc: started,
      nowUtc: '2026-08-21T00:00:00.000Z', // 시작보다 이르다
      limits,
      commandMaxSec: 900,
    })
    expect(r.clockAnomaly).toBe(true)
    expect(r.elapsedSec).toBe(0)
  })

  it('시간이 뒤로 갔으면 이상으로 표시', () => {
    const r = evaluateTimeBudget({
      startedAtUtc: started,
      lastSeenUtc: '2026-08-21T01:30:00.000Z',
      nowUtc: '2026-08-21T01:10:00.000Z', // lastSeen 보다 이르다
      limits,
      commandMaxSec: 900,
    })
    expect(r.clockAnomaly).toBe(true)
  })

  // 한 번 켜지면 그 런은 끝난다. 시계가 흔들린 런에서 한도를 계속 믿는 것보다 멈추는 쪽이 안전하다.
  it('이상이 이미 기록돼 있으면 무조건 거부', () => {
    const r = evaluateTimeBudget({
      startedAtUtc: started,
      lastSeenUtc: started,
      nowUtc: '2026-08-21T01:00:10.000Z',
      limits,
      commandMaxSec: 900,
      priorAnomaly: true,
    })
    expect(r.exceeded).toBe(true)
    expect(r.reasonCode).toBe('CLOCK_ANOMALY')
  })

  // 벽시계를 뒤로 돌려 경과를 줄이는 우회를 막는다.
  it('lastSeenUtc 는 단조 증가한다 — 경과가 줄지 않는다', () => {
    const r = evaluateTimeBudget({
      startedAtUtc: started,
      lastSeenUtc: '2026-08-21T01:50:00.000Z',
      nowUtc: '2026-08-21T01:10:00.000Z',
      limits,
      commandMaxSec: 900,
    })
    expect(r.nextLastSeenUtc).toBe('2026-08-21T01:50:00.000Z')
  })
})

describe('명령 개별 상한 (§5.4)', () => {
  it('항목의 maxDurationSec 가 있으면 그것을, 없으면 perCommandSec 를 쓴다', () => {
    expect(resolveClock({ maxDurationSec: 120 }, limits)).toBe(120)
    expect(resolveClock({}, limits)).toBe(900)
  })

  it('명령 상한이 런 상한보다 크면 런 상한으로 잘린다', () => {
    expect(resolveClock({ maxDurationSec: 99999 }, limits)).toBe(3600)
  })
})
