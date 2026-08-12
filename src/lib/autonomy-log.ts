import { existsSync, readFileSync, mkdirSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { stripBom } from './read-json.js'
import type { TaskKind } from './task-kind.js'

// 이슈 #373: 자율성완주율 측정 스키마.
// vhk-auto(SKILL.md) 루프가 "몇 번 시작해서 몇 번 사람 개입(HARD_STOP·blocker) 없이
// 끝났나"를 레포 영속으로 남긴다 — action-ledger.ts(가드 chokepoint 행동 로그)와 별개·중복
// 아님: 이건 "자율 루프 런(run) 단위" 완주율 로그다.
// .vhk/events/autonomy-run.jsonl 은 .vhk/.gitignore·root .gitignore 어디서도 제외하지
// 않는다(영속 목적) — action-ledger.ts 선례 그대로.

export const AUTONOMY_LOG_PATH_REL = join('.vhk', 'events', 'autonomy-run.jsonl')

/** 자율 루프 종결 방식 4종. SKILL.md 루프 6번 종결 분기 3개 + 시작(start) 1개. */
export type AutonomyEvent = 'start' | 'complete' | 'hardstop' | 'blocked'

/**
 * Goal 110-T1: 3중 판정을 받을 수 있는 라인의 스키마 버전.
 * 이 값이 없는 과거 라인(v1)은 sha 가 없어 receipt-log 와 조인할 수 없다 → 완주 판정 대상이
 * 아니라 "판정 불가"로 따로 센다(분자·분모 양쪽에서 제외). 0% 로 위장하지 않기 위해서다.
 */
export const AUTONOMY_SCHEMA_VERSION = 2

/**
 * 실패의 성격. 인프라 실패(네트워크·할당량·레지스트리)는 자율성 판정의 분모에서 제외한다
 * (110-T5) — 도구가 못 한 일과 인프라가 죽은 일을 같은 실패로 세면 신뢰도가 왜곡된다.
 */
export type AutonomyFailureKind = 'infra' | 'product'

export interface AutonomyRunEntry {
  /** 머신 타임스탬프(UTC ISO) */
  ts: string
  /** 이 런(run)을 식별하는 UUID — start 발급, 이후 이벤트가 같은 값으로 묶인다 */
  runId: string
  /** 이 런이 다룬 goal id — 생략 가능(activeGoalId() 자동감지 실패 시) */
  goal?: number
  /** 이벤트 종류 — start(런 시작) / complete(합격) / hardstop(치명·연속red) / blocked(3사이클 정체) */
  event: AutonomyEvent
  /** 시작~이 이벤트까지 루프 tick 수 — 있을 때만(start 는 없음) */
  ticks?: number
  /** 이 런 동안 사람 개입 횟수 — 있을 때만(start 는 없음) */
  interventions?: number
  /** hardstop 이 적대리뷰(critic) 거부로 인한 것인지 — hardstop 이벤트에서만 의미 있음 */
  reviewRejected?: boolean

  // ── Goal 110 확장 (전부 optional — 기존 파일 하위호환, 마이그레이션 없음) ──

  /** 이 라인이 3중 판정 대상인지 가르는 스키마 버전. 없으면 v1(판정 불가). */
  schemaVersion?: number
  /**
   * 이 이벤트 시점의 HEAD 전체 SHA. **CLI 가 직접 측정한다(에이전트 입력 아님)** —
   * receipt-log 와의 조인 키이자, 자기 보고를 기계 증거로 교차 검증하는 유일한 통로다.
   * git 레포가 아니거나 커밋 0개면 null(추측 금지).
   */
  sha?: string | null
  /**
   * 작업 유형 — start 라인의 sha 부터 현재 HEAD 까지의 변경 경로에서 **유도**한다.
   * 에이전트가 신고하는 값이 아니다(그래야 승인 경계 우회가 막힌다 — task-kind.ts 주석).
   * 유도 실패는 'unknown' 이며, 안전한 유형으로 낙관 추정하지 않는다.
   */
  taskKind?: TaskKind
  /** 실패 성격. infra 는 분모에서 제외된다(110-T5). 종결 이벤트에서만 의미 있음. */
  failureKind?: AutonomyFailureKind
}

// ─── Goal 111-T1: 아침 자기신고 관측 (분리 타입) ─────────────────────────────
//
// why 같은 JSONL 에 별도 타입인가:
//   morning 을 AutonomyEvent 에 단순 추가하면 groupRuns 류 소비자가 런 종결로 오인할 수 있는
//   경로가 관례("runId 안 겹침")에만 기대게 된다. 판별자를 타입에 박아(runId 없음 · kind 필드)
//   기존 완주율 집계에는 RunEvent 만 들어가는 것을 계약으로 만든다.
//   판정식 밖 참고 지표다 — 자기신고는 카운터 자격이 없다(리서치 결정 1)는 110 전제 그대로.

/** 아침 자기신고 관측 1건. 로컬 날짜별 append-only — 집계는 같은 날짜의 마지막 유효 관측만 쓴다. */
export interface MorningObservation {
  /** 판별자 — RunEvent 와 구분. */
  kind: 'morning'
  /** 기록 시각(UTC ISO). */
  ts: string
  /** 관측일(로컬 날짜 YYYY-MM-DD) — 응답률의 키. */
  date: string
  /** 상태 파악에 쓴 시간(분). 미입력 허용 — 참고 지표. */
  trackingMin?: number
  /** 내용 확인 없이 승인한 건수. total 과 함께 있어야 비율 계산에 쓰인다. */
  uncheckedApprovals?: number
  /** 그날 승인 결정 총수 — 비율의 분모. */
  approvalDecisionsTotal?: number
}

/** 같은 JSONL 을 공유하는 라인 타입 전체. */
export type AutonomyLogEntry = AutonomyRunEntry | MorningObservation

const MORNING_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isNonNegInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0
}

/**
 * morning 관측 라인 형태 검증. 유효하지 않으면 null(손상 라인 skip 계약과 동형).
 * 0 ≤ uncheckedApprovals ≤ approvalDecisionsTotal 을 여기서 강제 — 위반 라인은 무효.
 */
export function normalizeMorningObservation(raw: unknown): MorningObservation | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  if (o.kind !== 'morning') return null
  if (typeof o.ts !== 'string' || typeof o.date !== 'string' || !MORNING_DATE_RE.test(o.date)) return null
  const out: MorningObservation = { kind: 'morning', ts: o.ts, date: o.date }
  if (o.trackingMin !== undefined) {
    if (!isNonNegInt(o.trackingMin)) return null
    out.trackingMin = o.trackingMin
  }
  if (o.uncheckedApprovals !== undefined) {
    if (!isNonNegInt(o.uncheckedApprovals)) return null
    out.uncheckedApprovals = o.uncheckedApprovals
  }
  if (o.approvalDecisionsTotal !== undefined) {
    if (!isNonNegInt(o.approvalDecisionsTotal)) return null
    out.approvalDecisionsTotal = o.approvalDecisionsTotal
  }
  if (
    out.uncheckedApprovals !== undefined &&
    out.approvalDecisionsTotal !== undefined &&
    out.uncheckedApprovals > out.approvalDecisionsTotal
  ) {
    return null
  }
  return out
}

/** 라인이 런 이벤트인가 — event 문자열이 있고 morning 판별자가 없다. */
function isRunEventLine(raw: unknown): raw is AutonomyRunEntry {
  if (typeof raw !== 'object' || raw === null) return false
  const o = raw as Record<string, unknown>
  return typeof o.event === 'string' && o.kind === undefined
}

/**
 * 자율 런 원장 파싱(JSONL) — **RunEvent 만 반환한다.** morning 관측 라인은 여기서 걸러져
 * 기존 소비자(완주율·groupRuns·아침 카운트) 전원이 무변경으로 안전하다.
 * 손상 라인은 관용적으로 skip(action-ledger.ts 와 동일 계약).
 */
export function readAutonomyLog(cwd: string): AutonomyRunEntry[] {
  const p = join(cwd, AUTONOMY_LOG_PATH_REL)
  if (!existsSync(p)) return []
  const out: AutonomyRunEntry[] = []
  // BOM-safe: stripBom 변수 경유로 읽어 raw parse 금지 게이트(check-no-raw-json-parse) 통과.
  for (const line of stripBom(readFileSync(p, 'utf-8')).split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    try {
      const parsed: unknown = JSON.parse(t)
      if (isRunEventLine(parsed)) out.push(parsed)
    } catch {
      /* 손상 라인 skip */
    }
  }
  return out
}

/** morning 관측만 파싱. 무효·손상 라인 skip. */
export function readMorningObservations(cwd: string): MorningObservation[] {
  const p = join(cwd, AUTONOMY_LOG_PATH_REL)
  if (!existsSync(p)) return []
  const out: MorningObservation[] = []
  for (const line of stripBom(readFileSync(p, 'utf-8')).split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    try {
      const obs = normalizeMorningObservation(JSON.parse(t))
      if (obs) out.push(obs)
    } catch {
      /* 손상 라인 skip */
    }
  }
  return out
}

/** morning 관측 1건 append. 무효 형태는 기록 자체를 거부(false). */
export function appendMorningObservation(cwd: string, obs: MorningObservation): boolean {
  if (!normalizeMorningObservation(obs)) return false
  const p = join(cwd, AUTONOMY_LOG_PATH_REL)
  mkdirSync(join(cwd, '.vhk', 'events'), { recursive: true })
  appendFileSync(p, JSON.stringify(obs) + '\n', 'utf-8')
  return true
}

/** 관측에 자기신고 값이 있는가 — 승인 비율은 분자·분모가 둘 다 있어야 값으로 친다. */
export function morningHasValues(o: MorningObservation): boolean {
  return (
    o.trackingMin !== undefined ||
    (o.uncheckedApprovals !== undefined && o.approvalDecisionsTotal !== undefined)
  )
}

/**
 * 날짜별 대표 관측 선택 — 같은 date 에서 **값이 있는 마지막 관측**을 우선하고, 값 있는 관측이
 * 없으면 마지막 관측을 쓴다. 단순히 마지막 관측을 채택하면 아침에 값을 신고한 뒤 옵션 없이
 * 리포트를 재실행했을 때 그날 신고가 지워진다(리뷰 실측 지적) — 값을 잃지 않는 쪽이 규칙이다.
 * 응답률 = 대표 관측에 값이 있는 날 / 대표 관측이 존재하는 날.
 */
export function selectDailyObservations(observations: MorningObservation[]): Map<string, MorningObservation> {
  const byDate = new Map<string, MorningObservation>()
  for (const o of observations) {
    const prev = byDate.get(o.date)
    if (!prev || morningHasValues(o) || !morningHasValues(prev)) byDate.set(o.date, o)
  }
  return byDate
}

/**
 * 자율 런 이벤트 한 줄 append(append-only · dedup 없음 — action-ledger.ts 와 동일 계약:
 * 모든 런이 보존돼야 완주율 분모가 정직하다). O(1) append(O_APPEND).
 */
export function appendAutonomyEntry(cwd: string, entry: AutonomyRunEntry): void {
  const p = join(cwd, AUTONOMY_LOG_PATH_REL)
  mkdirSync(join(cwd, '.vhk', 'events'), { recursive: true })
  appendFileSync(p, JSON.stringify(entry) + '\n', 'utf-8')
}

/**
 * 외부에서 들어온 실패 성격 문자열을 닫힌집합에 대조(PAT-001) — 프롬프트 제약만 믿지 않는다.
 * 미매칭·미지정은 undefined. 모르는 값을 'product' 로 단정하지도, 'infra' 로 봐주지도 않는다.
 */
export function normalizeFailureKind(raw: string | undefined | null): AutonomyFailureKind | undefined {
  if (typeof raw !== 'string') return undefined
  const v = raw.trim().toLowerCase()
  return v === 'infra' || v === 'product' ? v : undefined
}

/** 새 런 ID 발급(crypto.randomUUID) — start 이벤트에서만 호출된다. */
export function newAutonomyRunId(): string {
  return randomUUID()
}
