import { describe, it, expect } from 'vitest'
import { buildDigest, type EvolveQueueItem } from '../src/commands/evolve.js'
import type { PatternEntryV19 } from '../src/commands/pattern.js'

// N5(ⓓ): buildDigest 순수함수 — pending 후보 + 패턴 → 신뢰도 부여·정렬.

function item(id: string, patternId: string): EvolveQueueItem {
  return {
    id,
    patternId,
    kind: 'rule',
    targetLayer: 'rule',
    status: 'pending',
    draft: `- 초안 ${id}`,
    dedupeKey: `${patternId}:rule`,
    createdAt: '2026-01-01T00:00:00Z',
  }
}

function pat(id: string, count: number): PatternEntryV19 {
  return {
    id,
    kind: 'avoid',
    axis: 'tag',
    signal: 'x',
    count,
    sources: [],
    summary: 's',
    createdAt: '2026-01-01T00:00:00Z',
    status: 'active',
    tags: [],
  } as PatternEntryV19
}

describe('buildDigest (결정론)', () => {
  it('빈도 → 신뢰도 매핑 (5+=high · 3~4=med · <3=low)', () => {
    const d = buildDigest(
      [item('e1', 'p1'), item('e2', 'p2'), item('e3', 'p3')],
      [pat('p1', 6), pat('p2', 3), pat('p3', 1)],
    )
    const byId = Object.fromEntries(d.map((x) => [x.id, x]))
    expect(byId.e1.confidence).toBe('high')
    expect(byId.e2.confidence).toBe('med')
    expect(byId.e3.confidence).toBe('low')
  })

  it('패턴 미상 → patternCount 0, low', () => {
    const d = buildDigest([item('e1', 'ghost')], [])
    expect(d[0].patternCount).toBe(0)
    expect(d[0].confidence).toBe('low')
  })

  it('빈도 내림차순 정렬 (동률은 id 오름차순)', () => {
    const d = buildDigest(
      [item('e2', 'p2'), item('e1', 'p1'), item('e3', 'p3')],
      [pat('p1', 5), pat('p2', 5), pat('p3', 9)],
    )
    // p3(9) 먼저, 그다음 5동률은 id 오름차순 e1·e2
    expect(d.map((x) => x.id)).toEqual(['e3', 'e1', 'e2'])
  })

  it('경계 — count 5 high · 4 med · 2 low', () => {
    const d = buildDigest(
      [item('e5', 'p5'), item('e4', 'p4'), item('e2', 'p2')],
      [pat('p5', 5), pat('p4', 4), pat('p2', 2)],
    )
    const byId = Object.fromEntries(d.map((x) => [x.id, x]))
    expect(byId.e5.confidence).toBe('high')
    expect(byId.e4.confidence).toBe('med')
    expect(byId.e2.confidence).toBe('low')
  })

  it('빈 입력 → 빈 digest', () => {
    expect(buildDigest([], [])).toEqual([])
  })
})
