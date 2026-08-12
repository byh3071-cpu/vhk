import { safeExecFile } from './exec.js'

// Goal 111-T4 (1/3): GitHub 어댑터 — PR 목록·타임라인을 GraphQL 로 수집한다.
//
// 설계 원칙:
// - 순수 계산(pr-metrics.ts)과 분리 — 이 파일만 네트워크를 안다. 파싱 함수는 순수로 export 해
//   mock JSON fixture 로 테스트한다.
// - 부분 실패를 0 으로 위장하지 않는다: 페이지 잘림·개별 조회 실패는 errors[]/Complete 플래그로
//   드러나고, 판정 계층에서 '측정 불가' 재료가 된다.
// - REST 가 아니라 GraphQL 인 이유: draft 이력 복원에 필요한 ReadyForReviewEvent ·
//   ConvertToDraftEvent 가 REST/`gh pr view --json` 에는 없다 (readyAt 필드 부재 실측).

/** 타임라인 이벤트 — 판정에 필요한 6종만. */
export interface PrTimelineEvent {
  type: 'ready' | 'convert_to_draft' | 'review' | 'comment' | 'merged' | 'closed'
  ts: string
  actorLogin: string | null
  actorIsBot: boolean
}

export interface PrRecord {
  number: number
  createdAt: string
  mergedAt: string | null
  closedAt: string | null
  isDraft: boolean
  headRefOid: string
  authorLogin: string | null
  authorIsBot: boolean
  labels: string[]
  /** PR 커밋 oid 목록 — cohort 조인 후순위 신호. */
  commitOids: string[]
  /** 커밋 페이지가 잘리면 false — commits 경유 조인은 사용하지 않는다. */
  commitsComplete: boolean
  timeline: PrTimelineEvent[]
  /** 타임라인 페이지가 잘리면 false — 이 PR 은 판정 자료 불완전으로 취급한다. */
  timelineComplete: boolean
}

export interface PrFetchResult {
  prs: PrRecord[]
  /** PR 목록 자체가 완전한가(페이지 상한 도달·조회 실패 시 false). */
  listComplete: boolean
  /** 부분 실패 설명 — 비면 완전 수집. */
  errors: string[]
}

/** 테스트 주입용 실행기 — 기본은 safeExecFile('gh', ...). */
export type GhRunner = (args: string[]) => { ok: boolean; out: string; err?: string }

export function defaultGhRunner(args: string[]): { ok: boolean; out: string; err?: string } {
  return safeExecFile('gh', args)
}

/** gh 사용 가능 여부 — 미설치·미인증이면 이유 문자열. cloud.ts 와 동일한 감지 통로. */
export function ghAvailability(runner: GhRunner = defaultGhRunner): { ok: boolean; reason?: string } {
  const ver = runner(['--version'])
  if (!ver.ok) return { ok: false, reason: 'gh 미설치' }
  const auth = runner(['auth', 'status'])
  if (!auth.ok) return { ok: false, reason: 'gh 미인증' }
  return { ok: true }
}

const PAGE_SIZE = 50
/** 폭주 방지 페이지 상한 — 초과 시 listComplete=false 로 정직 표기. */
const MAX_PAGES = 20

const TIMELINE_ITEM_TYPES =
  'READY_FOR_REVIEW_EVENT,CONVERT_TO_DRAFT_EVENT,PULL_REQUEST_REVIEW,ISSUE_COMMENT,MERGED_EVENT,CLOSED_EVENT'

// states 는 GraphQL enum 배열이라 gh -f(문자열 변수)로 넘길 수 없다("MERGED,CLOSED" 실측 실패).
// 내부 고정 2종만 쓰므로 쿼리 텍스트에 인라인한다 — 외부 입력이 아니라 주입 위험 없음.
const prPageQuery = (statesInline: string): string => `
query($owner:String!,$name:String!,$after:String){
  repository(owner:$owner,name:$name){
    pullRequests(first:${PAGE_SIZE},after:$after,states:[${statesInline}],orderBy:{field:CREATED_AT,direction:DESC}){
      pageInfo{hasNextPage endCursor}
      nodes{
        number createdAt mergedAt closedAt isDraft headRefOid
        author{login __typename}
        labels(first:20){nodes{name}}
        commits(first:100){pageInfo{hasNextPage} nodes{commit{oid}}}
        timelineItems(first:100,itemTypes:[${TIMELINE_ITEM_TYPES}]){
          pageInfo{hasNextPage endCursor}
          nodes{
            __typename
            ... on ReadyForReviewEvent{createdAt actor{login __typename}}
            ... on ConvertToDraftEvent{createdAt actor{login __typename}}
            ... on PullRequestReview{createdAt author{login __typename}}
            ... on IssueComment{createdAt author{login __typename}}
            ... on MergedEvent{createdAt actor{login __typename}}
            ... on ClosedEvent{createdAt actor{login __typename}}
          }
        }
      }
    }
  }
}`

const TIMELINE_PAGE_QUERY = `
query($owner:String!,$name:String!,$number:Int!,$after:String){
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      timelineItems(first:100,after:$after,itemTypes:[${TIMELINE_ITEM_TYPES}]){
        pageInfo{hasNextPage endCursor}
        nodes{
          __typename
          ... on ReadyForReviewEvent{createdAt actor{login __typename}}
          ... on ConvertToDraftEvent{createdAt actor{login __typename}}
          ... on PullRequestReview{createdAt author{login __typename}}
          ... on IssueComment{createdAt author{login __typename}}
          ... on MergedEvent{createdAt actor{login __typename}}
          ... on ClosedEvent{createdAt actor{login __typename}}
        }
      }
    }
  }
}`

interface RawActor {
  login?: string
  __typename?: string
}

function actorOf(node: Record<string, unknown>): { login: string | null; isBot: boolean } {
  const a = (node.actor ?? node.author) as RawActor | null | undefined
  if (!a || typeof a.login !== 'string') return { login: null, isBot: false }
  const isBot = a.__typename === 'Bot' || a.login.endsWith('[bot]')
  return { login: a.login, isBot }
}

const TYPE_MAP: Record<string, PrTimelineEvent['type']> = {
  ReadyForReviewEvent: 'ready',
  ConvertToDraftEvent: 'convert_to_draft',
  PullRequestReview: 'review',
  IssueComment: 'comment',
  MergedEvent: 'merged',
  ClosedEvent: 'closed',
}

/** 타임라인 노드 1개 → 이벤트. 미지 타입·시각 없는 노드는 null(관용 skip). */
export function parseTimelineNode(node: unknown): PrTimelineEvent | null {
  if (typeof node !== 'object' || node === null) return null
  const n = node as Record<string, unknown>
  const type = TYPE_MAP[String(n.__typename)]
  if (!type || typeof n.createdAt !== 'string') return null
  const { login, isBot } = actorOf(n)
  return { type, ts: n.createdAt, actorLogin: login, actorIsBot: isBot }
}

interface ParsedPrNode {
  record: PrRecord
  timelineCursor: string | null
}

/** GraphQL PR 노드 1개 → PrRecord (순수 — fixture 테스트 대상). */
export function parsePrNode(node: unknown): ParsedPrNode | null {
  if (typeof node !== 'object' || node === null) return null
  const n = node as Record<string, unknown>
  if (typeof n.number !== 'number' || typeof n.createdAt !== 'string' || typeof n.headRefOid !== 'string') {
    return null
  }
  const author = n.author as RawActor | undefined
  const labels = ((n.labels as { nodes?: Array<{ name?: string }> })?.nodes ?? [])
    .map((l) => l?.name)
    .filter((x): x is string => typeof x === 'string')
  const commitsConn = n.commits as
    | { pageInfo?: { hasNextPage?: boolean }; nodes?: Array<{ commit?: { oid?: string } }> }
    | undefined
  const commitOids = (commitsConn?.nodes ?? [])
    .map((c) => c?.commit?.oid)
    .filter((x): x is string => typeof x === 'string')
  const tl = n.timelineItems as
    | { pageInfo?: { hasNextPage?: boolean; endCursor?: string }; nodes?: unknown[] }
    | undefined
  const timeline = (tl?.nodes ?? [])
    .map(parseTimelineNode)
    .filter((x): x is PrTimelineEvent => x !== null)
  const tlHasNext = tl?.pageInfo?.hasNextPage === true
  return {
    record: {
      number: n.number,
      createdAt: n.createdAt,
      mergedAt: typeof n.mergedAt === 'string' ? n.mergedAt : null,
      closedAt: typeof n.closedAt === 'string' ? n.closedAt : null,
      isDraft: n.isDraft === true,
      headRefOid: n.headRefOid,
      authorLogin: author?.login ?? null,
      authorIsBot: author?.__typename === 'Bot' || (author?.login ?? '').endsWith('[bot]'),
      labels,
      commitOids,
      commitsComplete: commitsConn?.pageInfo?.hasNextPage !== true,
      timeline,
      timelineComplete: !tlHasNext,
    },
    timelineCursor: tlHasNext ? (tl?.pageInfo?.endCursor ?? null) : null,
  }
}

/** unknown 응답에서 중첩 키 안전 접근 — raw any 캐스트 없이. */
function dig(obj: unknown, ...keys: string[]): unknown {
  let cur: unknown = obj
  for (const k of keys) {
    if (typeof cur !== 'object' || cur === null) return undefined
    cur = (cur as Record<string, unknown>)[k]
  }
  return cur
}

function runGraphql(
  runner: GhRunner,
  query: string,
  vars: Record<string, string | number>,
): { ok: boolean; data?: unknown; err?: string } {
  const args = ['api', 'graphql', '-f', `query=${query}`]
  for (const [k, v] of Object.entries(vars)) {
    // -F 는 숫자/불리언을 타입 보존으로 넘긴다. 문자열은 -f.
    if (typeof v === 'number') args.push('-F', `${k}=${v}`)
    else args.push('-f', `${k}=${v}`)
  }
  const res = runner(args)
  if (!res.ok) return { ok: false, err: res.err ?? 'gh api graphql 실패' }
  try {
    return { ok: true, data: JSON.parse(res.out) as unknown }
  } catch {
    return { ok: false, err: 'GraphQL 응답 파싱 실패' }
  }
}

/** 저장소 식별자 — gh 가 현재 디렉터리의 origin 을 해석한다. */
export function getRepoIdentity(runner: GhRunner = defaultGhRunner): { owner: string; name: string } | null {
  const res = runner(['repo', 'view', '--json', 'owner,name'])
  if (!res.ok) return null
  try {
    const parsed = JSON.parse(res.out) as { owner?: { login?: string }; name?: string }
    if (parsed.owner?.login && parsed.name) return { owner: parsed.owner.login, name: parsed.name }
  } catch {
    /* fallthrough */
  }
  return null
}

/**
 * 관측 창에 필요한 PR 전량 수집: ①열린 PR 전체 ②sinceIso 이후 생성된 PR 전체(상태 무관).
 * 두 패스를 number 로 dedupe — 창 밖에서 생성돼 아직 열려 있는 PR 도 이월 계산에 들어온다.
 */
export function fetchPrWindow(
  sinceIso: string,
  runner: GhRunner = defaultGhRunner,
): PrFetchResult {
  const errors: string[] = []
  const id = getRepoIdentity(runner)
  if (!id) return { prs: [], listComplete: false, errors: ['저장소 식별 실패 (gh repo view)'] }

  const byNumber = new Map<number, PrRecord>()
  const pendingTimelines: Array<{ number: number; cursor: string | null }> = []
  let listComplete = true

  const collect = (states: string, stopBeforeSince: boolean): void => {
    let after: string | null = null
    for (let page = 0; page < MAX_PAGES; page++) {
      const vars: Record<string, string | number> = { owner: id.owner, name: id.name }
      if (after) vars.after = after
      const res = runGraphql(runner, prPageQuery(states), vars)
      if (!res.ok) {
        errors.push(`PR 목록 조회 실패 (states=${states}): ${res.err}`)
        listComplete = false
        return
      }
      const conn = dig(res.data, 'data', 'repository', 'pullRequests') as
        | { pageInfo?: { hasNextPage?: boolean; endCursor?: string }; nodes?: unknown[] }
        | undefined
      if (!conn) {
        errors.push(`PR 목록 응답 형태 불일치 (states=${states})`)
        listComplete = false
        return
      }
      let reachedSince = false
      for (const node of conn.nodes ?? []) {
        const parsed = parsePrNode(node)
        if (!parsed) continue
        if (stopBeforeSince && parsed.record.createdAt < sinceIso) {
          reachedSince = true
          break
        }
        if (!byNumber.has(parsed.record.number)) {
          byNumber.set(parsed.record.number, parsed.record)
          if (parsed.timelineCursor !== null || !parsed.record.timelineComplete) {
            pendingTimelines.push({ number: parsed.record.number, cursor: parsed.timelineCursor })
          }
        }
      }
      if (reachedSince || conn.pageInfo?.hasNextPage !== true) return
      after = conn.pageInfo?.endCursor ?? null
      if (!after) return
    }
    // MAX_PAGES 초과 — 조용히 자르지 않는다.
    errors.push(`PR 목록 페이지 상한(${MAX_PAGES}) 도달 (states=${states})`)
    listComplete = false
  }

  collect('OPEN', false)
  collect('MERGED,CLOSED', true)

  // 타임라인 추가 페이지 — PR 별 후속 조회. 실패한 PR 은 timelineComplete=false 로 남긴다.
  for (const pending of pendingTimelines) {
    const rec = byNumber.get(pending.number)
    if (!rec) continue
    let after = pending.cursor
    let complete = false
    for (let page = 0; page < MAX_PAGES; page++) {
      const vars: Record<string, string | number> = { owner: id.owner, name: id.name, number: pending.number }
      if (after) vars.after = after
      const res = runGraphql(runner, TIMELINE_PAGE_QUERY, vars)
      if (!res.ok) {
        errors.push(`PR #${pending.number} 타임라인 조회 실패: ${res.err}`)
        break
      }
      const conn = dig(res.data, 'data', 'repository', 'pullRequest', 'timelineItems') as
        | { pageInfo?: { hasNextPage?: boolean; endCursor?: string }; nodes?: unknown[] }
        | undefined
      if (!conn) {
        errors.push(`PR #${pending.number} 타임라인 응답 형태 불일치`)
        break
      }
      for (const node of conn.nodes ?? []) {
        const ev = parseTimelineNode(node)
        if (ev) rec.timeline.push(ev)
      }
      if (conn.pageInfo?.hasNextPage !== true) {
        complete = true
        break
      }
      after = conn.pageInfo?.endCursor ?? null
      if (!after) break
    }
    rec.timelineComplete = complete
  }

  return { prs: [...byNumber.values()], listComplete, errors }
}
