import { describe, it, expect } from 'vitest'
import { buildBottleneckView } from '../src/commands/stats.js'
import type { AutonomyRunEntry, MorningObservation } from '../src/lib/autonomy-log.js'
import type { PrRecord, PrTimelineEvent } from '../src/lib/pr-metrics-github.js'
import { AUTONOMOUS_LABEL } from '../src/lib/pr-metrics.js'

// Goal 111-T6: 병목 뷰 조립(순수) — cohort 분리·censored·응답률·판정 연결 계약.

const NOW = '2026-08-30T12:00:00Z'

function ev(type: PrTimelineEvent['type'], ts: string, isBot = false): PrTimelineEvent {
  return { type, ts, actorLogin: isBot ? 'bot[bot]' : 'human', actorIsBot: isBot }
}

function pr(number: number, over: Partial<PrRecord> = {}): PrRecord {
  return {
    number,
    createdAt: '2026-08-20T00:00:00Z',
    mergedAt: null,
    closedAt: null,
    isDraft: false,
    headRefOid: `sha${number}`,
    authorLogin: 'sample-user',
    authorIsBot: false,
    labels: [],
    labelsComplete: true,
    commitOids: [`sha${number}`],
    commitsComplete: true,
    timeline: [],
    timelineComplete: true,
    ...over,
  }
}

/** sha 를 남긴 v2 종결 이벤트 — 측정 기점이자 cohort 1차 신호. */
function terminalRun(sha: string, ts = '2026-08-01T00:00:00Z'): AutonomyRunEntry {
  return { ts, runId: `r-${sha}`, event: 'complete', schemaVersion: 2, sha }
}

function morning(date: string, values: Partial<MorningObservation> = {}): MorningObservation {
  return { kind: 'morning', ts: `${date}T00:10:00Z`, date, ...values }
}

describe('buildBottleneckView — cohort 분리', () => {
  it('autonomous(이중 신호) 관측과 interactive 관측이 서로 안 섞인다', () => {
    const prs = [
      pr(1, { labels: [AUTONOMOUS_LABEL], timeline: [ev('review', '2026-08-22T00:00:00Z')] }), // auto 48h
      pr(2, { headRefOid: 'other', timeline: [ev('review', '2026-08-20T01:00:00Z')] }), // interactive 1h
    ]
    const v = buildBottleneckView(prs, [terminalRun('sha1')], [], NOW, true)
    expect(v.cohortCounts.autonomous).toBe(1)
    expect(v.cohortCounts.interactive).toBe(1)
    expect(v.observedCount).toBe(1)
    expect(v.interactiveMedianHours).toBe(1)
  })

  it('unknown(신호 하나만)은 어느 지표에도 안 들어간다', () => {
    const prs = [pr(1, { timeline: [ev('review', '2026-08-21T00:00:00Z')] })] // sha 만, 라벨 없음
    const v = buildBottleneckView(prs, [terminalRun('sha1')], [], NOW, true)
    expect(v.cohortCounts.unknown).toBe(1)
    expect(v.observedCount).toBe(0)
    expect(v.interactiveMedianHours).toBeNull()
  })

  it('봇 PR 은 cohort 집계 자체에서 제외', () => {
    const v = buildBottleneckView([pr(1, { authorIsBot: true })], [], [], NOW, true)
    expect(v.cohortCounts.autonomous + v.cohortCounts.interactive + v.cohortCounts.unknown).toBe(0)
  })
})

describe('buildBottleneckView — censored·측정 기점', () => {
  it('조치 없는 autonomous PR 은 censored 로 따로 센다', () => {
    const prs = [pr(1, { labels: [AUTONOMOUS_LABEL] })]
    const v = buildBottleneckView(prs, [terminalRun('sha1')], [], NOW, true)
    expect(v.censoredCount).toBe(1)
    expect(v.censoredMaxAgeHours).toBeGreaterThan(24 * 9)
    expect(v.observedCount).toBe(0)
  })

  it('windowDays 는 sha 있는 첫 종결 이벤트부터 — 원장이 비면 0', () => {
    expect(buildBottleneckView([], [], [], NOW, true).windowDays).toBe(0)
    // 기점 8/1 → 8/30 = 29일이지만 상한 28
    expect(buildBottleneckView([], [terminalRun('s', '2026-08-01T00:00:00Z')], [], NOW, true).windowDays).toBe(28)
    expect(
      buildBottleneckView([], [terminalRun('s', '2026-08-25T00:00:00Z')], [], NOW, true).windowDays,
    ).toBe(5)
  })

  it('구형 라인(sha 없음)은 측정 기점이 아니다', () => {
    const legacy: AutonomyRunEntry = { ts: '2026-07-01T00:00:00Z', runId: 'old', event: 'complete' }
    expect(buildBottleneckView([], [legacy], [], NOW, true).windowDays).toBe(0)
  })

  // ── 반례3 회귀 (2026-08-12 머지 보류 감사) ──

  it('반례3a: hardstop 은 측정 기점이 아니다 — complete 만 관찰 시계를 연다', () => {
    const hardstop: AutonomyRunEntry = {
      ts: '2026-08-01T00:00:00Z',
      runId: 'h1',
      event: 'hardstop',
      schemaVersion: 2,
      sha: 'shaH',
    }
    expect(buildBottleneckView([], [hardstop], [], NOW, true).windowDays).toBe(0)
  })

  it('반례3b: hardstop SHA 는 cohort 신호가 아니다 — 라벨만 남으면 unknown', () => {
    const hardstop: AutonomyRunEntry = {
      ts: '2026-08-01T00:00:00Z',
      runId: 'h1',
      event: 'hardstop',
      schemaVersion: 2,
      sha: 'sha1',
    }
    const prs = [pr(1, { labels: [AUTONOMOUS_LABEL], timeline: [ev('review', '2026-08-21T00:00:00Z')] })]
    const v = buildBottleneckView(prs, [hardstop], [], NOW, true)
    expect(v.cohortCounts.autonomous).toBe(0)
    expect(v.cohortCounts.unknown).toBe(1)
  })

  it('반례5: 리뷰 수정 커밋으로 headRefOid 가 밀린 autonomous PR — commits 폴백으로 복원', () => {
    // complete.sha 가 PR 의 커밋 목록엔 있지만 headRefOid(후속 커밋)와는 다르다
    const prs = [
      pr(1, {
        headRefOid: 'followup-sha',
        commitOids: ['sha1', 'followup-sha'],
        labels: [AUTONOMOUS_LABEL],
        timeline: [ev('review', '2026-08-21T00:00:00Z')],
      }),
    ]
    const v = buildBottleneckView(prs, [terminalRun('sha1')], [], NOW, true)
    expect(v.cohortCounts.autonomous).toBe(1)
    expect(v.cohortCounts.unknown).toBe(0)
  })
})

describe('buildBottleneckView — 판정 연결', () => {
  it('API 불완전이면 표본과 무관하게 측정 불가', () => {
    const v = buildBottleneckView([], [terminalRun('s')], [], NOW, false)
    expect(v.judgment.verdict).toBe('unmeasurable')
  })

  it('기점 없음 + 자료 완전 → 데이터 부족 (0% 위장 없음)', () => {
    const v = buildBottleneckView([], [], [], NOW, true)
    expect(v.judgment.verdict).toBe('insufficient-data')
    expect(v.judgment.medianWaitHours).toBeNull()
  })
})

describe('buildBottleneckView — 자기신고 응답률', () => {
  it('응답률 = 값 있는 관측일 / 리포트 실행 관측일', () => {
    const obs = [
      morning('2026-08-27', { trackingMin: 5 }),
      morning('2026-08-28'), // 실행만, 값 없음
      morning('2026-08-29', { uncheckedApprovals: 1, approvalDecisionsTotal: 2 }),
    ]
    const v = buildBottleneckView([], [], obs, NOW, true)
    expect(v.selfReportDays).toBe(3)
    expect(v.selfReportResponseRate).toBeCloseTo(2 / 3)
  })

  it('값 있던 날은 값 없는 재실행으로 지워지지 않는다 — 값 있는 관측 우선', () => {
    const obs = [morning('2026-08-27', { trackingMin: 5 }), morning('2026-08-27')]
    const v = buildBottleneckView([], [], obs, NOW, true)
    expect(v.selfReportDays).toBe(1)
    expect(v.selfReportResponseRate).toBe(1)
  })

  it('unchecked 만 있고 total 없으면 값으로 안 친다 (비율 계산 불가)', () => {
    const obs = [morning('2026-08-27', { uncheckedApprovals: 1 })]
    const v = buildBottleneckView([], [], obs, NOW, true)
    expect(v.selfReportResponseRate).toBe(0)
  })

  it('관측일 0 이면 응답률 null — 0% 위장 금지', () => {
    const v = buildBottleneckView([], [], [], NOW, true)
    expect(v.selfReportResponseRate).toBeNull()
  })
})
