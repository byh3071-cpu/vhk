import { describe, it, expect } from 'vitest'
import {
  fetchPrWindow,
  ghAvailability,
  parsePrNode,
  parseTimelineNode,
  type GhRunner,
} from '../src/lib/pr-metrics-github.js'

// Goal 111-T4 (1/3): GitHub 어댑터 — mock runner 로 페이지네이션·부분 실패 계약 고정.

function prNode(number: number, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    number,
    createdAt: '2026-08-01T00:00:00Z',
    mergedAt: null,
    closedAt: null,
    isDraft: false,
    headRefOid: `sha${number}`,
    author: { login: 'byh3071-cpu', __typename: 'User' },
    labels: { nodes: [] },
    commits: { pageInfo: { hasNextPage: false }, nodes: [{ commit: { oid: `sha${number}` } }] },
    timelineItems: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
    ...over,
  }
}

function pageResponse(nodes: unknown[], hasNextPage = false, endCursor: string | null = null): string {
  return JSON.stringify({
    data: { repository: { pullRequests: { pageInfo: { hasNextPage, endCursor }, nodes } } },
  })
}

const REPO_JSON = JSON.stringify({ owner: { login: 'o' }, name: 'r' })

/** 호출 순서대로 응답을 돌려주는 mock runner. */
function scriptedRunner(script: Array<{ match: (args: string[]) => boolean; ok: boolean; out: string }>): GhRunner {
  return (args: string[]) => {
    for (const s of script) {
      if (s.match(args)) return { ok: s.ok, out: s.out }
    }
    return { ok: false, out: '', err: `unexpected call: ${args.join(' ')}` }
  }
}

const isRepoView = (a: string[]) => a[0] === 'repo'
const isPrPage = (states: string) => (a: string[]) =>
  a[0] === 'api' && a.includes(`states=${states}`)
const hasCursor = (cursor: string) => (a: string[]) => a.includes(`after=${cursor}`)

describe('parseTimelineNode', () => {
  it('6종 이벤트 매핑 + 봇 판별', () => {
    expect(
      parseTimelineNode({ __typename: 'ReadyForReviewEvent', createdAt: 't', actor: { login: 'u' } })!.type,
    ).toBe('ready')
    expect(
      parseTimelineNode({ __typename: 'ConvertToDraftEvent', createdAt: 't', actor: { login: 'u' } })!.type,
    ).toBe('convert_to_draft')
    const bot = parseTimelineNode({
      __typename: 'IssueComment',
      createdAt: 't',
      author: { login: 'coderabbitai[bot]', __typename: 'Bot' },
    })!
    expect(bot.actorIsBot).toBe(true)
  })

  it('미지 타입·시각 없는 노드는 null', () => {
    expect(parseTimelineNode({ __typename: 'LabeledEvent', createdAt: 't' })).toBeNull()
    expect(parseTimelineNode({ __typename: 'MergedEvent' })).toBeNull()
  })
})

describe('parsePrNode', () => {
  it('커밋 페이지 잘림 → commitsComplete=false', () => {
    const p = parsePrNode(prNode(1, { commits: { pageInfo: { hasNextPage: true }, nodes: [] } }))!
    expect(p.record.commitsComplete).toBe(false)
  })

  it('타임라인 페이지 잘림 → timelineComplete=false + 커서 반환', () => {
    const p = parsePrNode(
      prNode(1, { timelineItems: { pageInfo: { hasNextPage: true, endCursor: 'C1' }, nodes: [] } }),
    )!
    expect(p.record.timelineComplete).toBe(false)
    expect(p.timelineCursor).toBe('C1')
  })

  it('필수 필드 없으면 null', () => {
    expect(parsePrNode({ createdAt: 't' })).toBeNull()
  })
})

describe('ghAvailability', () => {
  it('미설치·미인증을 구분해 보고', () => {
    const noGh: GhRunner = () => ({ ok: false, out: '' })
    expect(ghAvailability(noGh).reason).toBe('gh 미설치')
    const noAuth: GhRunner = (a) => (a[0] === '--version' ? { ok: true, out: 'gh' } : { ok: false, out: '' })
    expect(ghAvailability(noAuth).reason).toBe('gh 미인증')
  })
})

describe('fetchPrWindow', () => {
  it('OPEN + 창 내 생성 두 패스를 number 로 dedupe', () => {
    const runner = scriptedRunner([
      { match: isRepoView, ok: true, out: REPO_JSON },
      { match: isPrPage('OPEN'), ok: true, out: pageResponse([prNode(1)]) },
      { match: isPrPage('MERGED,CLOSED'), ok: true, out: pageResponse([prNode(2), prNode(1)]) },
    ])
    const r = fetchPrWindow('2026-07-01T00:00:00Z', runner)
    expect(r.prs.map((p) => p.number).sort()).toEqual([1, 2])
    expect(r.listComplete).toBe(true)
    expect(r.errors).toEqual([])
  })

  it('sinceIso 이전 생성 PR 에서 두 번째 패스가 멈춘다', () => {
    const runner = scriptedRunner([
      { match: isRepoView, ok: true, out: REPO_JSON },
      { match: isPrPage('OPEN'), ok: true, out: pageResponse([]) },
      {
        match: isPrPage('MERGED,CLOSED'),
        ok: true,
        out: pageResponse(
          [prNode(9), prNode(8, { createdAt: '2026-01-01T00:00:00Z' }), prNode(7)],
          true,
          'NEXT',
        ),
      },
    ])
    const r = fetchPrWindow('2026-07-01T00:00:00Z', runner)
    // 8 에서 멈춤 — 7 은 수집 안 됨, 다음 페이지 요청도 없음(runner 에 NEXT 응답 없어도 에러 0)
    expect(r.prs.map((p) => p.number)).toEqual([9])
    expect(r.errors).toEqual([])
  })

  it('페이지네이션 — 커서 따라 다음 페이지 수집', () => {
    const runner = scriptedRunner([
      { match: isRepoView, ok: true, out: REPO_JSON },
      {
        match: (a) => isPrPage('OPEN')(a) && hasCursor('C1')(a),
        ok: true,
        out: pageResponse([prNode(2)]),
      },
      { match: isPrPage('OPEN'), ok: true, out: pageResponse([prNode(1)], true, 'C1') },
      { match: isPrPage('MERGED,CLOSED'), ok: true, out: pageResponse([]) },
    ])
    const r = fetchPrWindow('2026-07-01T00:00:00Z', runner)
    expect(r.prs.map((p) => p.number).sort()).toEqual([1, 2])
  })

  it('목록 조회 실패 → listComplete=false + errors 기록 (0 위장 금지)', () => {
    const runner = scriptedRunner([
      { match: isRepoView, ok: true, out: REPO_JSON },
      { match: isPrPage('OPEN'), ok: false, out: '' },
      { match: isPrPage('MERGED,CLOSED'), ok: true, out: pageResponse([prNode(3)]) },
    ])
    const r = fetchPrWindow('2026-07-01T00:00:00Z', runner)
    expect(r.listComplete).toBe(false)
    expect(r.errors.length).toBeGreaterThan(0)
    expect(r.prs.map((p) => p.number)).toEqual([3])
  })

  it('타임라인 후속 페이지 실패 → 해당 PR 만 timelineComplete=false', () => {
    const runner = scriptedRunner([
      { match: isRepoView, ok: true, out: REPO_JSON },
      {
        match: isPrPage('OPEN'),
        ok: true,
        out: pageResponse([
          prNode(1, { timelineItems: { pageInfo: { hasNextPage: true, endCursor: 'T1' }, nodes: [] } }),
        ]),
      },
      { match: isPrPage('MERGED,CLOSED'), ok: true, out: pageResponse([]) },
      // 타임라인 후속 조회는 매칭 안 됨 → 실패
    ])
    const r = fetchPrWindow('2026-07-01T00:00:00Z', runner)
    expect(r.prs[0]!.timelineComplete).toBe(false)
    expect(r.errors.some((e) => e.includes('#1'))).toBe(true)
  })

  it('저장소 식별 실패 → 빈 결과 + 명시 에러', () => {
    const runner = scriptedRunner([{ match: isRepoView, ok: false, out: '' }])
    const r = fetchPrWindow('2026-07-01T00:00:00Z', runner)
    expect(r.prs).toEqual([])
    expect(r.listComplete).toBe(false)
    expect(r.errors[0]).toContain('저장소 식별 실패')
  })
})
