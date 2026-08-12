import { describe, it, expect } from 'vitest'
import {
  buildHeadOidCounts,
  classifyCohort,
  countHighCarryoverMornings,
  judgeBottleneck,
  AUTONOMOUS_LABEL,
  MIN_OBSERVED_SAMPLES,
} from '../src/lib/pr-metrics.js'
import type { PrRecord } from '../src/lib/pr-metrics-github.js'

// Goal 111-T4 (3/3): cohort 이중 신호 + 5상태 판정 계약 고정.

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

describe('classifyCohort — autonomous 는 이중 신호일 때만', () => {
  const shas = new Set(['sha1'])

  it('정확 SHA 일치 AND 라벨 → autonomous', () => {
    const p = pr({ labels: [AUTONOMOUS_LABEL] })
    expect(classifyCohort(p, shas, buildHeadOidCounts([p]))).toBe('autonomous')
  })

  it('SHA 만 일치 (라벨 부착 실패) → unknown — interactive 로 위장 금지', () => {
    const p = pr()
    expect(classifyCohort(p, shas, buildHeadOidCounts([p]))).toBe('unknown')
  })

  it('라벨만 있음 (원장에 없음 — 수동 라벨 등) → unknown', () => {
    const p = pr({ headRefOid: 'other', labels: [AUTONOMOUS_LABEL] })
    expect(classifyCohort(p, shas, buildHeadOidCounts([p]))).toBe('unknown')
  })

  it('같은 SHA 를 head 로 가진 PR 이 복수 → 둘 다 unknown', () => {
    const a = pr({ number: 1, labels: [AUTONOMOUS_LABEL] })
    const b = pr({ number: 2, labels: [AUTONOMOUS_LABEL] })
    const counts = buildHeadOidCounts([a, b])
    expect(classifyCohort(a, shas, counts)).toBe('unknown')
    expect(classifyCohort(b, shas, counts)).toBe('unknown')
  })

  it('두 신호 모두 없음 → interactive', () => {
    const p = pr({ headRefOid: 'other' })
    expect(classifyCohort(p, shas, buildHeadOidCounts([p]))).toBe('interactive')
  })
})

describe('judgeBottleneck — 5상태 완결', () => {
  const okSamples = Array.from({ length: MIN_OBSERVED_SAMPLES }, () => 50) // 중앙값 50h > 48h

  it('API 자료 불완전 → 측정 불가 (표본이 충분해도)', () => {
    const j = judgeBottleneck({
      apiComplete: false,
      windowDays: 28,
      observedAutonomousWaitHours: okSamples,
      carryoverHighMornings: 5,
    })
    expect(j.verdict).toBe('unmeasurable')
    expect(j.waitExceeded).toBeNull()
  })

  it('4주 미만 → 데이터 부족', () => {
    expect(
      judgeBottleneck({
        apiComplete: true,
        windowDays: 27,
        observedAutonomousWaitHours: okSamples,
        carryoverHighMornings: 5,
      }).verdict,
    ).toBe('insufficient-data')
  })

  it('관측 완료 표본 10 미만 → 데이터 부족 (PR 수가 아니라 관측 완료 수)', () => {
    expect(
      judgeBottleneck({
        apiComplete: true,
        windowDays: 28,
        observedAutonomousWaitHours: okSamples.slice(0, 9),
        carryoverHighMornings: 5,
      }).verdict,
    ).toBe('insufficient-data')
  })

  it('두 지표 모두 초과 → 병목 확정', () => {
    const j = judgeBottleneck({
      apiComplete: true,
      windowDays: 28,
      observedAutonomousWaitHours: okSamples,
      carryoverHighMornings: 3,
    })
    expect(j.verdict).toBe('confirmed')
    expect(j.waitExceeded).toBe(true)
    expect(j.carryoverExceeded).toBe(true)
  })

  it('한 지표만 초과 → 혼합 신호·사람 검토', () => {
    expect(
      judgeBottleneck({
        apiComplete: true,
        windowDays: 28,
        observedAutonomousWaitHours: okSamples,
        carryoverHighMornings: 2,
      }).verdict,
    ).toBe('mixed')
  })

  it('어느 지표도 초과 안 함 → 병목 미입증', () => {
    const calm = Array.from({ length: 10 }, () => 1)
    expect(
      judgeBottleneck({
        apiComplete: true,
        windowDays: 28,
        observedAutonomousWaitHours: calm,
        carryoverHighMornings: 0,
      }).verdict,
    ).toBe('not-proven')
  })

  it('정확 비교 — 중앙값 정확히 48h 는 초과가 아니다', () => {
    const exactly48 = Array.from({ length: 10 }, () => 48)
    const j = judgeBottleneck({
      apiComplete: true,
      windowDays: 28,
      observedAutonomousWaitHours: exactly48,
      carryoverHighMornings: 0,
    })
    expect(j.waitExceeded).toBe(false)
  })
})

describe('countHighCarryoverMornings', () => {
  it('이월 3건 이상인 아침만 센다', () => {
    // PR 3개가 조치 없이 열려 있음 → 각 아침 이월 3 → high
    const prs = [pr({ number: 1 }), pr({ number: 2 }), pr({ number: 3 })]
    const mornings = ['2026-08-05T00:00:00Z', '2026-08-06T00:00:00Z']
    expect(countHighCarryoverMornings(prs, mornings)).toBe(2)
    // PR 2개면 이월 2 → high 아님
    expect(countHighCarryoverMornings(prs.slice(0, 2), mornings)).toBe(0)
  })
})
