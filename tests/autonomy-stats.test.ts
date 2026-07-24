import { describe, it, expect } from 'vitest'
import { calcAutonomyStats } from '../src/commands/stats.js'
import type { AutonomyRunEntry } from '../src/lib/autonomy-log.js'
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

describe('calcAutonomyStats', () => {
  it('빈 로그 → starts 0, completionRate null (0% 위장 금지)', () => {
    const r = calcAutonomyStats([])
    expect(r.starts).toBe(0)
    expect(r.completionRate).toBeNull()
    expect(r.complete).toBe(0)
  })

  it('start 만 있고 complete 없음 → rate 0 (분모>0)', () => {
    const r = calcAutonomyStats([e('start')])
    expect(r.starts).toBe(1)
    expect(r.completionRate).toBe(0)
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
    expect(r.completionRate).toBe(0.5)
  })

  it('interventions>0 complete 는 무인 분자에서 제외', () => {
    const r = calcAutonomyStats([
      e('start', 'a'),
      e('complete', 'a', 2),
    ])
    expect(r.complete).toBe(1)
    expect(r.intervenedComplete).toBe(1)
    expect(r.completionRate).toBe(0)
  })

  it('blocked 카운트', () => {
    const r = calcAutonomyStats([e('start'), e('blocked')])
    expect(r.blocked).toBe(1)
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
