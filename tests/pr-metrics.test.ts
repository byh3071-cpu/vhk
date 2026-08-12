import { describe, it, expect } from 'vitest'
import {
  buildReadyIntervals,
  carryoverAtMorning,
  computeWait,
  firstEligibleHumanAction,
  generateMornings,
  median,
} from '../src/lib/pr-metrics.js'
import type { PrRecord, PrTimelineEvent } from '../src/lib/pr-metrics-github.js'

// Goal 111-T4 (2/3): 순수 계산 계약 고정 — 특히 open/censored 분리와 이월의 "조치 없음" 조건.

function ev(type: PrTimelineEvent['type'], ts: string, isBot = false): PrTimelineEvent {
  return { type, ts, actorLogin: isBot ? 'bot[bot]' : 'human', actorIsBot: isBot }
}

function pr(over: Partial<PrRecord> = {}): PrRecord {
  return {
    number: 1,
    createdAt: '2026-08-01T00:00:00Z',
    mergedAt: null,
    closedAt: null,
    isDraft: false,
    headRefOid: 'sha1',
    authorLogin: 'byh3071-cpu',
    authorIsBot: false,
    labels: [],
    commitOids: ['sha1'],
    commitsComplete: true,
    timeline: [],
    timelineComplete: true,
    ...over,
  }
}

const NOW = '2026-08-10T00:00:00Z'

describe('buildReadyIntervals — ready 상태 머신', () => {
  it('전이 이력 없음 + 현재 non-draft → 생성부터 ready', () => {
    expect(buildReadyIntervals('2026-08-01T00:00:00Z', false, [])).toEqual([
      { start: '2026-08-01T00:00:00Z', end: null },
    ])
  })

  it('전이 이력 없음 + 현재 draft → ready 구간 없음', () => {
    expect(buildReadyIntervals('2026-08-01T00:00:00Z', true, [])).toEqual([])
  })

  it('첫 이벤트가 ready → 생성 시 draft 였음', () => {
    const iv = buildReadyIntervals('2026-08-01T00:00:00Z', false, [ev('ready', '2026-08-02T00:00:00Z')])
    expect(iv).toEqual([{ start: '2026-08-02T00:00:00Z', end: null }])
  })

  it('재-draft 왕복: ready → draft → ready 를 구간 2개로 복원', () => {
    const iv = buildReadyIntervals('2026-08-01T00:00:00Z', false, [
      ev('convert_to_draft', '2026-08-02T00:00:00Z'),
      ev('ready', '2026-08-03T00:00:00Z'),
    ])
    expect(iv).toEqual([
      { start: '2026-08-01T00:00:00Z', end: '2026-08-02T00:00:00Z' },
      { start: '2026-08-03T00:00:00Z', end: null },
    ])
  })

  it('이벤트가 역순으로 와도 시각순 처리', () => {
    const iv = buildReadyIntervals('2026-08-01T00:00:00Z', false, [
      ev('ready', '2026-08-03T00:00:00Z'),
      ev('convert_to_draft', '2026-08-02T00:00:00Z'),
    ])
    expect(iv).toHaveLength(2)
  })
})

describe('firstEligibleHumanAction', () => {
  it('봇 조치는 적격이 아니다', () => {
    expect(firstEligibleHumanAction([ev('comment', '2026-08-02T00:00:00Z', true)])).toBeNull()
  })

  it('가장 이른 사람 조치를 고른다', () => {
    const t = firstEligibleHumanAction([
      ev('merged', '2026-08-03T00:00:00Z'),
      ev('review', '2026-08-02T00:00:00Z'),
      ev('comment', '2026-08-01T12:00:00Z', true),
    ])
    expect(t).toBe('2026-08-02T00:00:00Z')
  })
})

describe('computeWait — 관측/censored/제외 분리', () => {
  it('열린 PR 이라도 사람 리뷰가 있으면 관측 완료 (open ≠ 미관측)', () => {
    const w = computeWait(pr({ timeline: [ev('review', '2026-08-01T06:00:00Z')] }), NOW)
    expect(w.waitHours).toBe(6)
    expect(w.censored).toBe(false)
  })

  it('조치 없는 열린 PR 은 censored — 나이가 잡힌다', () => {
    const w = computeWait(pr(), NOW)
    expect(w.censored).toBe(true)
    expect(w.censoredAgeHours).toBe(216) // 8/1 → 8/10 = 9일
    expect(w.waitHours).toBeNull()
  })

  it('봇 코멘트만 있는 PR 은 여전히 censored', () => {
    const w = computeWait(pr({ timeline: [ev('comment', '2026-08-02T00:00:00Z', true)] }), NOW)
    expect(w.censored).toBe(true)
  })

  it('재-draft 후 ready 된 PR 의 대기는 마지막 ready 시작부터', () => {
    const w = computeWait(
      pr({
        timeline: [
          ev('convert_to_draft', '2026-08-02T00:00:00Z'),
          ev('ready', '2026-08-05T00:00:00Z'),
          ev('review', '2026-08-05T12:00:00Z'),
        ],
      }),
      NOW,
    )
    expect(w.waitHours).toBe(12)
  })

  it('줄곧 draft 인 PR 은 제외 (censored 아님)', () => {
    const w = computeWait(pr({ isDraft: true }), NOW)
    expect(w.excluded).toBe(true)
    expect(w.censored).toBe(false)
  })

  it('사람 조치 없이 종결된 PR 은 제외 — 봇 종결을 관측으로 위장하지 않음', () => {
    const w = computeWait(
      pr({ mergedAt: '2026-08-03T00:00:00Z', timeline: [ev('merged', '2026-08-03T00:00:00Z', true)] }),
      NOW,
    )
    expect(w.excluded).toBe(true)
    expect(w.excludedReason).toContain('종결')
  })

  it('사람 머지는 관측 완료다', () => {
    const w = computeWait(
      pr({ mergedAt: '2026-08-02T00:00:00Z', timeline: [ev('merged', '2026-08-02T00:00:00Z')] }),
      NOW,
    )
    expect(w.waitHours).toBe(24)
  })
})

describe('carryoverAtMorning — open + ready 24h + 조치 없음', () => {
  const MORNING = '2026-08-05T00:00:00Z'

  it('조치 없는 오래된 open PR 은 이월', () => {
    expect(carryoverAtMorning([pr()], MORNING)).toBe(1)
  })

  it('이미 사람 리뷰가 있으면 오래 열려 있어도 이월 아님 — CI·수정 대기는 사람 병목이 아니다', () => {
    expect(carryoverAtMorning([pr({ timeline: [ev('review', '2026-08-02T00:00:00Z')] })], MORNING)).toBe(0)
  })

  it('ready 24h 미만은 이월 아님', () => {
    expect(carryoverAtMorning([pr({ createdAt: '2026-08-04T06:00:00Z' })], MORNING)).toBe(0)
  })

  it('관측 시각에 draft 상태면 이월 아님', () => {
    expect(
      carryoverAtMorning([pr({ isDraft: true, timeline: [ev('convert_to_draft', '2026-08-02T00:00:00Z')] })], MORNING),
    ).toBe(0)
  })

  it('관측 시각 이후에 닫힌 PR 은 그 시각엔 open — 이월로 센다', () => {
    expect(carryoverAtMorning([pr({ closedAt: '2026-08-06T00:00:00Z' })], MORNING)).toBe(1)
  })

  it('봇 PR 은 제외', () => {
    expect(carryoverAtMorning([pr({ authorIsBot: true })], MORNING)).toBe(0)
  })

  it('관측 시각 이후 조치는 그 아침 이월에 영향 없음 (결정론 재구성)', () => {
    expect(carryoverAtMorning([pr({ timeline: [ev('review', '2026-08-07T00:00:00Z')] })], MORNING)).toBe(1)
  })
})

describe('generateMornings · median', () => {
  it('창 안의 아침 시각을 하루 간격으로 생성', () => {
    const m = generateMornings('2026-08-01T00:00:00Z', '2026-08-04T23:00:00Z', 9)
    expect(m.length).toBeGreaterThanOrEqual(3)
    expect(m.length).toBeLessThanOrEqual(4)
  })

  it('median — 짝수·홀수·빈 배열', () => {
    expect(median([])).toBeNull()
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })
})
