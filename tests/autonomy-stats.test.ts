import { describe, it, expect } from 'vitest'
import { calcAutonomyStats } from '../src/commands/stats.js'
import type { AutonomyRunEntry } from '../src/lib/autonomy-log.js'
import type { ReceiptLogEntry } from '../src/lib/receipt-log.js'
import {
  countAutonomyEvents,
  filterEntriesByDate,
  isValidReportDate,
  renderAutonomyMorningReport,
} from '../src/lib/autonomy-morning-report.js'

function e(
  event: AutonomyRunEntry['event'],
  runId = 'r1',
  interventions?: number,
  ts = '2026-07-25T00:00:00.000Z',
): AutonomyRunEntry {
  return {
    ts,
    runId,
    event,
    ...(interventions !== undefined ? { interventions } : {}),
  }
}

describe('calcAutonomyStats — 자기 보고 지표(참고값)', () => {
  it('빈 로그 → starts 0, selfReportedRate null (0% 위장 금지)', () => {
    const r = calcAutonomyStats([])
    expect(r.starts).toBe(0)
    expect(r.selfReportedRate).toBeNull()
    expect(r.complete).toBe(0)
  })

  it('start 만 있고 complete 없음 → rate 0 (분모>0)', () => {
    const r = calcAutonomyStats([e('start')])
    expect(r.starts).toBe(1)
    expect(r.selfReportedRate).toBe(0)
  })

  it('무인 complete / starts', () => {
    const r = calcAutonomyStats([
      e('start', 'a'),
      e('complete', 'a', 0),
      e('start', 'b'),
      e('hardstop', 'b'),
    ])
    expect(r.starts).toBe(2)
    expect(r.complete).toBe(1)
    expect(r.hardstop).toBe(1)
    expect(r.selfReportedRate).toBe(0.5)
  })

  it('interventions>0 complete 는 무인 분자에서 제외', () => {
    const r = calcAutonomyStats([
      e('start', 'a'),
      e('complete', 'a', 2),
    ])
    expect(r.complete).toBe(1)
    expect(r.intervenedComplete).toBe(1)
    expect(r.selfReportedRate).toBe(0)
  })

  it('blocked 카운트', () => {
    const r = calcAutonomyStats([e('start'), e('blocked')])
    expect(r.blocked).toBe(1)
  })
})

// ── Goal 110: 3중 판정 (검증 통과 + 리포트 유효 + 사람 개입 0) ──────────────────

/** v2 라인 — sha 를 달고 있어야 receipt-log 와 조인된다. */
function v2(
  event: AutonomyRunEntry['event'],
  runId: string,
  sha: string,
  extra: Partial<AutonomyRunEntry> = {},
): AutonomyRunEntry {
  return {
    ts: '2026-08-11T00:00:00.000Z',
    runId,
    event,
    schemaVersion: 2,
    sha,
    ...extra,
  }
}

/** 통과하는 receipt 기본형 — 개별 테스트가 필요한 필드만 덮어쓴다. */
function receipt(sha: string, over: Partial<ReceiptLogEntry> = {}): ReceiptLogEntry {
  return {
    ts: '2026-08-11T00:10:00.000Z',
    decision: 'pass',
    sha,
    shortSha: sha.slice(0, 7),
    red: false,
    gateStatus: 'PASS',
    dirty: false,
    stale: false,
    diffCoverRatio: null,
    diffCoverUncovered: null,
    forbiddenHits: null,
    scopeWarnings: null,
    ...over,
  }
}

describe('calcAutonomyStats — 3중 판정 (Goal 110)', () => {
  it('구 스키마(sha 없음) 런은 판정 불가 — 분자·분모 양쪽에서 제외', () => {
    const r = calcAutonomyStats([e('start', 'a'), e('complete', 'a', 0)])
    expect(r.unjudgeable).toBe(1)
    expect(r.judgedRuns).toBe(0)
    expect(r.completionRate).toBeNull()
    // 자기 보고 지표는 여전히 100% 라고 말한다 — 두 수치의 괴리가 110 의 계측 대상이다.
    expect(r.selfReportedRate).toBe(1)
  })

  it('3중 조건 전부 충족 → 완주 인정', () => {
    const r = calcAutonomyStats(
      [v2('start', 'a', 'sha_start'), v2('complete', 'a', 'sha_end', { interventions: 0 })],
      [receipt('sha_end')],
    )
    expect(r.verifiedComplete).toBe(1)
    expect(r.judgedRuns).toBe(1)
    expect(r.completionRate).toBe(1)
    expect(r.selfReportedOnly).toBe(0)
  })

  it('complete 라고 신고했지만 그 SHA 의 receipt 가 없으면 완주 아님', () => {
    const r = calcAutonomyStats(
      [v2('start', 'a', 'sha_start'), v2('complete', 'a', 'sha_end', { interventions: 0 })],
      [],
    )
    expect(r.verifiedComplete).toBe(0)
    expect(r.selfReportedOnly).toBe(1)
    expect(r.completionRate).toBe(0)
  })

  it('receipt 가 block/red 면 완주 아님 (① 검증 통과 위반)', () => {
    const blocked = calcAutonomyStats(
      [v2('start', 'a', 's0'), v2('complete', 'a', 's1', { interventions: 0 })],
      [receipt('s1', { decision: 'block' })],
    )
    expect(blocked.verifiedComplete).toBe(0)
    const red = calcAutonomyStats(
      [v2('start', 'b', 's0'), v2('complete', 'b', 's2', { interventions: 0 })],
      [receipt('s2', { red: true })],
    )
    expect(red.verifiedComplete).toBe(0)
  })

  it('receipt 가 dirty/stale 이면 완주 아님 (② 리포트 유효 위반)', () => {
    const dirty = calcAutonomyStats(
      [v2('start', 'a', 's0'), v2('complete', 'a', 's1', { interventions: 0 })],
      [receipt('s1', { dirty: true })],
    )
    expect(dirty.verifiedComplete).toBe(0)
    const stale = calcAutonomyStats(
      [v2('start', 'b', 's0'), v2('complete', 'b', 's2', { interventions: 0 })],
      [receipt('s2', { stale: true })],
    )
    expect(stale.verifiedComplete).toBe(0)
  })

  it('stale 미확인(null)은 통과 — 기준선 파일이 로컬 전용이라 CI 에서 항상 null 이다', () => {
    const r = calcAutonomyStats(
      [v2('start', 'a', 's0'), v2('complete', 'a', 's1', { interventions: 0 })],
      [receipt('s1', { stale: null })],
    )
    expect(r.verifiedComplete).toBe(1)
  })

  it('사람 개입이 있으면 게이트가 통과해도 완주 아님 (③ 위반)', () => {
    const r = calcAutonomyStats(
      [v2('start', 'a', 's0'), v2('complete', 'a', 's1', { interventions: 1 })],
      [receipt('s1')],
    )
    expect(r.verifiedComplete).toBe(0)
    expect(r.selfReportedOnly).toBe(1)
  })

  it('같은 SHA 에 receipt 가 여럿이면 마지막 발행이 최종 판정', () => {
    const r = calcAutonomyStats(
      [v2('start', 'a', 's0'), v2('complete', 'a', 's1', { interventions: 0 })],
      [
        receipt('s1', { ts: '2026-08-11T00:00:00.000Z', decision: 'block' }),
        receipt('s1', { ts: '2026-08-11T09:00:00.000Z', decision: 'pass' }),
      ],
    )
    expect(r.verifiedComplete).toBe(1)
  })

  it('인프라 실패는 분모에서 제외 (110-T5)', () => {
    const r = calcAutonomyStats([
      v2('start', 'a', 's0'),
      v2('hardstop', 'a', 's1', { failureKind: 'infra' }),
    ])
    expect(r.infraExcluded).toBe(1)
    expect(r.judgedRuns).toBe(0)
    expect(r.completionRate).toBeNull()
  })

  it('complete 에 붙은 failureKind 는 무시 — 성공을 인프라 예외로 빼는 경로 없음', () => {
    const r = calcAutonomyStats(
      [v2('start', 'a', 's0'), v2('complete', 'a', 's1', { interventions: 0, failureKind: 'infra' })],
      [receipt('s1')],
    )
    // 집계 단계에서도 방어한다(기록 단계 방어는 commands/agent.ts).
    expect(r.judgedRuns + r.infraExcluded).toBe(1)
  })

  it('제품 실패는 분모에 남는다', () => {
    const r = calcAutonomyStats([
      v2('start', 'a', 's0'),
      v2('blocked', 'a', 's1', { failureKind: 'product' }),
    ])
    expect(r.judgedRuns).toBe(1)
    expect(r.completionRate).toBe(0)
    expect(r.infraExcluded).toBe(0)
  })

  it('작업 유형 분포를 판정 대상 런에 대해 집계', () => {
    const r = calcAutonomyStats([
      v2('start', 'a', 's0'),
      v2('complete', 'a', 's1', { taskKind: 'docs' }),
      v2('start', 'b', 's0'),
      v2('hardstop', 'b', 's2', { taskKind: 'schema' }),
    ])
    expect(r.byTaskKind.docs).toBe(1)
    expect(r.byTaskKind.schema).toBe(1)
    expect(r.byTaskKind.source).toBe(0)
  })

  it('유형 값이 닫힌집합 밖이면 unknown 으로 강등 (PAT-001)', () => {
    const r = calcAutonomyStats([
      v2('start', 'a', 's0'),
      v2('complete', 'a', 's1', { taskKind: 'totally-made-up' as never }),
    ])
    expect(r.byTaskKind.unknown).toBe(1)
  })
})

describe('calcAutonomyStats — 롤링 강등 (110-T4)', () => {
  /** n 개의 판정 대상 런. fail 개는 receipt 없이 → 완주 실패. */
  function runs(n: number, fail: number) {
    const entries: AutonomyRunEntry[] = []
    const receipts: ReceiptLogEntry[] = []
    for (let i = 0; i < n; i++) {
      const sha = `sha${i}`
      const ts = `2026-08-${String(11 + i).padStart(2, '0')}T00:00:00.000Z`
      entries.push({ ts, runId: `r${i}`, event: 'start', schemaVersion: 2, sha: 'base' })
      entries.push({ ts, runId: `r${i}`, event: 'complete', schemaVersion: 2, sha, interventions: 0 })
      if (i >= fail) receipts.push(receipt(sha))
    }
    return calcAutonomyStats(entries, receipts)
  }

  it('표본 10 미만이면 판정 보류 — 모름을 0 으로 위장하지 않는다', () => {
    const r = runs(9, 5)
    expect(r.rollingFailures).toBeNull()
    expect(r.demotionTriggered).toBeNull()
  })

  it('최근 10회 중 2회 실패 → 유지 (관찰 게이트 통과 경계)', () => {
    const r = runs(10, 2)
    expect(r.rollingFailures).toBe(2)
    expect(r.demotionTriggered).toBe(false)
  })

  it('최근 10회 중 3회 실패 → 권한 축소', () => {
    const r = runs(10, 3)
    expect(r.rollingFailures).toBe(3)
    expect(r.demotionTriggered).toBe(true)
  })

  it('구간은 최근 10회만 본다 — 오래된 실패는 창 밖으로 빠진다', () => {
    // 앞 5회 실패, 뒤 10회 성공 → 최근 10회 창에는 실패 0
    const r = runs(15, 5)
    expect(r.rollingFailures).toBe(0)
    expect(r.demotionTriggered).toBe(false)
  })
})

describe('autonomy morning report', () => {
  it('countAutonomyEvents aggregates', () => {
    const c = countAutonomyEvents([
      e('start', 'x'),
      e('complete', 'x'),
      e('start', 'y'),
      e('blocked', 'y'),
    ])
    expect(c.starts).toBe(2)
    expect(c.complete).toBe(1)
    expect(c.blocked).toBe(1)
    expect(c.runIds.sort()).toEqual(['x', 'y'])
  })

  it('render includes PR URL and counts', () => {
    const md = renderAutonomyMorningReport({
      date: '2026-07-25',
      prUrl: 'https://github.com/byh3071-cpu/vhk/pull/1',
      entries: [e('start', 'r'), e('complete', 'r')],
    })
    expect(md).toContain('2026-07-25')
    expect(md).toContain('https://github.com/byh3071-cpu/vhk/pull/1')
    expect(md).toContain('**complete**: 1')
    expect(md).toContain('r')
  })

  it('missing PR → honest placeholder', () => {
    const md = renderAutonomyMorningReport({ date: '2026-07-25', entries: [] })
    expect(md).toContain('(none — not opened yet)')
    expect(md).toContain('**starts**: 0')
  })

  it('isValidReportDate rejects path-like dates', () => {
    expect(isValidReportDate('2026-07-25')).toBe(true)
    expect(isValidReportDate('../../README')).toBe(false)
    expect(isValidReportDate('2026/07/25')).toBe(false)
  })

  it('render counts only entries for that calendar day', () => {
    const md = renderAutonomyMorningReport({
      date: '2026-07-25',
      entries: [
        e('start', 'today', undefined, '2026-07-25T10:00:00.000Z'),
        e('complete', 'today', 0, '2026-07-25T11:00:00.000Z'),
        e('start', 'yesterday', undefined, '2026-07-24T10:00:00.000Z'),
        e('complete', 'yesterday', 0, '2026-07-24T11:00:00.000Z'),
      ],
    })
    expect(md).toContain('**starts**: 1')
    expect(md).toContain('**complete**: 1')
    expect(md).toContain('today')
    expect(md).not.toContain('yesterday')
  })

  it('filterEntriesByDate returns empty for invalid date', () => {
    expect(filterEntriesByDate([e('start')], '../x')).toEqual([])
  })
})
