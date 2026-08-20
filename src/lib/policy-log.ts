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
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { PermissionLevel, TransitionKind } from './permission-level.js'

export const POLICY_LOG_PATH_REL = join('.vhk', 'events', 'policy-decision.jsonl')
export const POLICY_LOG_SCHEMA_VERSION = 1

/** 판정 결과. 세 값만 쓴다(§3.2). */
export type PolicyVerdict = 'allow' | 'require-human' | 'deny'

/** 닫힌집합. `level`·`risk` 는 RFC 0066, `allowlist`·`budget` 은 RFC 0067 이 쓴다. */
export type PolicyDecisionKind = 'level' | 'risk' | 'allowlist' | 'budget'

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
  sha?: string

  // kind: 'level' 전용 (§3.3)
  from?: PermissionLevel | null
  to?: PermissionLevel
  transition?: TransitionKind
  judgedRuns?: number
  rollingFailures?: number | null
  window?: number
}

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

/** 원장 전체를 읽는다. 손상 라인은 건너뛴다 — 한 줄이 전체를 죽이지 않는다. */
export function readPolicyLog(cwd: string): PolicyDecisionV1[] {
  const p = join(cwd, POLICY_LOG_PATH_REL)
  if (!existsSync(p)) return []
  const out: PolicyDecisionV1[] = []
  for (const line of readFileSync(p, 'utf-8').split('\n')) {
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
  appendFileSync(p, `${JSON.stringify(entry)}\n`, 'utf-8')
  return { written: true, conflict: false }
}
