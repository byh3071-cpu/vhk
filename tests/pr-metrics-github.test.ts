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
    author: { login: 'sample-user', __typename: 'User' },
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

/** 매칭 규칙 우선순위로 응답을 고르는 mock runner — script 배열의 앞 항목이 먼저 매칭된다. */
function scriptedRunner(script: Array<{ match: (args: string[]) => boolean; ok: boolean; out: string }>): GhRunner {
  return (args: string[]) => {
    for (const s of script) {
      if (s.match(args)) return { ok: s.ok, out: s.out }
    }
    return { ok: false, out: '', err: `unexpected call: ${args.join(' ')}` }
  }
}

const isRepoView = (a: string[]) => a[0] === 'repo'
// states 는 gh 변수로 못 넘겨(GraphQL enum 배열) 쿼리 텍스트에 인라인된다 — 텍스트로 매칭.
const isPrPage = (states: string) => (a: string[]) =>
  a[0] === 'api' && a.some((arg) => arg.includes(`states:[${states}]`))
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

  // ── 반례 회귀 (2026-08-12 머지 보류 감사) ──

  it('반례2: 창 이전 생성 + 창 안 종결 PR 을 수집한다 (updatedAt 기준 종료 패스)', () => {
    const runner = scriptedRunner([
      { match: isRepoView, ok: true, out: REPO_JSON },
      { match: isPrPage('OPEN'), ok: true, out: pageResponse([]) },
      {
        match: isPrPage('MERGED,CLOSED'),
        ok: true,
        out: pageResponse([
          // 6월에 생성됐지만 7월(창 안)에 닫힘 — 이월 재구성에 필요
          prNode(5, {
            createdAt: '2026-06-01T00:00:00Z',
            closedAt: '2026-07-10T00:00:00Z',
            updatedAt: '2026-07-10T00:00:00Z',
          }),
          // 창 이전에 마지막 활동 종료 — 여기서 멈춤
          prNode(4, {
            createdAt: '2026-05-01T00:00:00Z',
            closedAt: '2026-05-02T00:00:00Z',
            updatedAt: '2026-05-02T00:00:00Z',
          }),
        ]),
      },
    ])
    const r = fetchPrWindow('2026-07-01T00:00:00Z', runner)
    expect(r.prs.map((p) => p.number)).toEqual([5])
    expect(r.errors).toEqual([])
  })

  it('반례4: GraphQL top-level errors + partial data 는 실패로 전파', () => {
    const partialWithErrors = JSON.stringify({
      data: { repository: { pullRequests: { pageInfo: { hasNextPage: false }, nodes: [prNode(1)] } } },
      errors: [{ message: 'Something went wrong while executing your query.' }],
    })
    const runner = scriptedRunner([
      { match: isRepoView, ok: true, out: REPO_JSON },
      { match: isPrPage('OPEN'), ok: true, out: partialWithErrors },
      { match: isPrPage('MERGED,CLOSED'), ok: true, out: pageResponse([]) },
    ])
    const r = fetchPrWindow('2026-07-01T00:00:00Z', runner)
    expect(r.listComplete).toBe(false)
    expect(r.errors.some((e) => e.includes('GraphQL'))).toBe(true)
  })
})
