import { describe, it, expect } from 'vitest'
import {
  decidePermissionLevel,
  clampLevel,
  LEVELS,
  PROMOTION_FAILURE_MAX,
  type LevelLine,
  type PermissionLevel,
} from '../src/lib/permission-level.js'
import type { AutonomyStats } from '../src/lib/autonomy-stats.js'

/*
 * RFC 0066 §4 — 권한 단계 판정 (124-T1).
 *
 * 이 판정은 순수 계산이다. 원장에 쓰지 않고, 단계를 저장하지도 않는다(§4.7).
 * 현재 단계는 원장의 마지막 level 라인에서 매번 다시 계산되는 파생값이다.
 *
 * §4.4 의사코드의 분기 순서가 곧 계약이다. 특히 축소가 승급보다 **먼저**여야 한다 —
 * 순서를 바꾸면 실패가 쌓이는 중에도 승급이 난다.
 */

/** 판정에 쓰는 필드만 채운 stats. 나머지는 판정이 보지 않는다(§2). */
function stats(over: Partial<AutonomyStats> = {}): AutonomyStats {
  return {
    judgedRuns: 20,
    rollingFailures: 0,
    demotionTriggered: false,
    infraAbuseSuspected: false,
    rollingSelfReportedOnly: 0,
    ...over,
  } as AutonomyStats
}

function last(over: Partial<LevelLine> = {}): LevelLine {
  return { to: 'L1', judgedRuns: 10, ts: '2026-08-20T00:00:00.000Z', ...over }
}

describe('권한 단계 판정 (RFC 0066 §4)', () => {
  it('단계는 L0~L3 네 개뿐 — L4 는 없다 (ADR-009 ②)', () => {
    expect(LEVELS).toEqual(['L0', 'L1', 'L2', 'L3'])
  })

  it('clamp 는 하한 L0 과 상한 L3 을 둘 다 고정한다', () => {
    expect(clampLevel(-1)).toBe('L0')
    expect(clampLevel(0)).toBe('L0')
    expect(clampLevel(3)).toBe('L3')
    expect(clampLevel(9)).toBe('L3')
  })

  // 케이스 0 — 원장에 level 라인이 없다 (§11 Q1 확정: L1)
  it('원장이 비면 L1 에서 시작한다', () => {
    const r = decidePermissionLevel(stats(), {}, null)
    expect(r.level).toBe('L1')
    expect(r.transition).toBe('init')
    expect(r.reasonCode).toBe('LEDGER_EMPTY')
  })

  // 케이스 1 — 조회로는 승급하지 않는다 (§4.3 치명 3)
  it('판정 대상 런이 늘지 않았으면 아무 일도 없다', () => {
    const r = decidePermissionLevel(stats({ judgedRuns: 10 }), {}, last({ judgedRuns: 10 }))
    expect(r.level).toBe('L1')
    expect(r.transition).toBe('hold')
    expect(r.reasonCode).toBe('NO_NEW_JUDGED_RUN')
  })

  // 케이스 2 — 표본 부족은 나쁜 소식이 아니라 무소식이다 (중대 15)
  it('표본이 부족하면 유지한다 — 하강시키지 않는다', () => {
    const r = decidePermissionLevel(stats({ rollingFailures: null }), {}, last({ to: 'L3' }))
    expect(r.level).toBe('L3')
    expect(r.transition).toBe('hold')
    expect(r.reasonCode).toBe('INSUFFICIENT_SAMPLE')
  })

  // 케이스 3 — 축소가 승급보다 먼저다
  it('축소 트리거가 켜지면 한 칸 내린다', () => {
    const r = decidePermissionLevel(
      stats({ rollingFailures: 4, demotionTriggered: true }),
      {},
      last({ to: 'L3' }),
    )
    expect(r.level).toBe('L2')
    expect(r.transition).toBe('demote')
    expect(r.reasonCode).toBe('DEMOTE_ROLLING_FAILURES')
  })

  it('축소는 L0 아래로 내려가지 않는다', () => {
    const r = decidePermissionLevel(
      stats({ rollingFailures: 5, demotionTriggered: true }),
      {},
      last({ to: 'L0' }),
    )
    expect(r.level).toBe('L0')
  })

  // 케이스 4 — 승급 차단 신호
  it('인프라 남용 의심이면 승급하지 않는다', () => {
    const r = decidePermissionLevel(stats({ infraAbuseSuspected: true }), {}, last())
    expect(r.transition).toBe('hold')
    expect(r.reasonCode).toBe('INFRA_ABUSE_SUSPECTED')
  })

  it('자기 보고 격차가 있으면 승급하지 않는다', () => {
    const r = decidePermissionLevel(stats({ rollingSelfReportedOnly: 2 }), {}, last())
    expect(r.transition).toBe('hold')
    expect(r.reasonCode).toBe('SELF_REPORT_GAP')
  })

  // 케이스 5 — 승급
  it('창이 깨끗하면 한 칸 올린다', () => {
    const r = decidePermissionLevel(stats({ rollingFailures: PROMOTION_FAILURE_MAX }), {}, last())
    expect(r.level).toBe('L2')
    expect(r.transition).toBe('promote')
    expect(r.reasonCode).toBe('PROMOTE_ROLLING_CLEAN')
  })

  it('한 번에 한 칸만 움직인다 — 두 칸 경로는 없다', () => {
    const r = decidePermissionLevel(stats({ rollingFailures: 0 }), {}, last({ to: 'L0' }))
    expect(r.level).toBe('L1')
  })

  it('승급은 L3 위로 올라가지 않는다 — 머지 경로는 만들지 않는다', () => {
    const r = decidePermissionLevel(stats({ rollingFailures: 0 }), {}, last({ to: 'L3' }))
    expect(r.level).toBe('L3')
  })

  // 케이스 6 — 히스테리시스 (승급 ≤1 / 유지 =2 / 축소 ≥3)
  it('승급선과 축소선 사이는 유지 구간이다', () => {
    const r = decidePermissionLevel(
      stats({ rollingFailures: 2, demotionTriggered: false }),
      {},
      last(),
    )
    expect(r.transition).toBe('hold')
    expect(r.reasonCode).toBe('HOLD_HYSTERESIS')
  })

  // §4.7 — 사람은 낮출 수만 있다
  it('maxLevel 은 상한이다 — 그 위로는 승급하지 않는다', () => {
    const r = decidePermissionLevel(
      stats({ rollingFailures: 0 }),
      { maxLevel: 'L1' as PermissionLevel },
      last(),
    )
    expect(r.level).toBe('L1')
  })

  it('maxLevel 이 현재보다 낮으면 즉시 그 아래로 내린다', () => {
    const r = decidePermissionLevel(
      stats({ rollingFailures: null }),
      { maxLevel: 'L1' as PermissionLevel },
      last({ to: 'L3' }),
    )
    expect(r.level).toBe('L1')
  })

  // 판정은 순수해야 한다 — 원장 쓰기는 T3(policy-log) 소관이다
  it('입력을 변형하지 않는다', () => {
    const s = stats()
    const l = last()
    const snapshot = JSON.stringify({ s, l })
    decidePermissionLevel(s, {}, l)
    expect(JSON.stringify({ s, l })).toBe(snapshot)
  })
})
