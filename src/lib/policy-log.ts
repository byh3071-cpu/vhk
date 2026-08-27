/*
 * policy-log.ts — 권한 판정 원장 (작업 단위 124-T3 · RFC 0066 §3·§4.5).
 *
 * 왜 새 원장인가(§3.1): 이 저장소의 관례는 관심사별 별도 원장이다(action·autonomy·receipt·cost).
 * `ai-actions.jsonl` 에 섞으면 "판정만 하고 실행하지 않은" 레코드 때문에 `ran: false` 의 의미가
 * 두 가지가 되고, `autonomy-run.jsonl` 에 얹으면 완주율 집계의 입력 계약이 흐려진다.
 *
 * 이 모듈은 **처음으로 파일에 쓴다.** 그래서 조건이 둘 붙는다.
 *   ① `record` 또는 `enforce` 일 때만 쓴다(ADR-019). 아무 플래그도 없으면 0줄이다.
 *   ② 단계 전이는 마지막 라인 CAS 를 통과해야 쓴다(§4.5).
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { PermissionLevel, TransitionKind } from './permission-level.js'
import { stripBom } from './read-json.js'
import { appendJsonlLine } from './jsonl-append.js'
import type { RiskClass } from './risk-class.js'
import type { TaskKind } from './task-kind.js'

export const POLICY_LOG_PATH_REL = join('.vhk', 'events', 'policy-decision.jsonl')
export const POLICY_LOG_SCHEMA_VERSION = 1

/** 판정 결과. 세 값만 쓴다(§3.2). */
export type PolicyVerdict = 'allow' | 'require-human' | 'deny'

/** 닫힌집합. `level`·`risk` 는 RFC 0066, `allowlist`·`budget` 은 RFC 0067 이 쓴다. */
export type PolicyDecisionKind = 'level' | 'risk' | 'allowlist' | 'budget'

/** 위험도 유도 출처(§3.4). `paths` 는 커밋 diff 에서 유도, `none` 은 범위를 못 구한 것이고 `human` 고정. */
export type RiskDerivation = 'paths' | 'none'

/**
 * 모든 라인이 공유하는 봉투(§3.2). RFC 0067 은 이 봉투에 필드를 추가하지 않고
 * 변형별 필드만 얹는다.
 *
 * `reasonCode` 는 안정적인 닫힌집합 코드다 — 사람 문장·원문·경로를 넣으면 공개 경계가
 * 원장 라인마다 새로 생긴다.
 */
export interface PolicyDecisionV1 {
  schemaVersion: number
  ts: string
  kind: PolicyDecisionKind
  verdict: PolicyVerdict
  reasonCode: string
  runId?: string
  /** 판정 시점 HEAD 전체 SHA. git 아님·커밋 0 이면 `null` — 추측하지 않는다(§3.2). */
  sha?: string | null
  /** 기계 유도값만. 에이전트 신고값을 넣지 않는다(§3.2). 종결 배선(124-T3)이 채운다. */
  taskKind?: TaskKind

  // kind: 'level' 전용 (§3.3)
  from?: PermissionLevel | null
  to?: PermissionLevel
  transition?: TransitionKind
  judgedRuns?: number
  rollingFailures?: number | null
  window?: number

  // kind: 'risk' 전용 (§3.4) — 전부 additive. 과거 라인에는 없고, 없어도 읽기는 그대로다.
  riskClass?: RiskClass
  /** 미분류 경로 수. 1 이상이면 `riskClass` 는 반드시 `human` 이다(§5.3). */
  unclassifiedPaths?: number
  derivedFrom?: RiskDerivation

  // ── RFC 0067 §6.1 — 봉투는 그대로 두고 변형별 필드만 얹는다 ──

  /**
   * kind: 'allowlist' 전용.
   *
   * `bin` 은 **`normalizeBin()` 을 거친 값만** 넣는다. 호출부가 절대경로를 넘기면 원장에
   * 로컬 절대경로가 그대로 남아 이 저장소의 공개 경계 규칙을 원장이 스스로 위반한다.
   * 같은 이유로 **인자 원문은 남기지 않고 개수만** 센다 — 인자에는 파일 경로·토큰·URL 이
   * 들어올 수 있다. `.vhk/events/` 가 추적 금지 경로이긴 하지만 원장 내용이 출력·요약으로
   * 새는 경로가 그동안 여러 번 있었다.
   */
  bin?: string
  argCount?: number
  matchedId?: string | null

  /**
   * kind: 'budget' 전용.
   *
   * `dimension` 에 `usd` 가 없는 것이 설계다(§5.5) — 자기 보고 비용은 판정에 안 쓰므로
   * 그 축으로 막힌 기록도 존재할 수 없다.
   * `usedRatio` 만 남기고 절대 초·횟수를 안 남기는 것도 같은 규율이다.
   */
  dimension?: BudgetDimension
  usedRatio?: number
  /** 어느 지점이 막았나. 실측에서 exec 만 계속 나오면 호출 측 집행이 안 걸리고 있다는 뜻이다 */
  site?: EnforcementSite
}

/** 한도 축. **`usd` 는 없다** — 자기 보고 비용은 판정에 쓰지 않는다(§5.5). */
export type BudgetDimension = 'runSec' | 'commandSec' | 'callCount'

/** 이중 집행의 관측 지점 — 어느 쪽이 막았는지 남겨야 두 지점이 실제로 도는지 알 수 있다. */
export type EnforcementSite = 'call' | 'exec'

/** 기록 여부를 정하는 두 플래그(ADR-019). */
export interface RecordGate {
  record: boolean
  enforce: boolean
}

export interface AppendResult {
  written: boolean
  conflict: boolean
  reasonCode?: 'CAS_CONFLICT' | 'RECORDING_OFF'
}

function isLine(v: unknown): v is PolicyDecisionV1 {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return o.schemaVersion === POLICY_LOG_SCHEMA_VERSION && typeof o.kind === 'string'
}

export type RiskReasonCode =
  | 'RISK_SCOPE_UNKNOWN'
  | 'RISK_UNCLASSIFIED_PATH'
  | 'RISK_AUTO_KIND'
  | 'RISK_HUMAN_KIND'

const RISK_REASON_CODES = new Set<RiskReasonCode>([
  'RISK_SCOPE_UNKNOWN',
  'RISK_UNCLASSIFIED_PATH',
  'RISK_AUTO_KIND',
  'RISK_HUMAN_KIND',
])

const VALID_RISK_TASK_KINDS = new Set<TaskKind>([
  'chore',
  'docs',
  'deps',
  'source',
  'schema',
  'security',
  'unknown',
])
const AUTO_RISK_TASK_KINDS = new Set<TaskKind>(['chore', 'docs', 'deps'])

export interface ExpectedRiskDecision {
  sha: string | null
  taskKind: TaskKind
  riskClass: RiskClass
  verdict: PolicyVerdict
  reasonCode: RiskReasonCode
  unclassifiedPaths: number
  derivedFrom: RiskDerivation
}

export function sameExpectedRiskDecision(
  left: ExpectedRiskDecision,
  right: ExpectedRiskDecision,
): boolean {
  return left.sha === right.sha
    && left.taskKind === right.taskKind
    && left.riskClass === right.riskClass
    && left.verdict === right.verdict
    && left.reasonCode === right.reasonCode
    && left.unclassifiedPaths === right.unclassifiedPaths
    && left.derivedFrom === right.derivedFrom
}

export function isExpectedRiskDecision(value: unknown): value is ExpectedRiskDecision {
  if (typeof value !== 'object' || value === null) return false
  const decision = value as Record<string, unknown>
  if (
    !(decision.sha === null || (typeof decision.sha === 'string' && decision.sha.length > 0))
    || typeof decision.taskKind !== 'string'
    || !VALID_RISK_TASK_KINDS.has(decision.taskKind as TaskKind)
    || (decision.riskClass !== 'auto' && decision.riskClass !== 'human')
    || (decision.verdict !== 'allow' && decision.verdict !== 'require-human')
    || typeof decision.reasonCode !== 'string'
    || !RISK_REASON_CODES.has(decision.reasonCode as RiskReasonCode)
    || !Number.isSafeInteger(decision.unclassifiedPaths)
    || (decision.unclassifiedPaths as number) < 0
    || (decision.derivedFrom !== 'paths' && decision.derivedFrom !== 'none')
  ) {
    return false
  }

  const taskKind = decision.taskKind as TaskKind
  if (decision.derivedFrom === 'none') {
    return taskKind === 'unknown'
      && decision.unclassifiedPaths === 0
      && decision.riskClass === 'human'
      && decision.verdict === 'require-human'
      && decision.reasonCode === 'RISK_SCOPE_UNKNOWN'
  }
  if ((decision.unclassifiedPaths as number) > 0) {
    return decision.riskClass === 'human'
      && decision.verdict === 'require-human'
      && decision.reasonCode === 'RISK_UNCLASSIFIED_PATH'
  }
  if (taskKind === 'unknown') {
    return decision.riskClass === 'human'
      && decision.verdict === 'require-human'
      && decision.reasonCode === 'RISK_SCOPE_UNKNOWN'
  }
  const auto = AUTO_RISK_TASK_KINDS.has(taskKind)
  return decision.riskClass === (auto ? 'auto' : 'human')
    && decision.verdict === (auto ? 'allow' : 'require-human')
    && decision.reasonCode === (auto ? 'RISK_AUTO_KIND' : 'RISK_HUMAN_KIND')
}

/**
 * Retry deduplication accepts only a complete, machine-produced risk decision.
 * A parseable but truncated object must not discharge a pending policy record.
 */
export function isCompleteRiskDecisionForRun(
  line: PolicyDecisionV1,
  runId: string,
  expected?: ExpectedRiskDecision,
): boolean {
  const timestamp = Date.parse(line.ts)
  const validRiskEnvelope =
    line.schemaVersion === POLICY_LOG_SCHEMA_VERSION
    && line.kind === 'risk'
    && line.runId === runId
    && typeof line.ts === 'string'
    && Number.isFinite(timestamp)
    && (line.verdict === 'allow' || line.verdict === 'require-human')
    && typeof line.reasonCode === 'string'
    && RISK_REASON_CODES.has(line.reasonCode as RiskReasonCode)
    && (line.riskClass === 'auto' || line.riskClass === 'human')
    && Number.isSafeInteger(line.unclassifiedPaths)
    && (line.unclassifiedPaths ?? -1) >= 0
    && (line.derivedFrom === 'paths' || line.derivedFrom === 'none')
    && (typeof line.sha === 'string' || line.sha === null)
    && typeof line.taskKind === 'string'
    && VALID_RISK_TASK_KINDS.has(line.taskKind)
  if (!validRiskEnvelope) return false
  const actual: ExpectedRiskDecision = {
    sha: line.sha ?? null,
    taskKind: line.taskKind as TaskKind,
    riskClass: line.riskClass as RiskClass,
    verdict: line.verdict,
    reasonCode: line.reasonCode as RiskReasonCode,
    unclassifiedPaths: line.unclassifiedPaths ?? 0,
    derivedFrom: line.derivedFrom as RiskDerivation,
  }
  if (!isExpectedRiskDecision(actual)) return false
  return expected === undefined
    || (isExpectedRiskDecision(expected) && sameExpectedRiskDecision(actual, expected))
}

/** 원장 전체를 읽는다. 손상 라인은 건너뛴다 — 한 줄이 전체를 죽이지 않는다. */
export function readPolicyLog(cwd: string): PolicyDecisionV1[] {
  const p = join(cwd, POLICY_LOG_PATH_REL)
  if (!existsSync(p)) return []
  const out: PolicyDecisionV1[] = []
  for (const line of stripBom(readFileSync(p, 'utf-8')).split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (isLine(parsed)) out.push(parsed)
    } catch {
      // 손상 라인 skip — 원장 하나가 깨져도 나머지 판정 이력은 살아 있어야 한다.
      continue
    }
  }
  return out
}

/**
 * 마지막 `kind: 'level'` 라인. 없으면 null.
 * 이게 `decidePermissionLevel` 의 `last` 인자이며, null 이면 케이스 0(신규 진입)이다.
 */
export function lastLevelLine(cwd: string): PolicyDecisionV1 | null {
  const lines = readPolicyLog(cwd).filter((l) => l.kind === 'level')
  return lines.length === 0 ? null : lines[lines.length - 1]
}

/** 두 라인이 같은 전이를 가리키는가 — CAS 비교 기준(§4.5: 같은 ts + 같은 to + 같은 judgedRuns). */
function sameLine(a: PolicyDecisionV1 | null, b: PolicyDecisionV1 | null): boolean {
  if (a === null || b === null) return a === b
  return a.ts === b.ts && a.to === b.to && a.judgedRuns === b.judgedRuns
}

/**
 * 판정 라인 append.
 *
 * `base` 를 주면 마지막 라인 CAS 를 건다(§4.5). append 한 줄의 원자성은 보장되지만
 * "읽고 → 계산하고 → 쓰는" 사이에 다른 세션이 끼어드는 것은 막지 못한다 — 병렬 worktree 두
 * 개가 몇 초 차이로 종결하면 같은 previous 를 읽어 **둘 다 승급을 쓴다.** append 직전에 원장
 * 끝을 다시 읽어 base 와 같을 때만 쓴다.
 *
 * 완전한 잠금이 아니다. 파일 잠금 없이 마지막 라인만 비교하는 낙관적 방식이라 극단적 경합에서는
 * 창이 남는다. 여기서 막으려는 것은 **흔한 사고**(밤에 런 두 개가 몇 초 차이로 끝남)다.
 *
 * `kind: 'risk' | 'allowlist' | 'budget'` 은 상태 갱신이 아니라 관측 기록이므로 base 를 주지 않는다.
 */
export function appendPolicyDecision(
  cwd: string,
  entry: PolicyDecisionV1,
  gate: RecordGate,
  base?: PolicyDecisionV1 | null,
): AppendResult {
  if (!gate.record && !gate.enforce) {
    return { written: false, conflict: false, reasonCode: 'RECORDING_OFF' }
  }

  if (base !== undefined && !sameLine(lastLevelLine(cwd), base)) {
    return { written: false, conflict: true, reasonCode: 'CAS_CONFLICT' }
  }

  const p = join(cwd, POLICY_LOG_PATH_REL)
  mkdirSync(dirname(p), { recursive: true })
  appendJsonlLine(p, entry)
  return { written: true, conflict: false }
}
