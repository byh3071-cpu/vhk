/*
 * policy-record.ts — 자율 런 종결 시 판정 원장 기록 (124-T3·T4 배선 · RFC 0066 §4.3·§7.1 · ADR-019).
 *
 * 호출 지점은 하나다: `vhk autonomy-log` 의 종결 이벤트(complete/hardstop/blocked) 기록 **직후**.
 * 조회 명령(`vhk policy *`)은 이 모듈을 import 하지 않는다 — 조회로 전이가 일어나면
 * `vhk policy level` 을 세 번 불러 L1 → L3 로 올라가는 경로가 열린다(§4.3 치명 3).
 *
 * 부작용 계약.
 *   ① `record` 도 `enforce` 도 아니면 **원장·통계 파일을 열지도 않고** 돌아간다. 기본 off 의 정의다.
 *   ② 켜져 있어도 쓰는 곳은 `policy-decision.jsonl` 뿐이다. 명령을 막거나 바꾸지 않는다 —
 *      집행은 작업 단위 126 이후다. 판정 결과가 `deny` 여도 호출부의 종결 기록은 이미 남아 있다.
 *   ③ 전이(`level`)는 판정 대상 런이 실제로 늘었을 때만 남긴다. `NO_NEW_JUDGED_RUN` 은 기록 없음.
 *   ④ 원장 append 가 던지면 그대로 던진다. 호출부가 삼키지 않고 실패로 드러내야 거짓 성공이 안 된다.
 */
import { readAutonomyLog } from './autonomy-log.js'
import { readReceiptLog } from './receipt-log.js'
import { calcAutonomyStats, ROLLING_WINDOW } from './autonomy-stats.js'
import {
  decidePermissionLevel,
  type LevelDecision,
  type LevelLine,
  type LevelReasonCode,
  type PermissionLevel,
  type TransitionKind,
} from './permission-level.js'
import { loadPolicyConfig, type PolicyConfig } from './policy-config.js'
import {
  appendPolicyDecision,
  isCompleteRiskDecisionForRun,
  lastLevelLine,
  readPolicyLog,
  POLICY_LOG_SCHEMA_VERSION,
  type PolicyDecisionV1,
  type PolicyVerdict,
  type ExpectedRiskDecision,
  type RecordGate,
  type RiskDerivation,
  type RiskReasonCode,
} from './policy-log.js'
import { riskClassOf, type RiskClass } from './risk-class.js'
import type { TaskKindBreakdown } from './task-kind.js'

/**
 * CAS 재시도 상한(§4.5). 병렬 worktree 둘이 몇 초 차이로 종결하는 흔한 사고를 막는 값이지
 * 잠금이 아니다 — 상한에 닿으면 `CAS_CONFLICT` 로 기록 없이 끝낸다.
 */
export const CAS_MAX_ATTEMPTS = 3

export interface RunTerminationInput {
  runId: string
  /** CLI 가 직접 잰 HEAD. git 아님·커밋 0 이면 null */
  sha: string | null
  /** start SHA → HEAD 변경 경로의 분류 내역. 호출부가 이미 구한 값을 그대로 받는다 */
  breakdown: TaskKindBreakdown
  derivedFrom: RiskDerivation
  /** UTC ISO. 호출부가 주입한다 — 판정 경로에 `Date.now()` 를 두지 않는다(§10.9) */
  nowIso: string
}

export interface LevelRecord {
  from: PermissionLevel | null
  to: PermissionLevel
  transition: TransitionKind
  reasonCode: LevelReasonCode
  /** 라인을 썼는가. `NO_NEW_JUDGED_RUN`·`CAS_CONFLICT` 면 false */
  written: boolean
  skipReason?: 'NO_NEW_JUDGED_RUN' | 'CAS_CONFLICT'
}

export interface RiskRecord {
  riskClass: RiskClass
  reasonCode: RiskReasonCode
  written: boolean
}

export interface RunTerminationRecord {
  /** 기록 게이트가 꺼져 있었다. 이때는 아무것도 읽지도 쓰지도 않았다 */
  recordingOff: boolean
  gate: RecordGate
  level: LevelRecord | null
  risk: RiskRecord | null
}

function toLevelLine(last: PolicyDecisionV1 | null): LevelLine | null {
  return last?.to !== undefined ? { to: last.to, judgedRuns: last.judgedRuns ?? 0, ts: last.ts } : null
}

/**
 * level 라인의 verdict. 게이트 결과가 아니라 **상한 계산**이므로 한 값으로 고정하면 죽은 필드가
 * 된다(§3.2 가 `enforced` 를 뺀 이유). `L0` 은 정의상 읽기만 가능한 단계라(§4.1) 자율 레인이
 * 아무것도 못 바꾸는 상태다 — 그것만 `deny` 로 남긴다. 사람이 `maxLevel: L0` 으로 내린 경우가 여기다.
 */
function levelVerdict(level: PermissionLevel): PolicyVerdict {
  return level === 'L0' ? 'deny' : 'allow'
}

function riskReasonCode(breakdown: TaskKindBreakdown, derivedFrom: RiskDerivation, risk: RiskClass): RiskReasonCode {
  if (derivedFrom === 'none' || breakdown.total === 0) return 'RISK_SCOPE_UNKNOWN'
  if (breakdown.unclassified > 0) return 'RISK_UNCLASSIFIED_PATH'
  return risk === 'auto' ? 'RISK_AUTO_KIND' : 'RISK_HUMAN_KIND'
}

export function expectedRiskDecision(
  input: Pick<RunTerminationInput, 'sha' | 'breakdown' | 'derivedFrom'>,
): ExpectedRiskDecision {
  const riskClass = riskClassOf(input.breakdown)
  return {
    sha: input.sha,
    taskKind: input.breakdown.kind,
    riskClass,
    verdict: riskClass === 'auto' ? 'allow' : 'require-human',
    reasonCode: riskReasonCode(input.breakdown, input.derivedFrom, riskClass),
    unclassifiedPaths: input.breakdown.unclassified,
    derivedFrom: input.derivedFrom,
  }
}

/**
 * 전이 판정 + CAS append. 마지막 level 라인을 base 로 잡고 계산해 쓰되, 그 사이 다른 세션이
 * 썼으면 처음부터 다시 읽어 재계산한다(§4.5). 통계도 같이 다시 읽는다 — 끼어든 세션은
 * autonomy-run 에도 종결을 남겼을 것이므로 base 만 갱신하면 낡은 표본으로 판정하게 된다.
 */
function recordLevel(cwd: string, input: RunTerminationInput, gate: RecordGate, maxLevel: PermissionLevel | undefined): LevelRecord {
  let attempt = 0
  for (;;) {
    const stats = calcAutonomyStats(readAutonomyLog(cwd), readReceiptLog(cwd))
    const base = lastLevelLine(cwd)
    const previous = toLevelLine(base)
    const decision = decidePermissionLevel(stats, { maxLevel }, previous)
    const from = previous?.to ?? null

    // 판정 대상 런이 늘지 않았으면 전이가 아니다 — 기록하지 않는다(§4.3 · §10.1).
    if (decision.reasonCode === 'NO_NEW_JUDGED_RUN') {
      return { from, ...decisionFields(decision), written: false, skipReason: 'NO_NEW_JUDGED_RUN' }
    }

    const entry: PolicyDecisionV1 = {
      schemaVersion: POLICY_LOG_SCHEMA_VERSION,
      ts: input.nowIso,
      kind: 'level',
      verdict: levelVerdict(decision.level),
      reasonCode: decision.reasonCode,
      runId: input.runId,
      sha: input.sha,
      taskKind: input.breakdown.kind,
      from,
      to: decision.level,
      transition: decision.transition,
      judgedRuns: stats.judgedRuns,
      rollingFailures: stats.rollingFailures,
      window: ROLLING_WINDOW,
    }
    const r = appendPolicyDecision(cwd, entry, gate, base)
    if (r.written) return { from, ...decisionFields(decision), written: true }
    if (!r.conflict) {
      // 게이트는 호출부가 이미 걸렀다. 여기 오면 계약이 깨진 것이므로 조용히 넘기지 않는다.
      throw new Error(`policy-record: append refused with gate open (${r.reasonCode ?? 'UNKNOWN'})`)
    }
    attempt++
    if (attempt >= CAS_MAX_ATTEMPTS) {
      return { from, ...decisionFields(decision), written: false, skipReason: 'CAS_CONFLICT' }
    }
  }
}

function decisionFields(d: LevelDecision): Pick<LevelRecord, 'to' | 'transition' | 'reasonCode'> {
  return { to: d.level, transition: d.transition, reasonCode: d.reasonCode }
}

/** 위험도는 상태 갱신이 아니라 관측 기록이다 — CAS 없이 남긴다(§3.5). */
function recordRisk(
  cwd: string,
  input: RunTerminationInput,
  gate: RecordGate,
  pinnedRisk?: ExpectedRiskDecision,
): RiskRecord {
  const expected = pinnedRisk ?? expectedRiskDecision(input)
  const risk = expected.riskClass
  const reasonCode = expected.reasonCode
  // terminal 기록 뒤 cleanup만 실패하면 같은 runId로 재시도된다. 관측 라인도 런당 한 번만
  // 남겨 통계·감사 로그가 재시도 횟수만큼 부풀지 않게 한다. 공식 호출 경로는 run-state 잠금이
  // 이 read→append를 직렬화한다.
  if (readPolicyLog(cwd).some(line => isCompleteRiskDecisionForRun(line, input.runId, expected))) {
    return { riskClass: risk, reasonCode, written: false }
  }
  const entry: PolicyDecisionV1 = {
    schemaVersion: POLICY_LOG_SCHEMA_VERSION,
    ts: input.nowIso,
    kind: 'risk',
    verdict: expected.verdict,
    reasonCode,
    runId: input.runId,
    sha: expected.sha,
    taskKind: expected.taskKind,
    riskClass: risk,
    unclassifiedPaths: expected.unclassifiedPaths,
    derivedFrom: expected.derivedFrom,
  }
  const r = appendPolicyDecision(cwd, entry, gate)
  return { riskClass: risk, reasonCode, written: r.written }
}

/**
 * 자율 런 종결 직후 판정 원장 기록.
 *
 * `record` 나 `enforce` 가 켜져 있을 때만 무언가를 한다. 설정이 손상돼 신뢰할 수 없으면
 * `loadPolicyConfig` 가 두 플래그를 꺼진 값으로 주므로 여기서도 기록하지 않는다 — fail-closed
 * 는 "켜짐" 이 아니다. 켜져 있어도 이 함수는 판정을 남길 뿐 아무것도 막지 않는다.
 */
export function recordRunTermination(
  cwd: string,
  input: RunTerminationInput,
  config: PolicyConfig = loadPolicyConfig(cwd),
  pinnedRisk?: ExpectedRiskDecision,
): RunTerminationRecord {
  const gate: RecordGate = { record: config.record, enforce: config.enforce }
  if (!gate.record && !gate.enforce) {
    return { recordingOff: true, gate, level: null, risk: null }
  }
  const level = recordLevel(cwd, input, gate, config.maxLevel)
  const risk = recordRisk(cwd, input, gate, pinnedRisk)
  return { recordingOff: false, gate, level, risk }
}
