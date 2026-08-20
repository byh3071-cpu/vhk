/*
 * execution-preflight.ts — 실행 전 결정론 검사 (작업 단위 125a-T5 · RFC 0067 §4).
 *
 * "이 명령을 지금 실행해도 되는가" 를 **LLM 없이 룰과 하드리밋으로만** 판정한다.
 * 실패 비용이 큰 자동화는 결정 경로에서 LLM 을 뺀다.
 *
 * **단락 평가다. 첫 거부에서 즉시 멈추고 나머지를 계산하지 않는다.**
 * 순서가 곧 계약이다:
 *
 *   ① 중단 신호 → ② 허용목록 → ③ 호출 수 → ④ 시간 → ⑤ 권한 단계
 *
 * ①이 첫 자리인 이유는 `HARD_STOP` 이 이 저장소의 최상위 트립와이어이기 때문이다.
 * 해제는 사람이 `vhk resume --confirm` 으로만 하고 자동 호출은 금지돼 있다 —
 * 그 규율을 자율 레인이 우회하는 순간 트립와이어가 무의미해진다.
 *
 * ⑤가 마지막인 이유는 적대 검증 치명 9 다. 초안은 단계 검사를 하드리밋보다 앞에 둬서,
 * `require-human` 이 먼저 반환되면 예산·시간이 **한 번도 계산되지 않은 채** 사람이 승인하는
 * 경로가 열렸다. 사람이 "응" 이라고 한 순간 한도 없는 실행이 된다.
 * **하드리밋을 전부 통과한 뒤에만 사람 승인을 묻는다.** ①~④는 사람 승인으로도 풀리지 않는다.
 */
import { LEVELS, type PermissionLevel } from './permission-level.js'
import { matchAllowEntry, type AllowEntry } from './command-allowlist.js'
import { evaluateCallBudget, evaluateTimeBudget, resolveClock, type ExecutionLimits } from './execution-limits.js'

export type PreflightVerdict = 'allow' | 'require-human' | 'deny'

export type PreflightReasonCode =
  | 'HARD_STOP_ACTIVE'
  | 'NOT_IN_ALLOWLIST'
  | 'CALL_BUDGET_EXCEEDED'
  | 'TIME_LIMIT_EXCEEDED'
  | 'TIME_LIMIT_WOULD_EXCEED'
  | 'CLOCK_ANOMALY'
  | 'LEVEL_TOO_LOW'
  | 'PREFLIGHT_PASSED'

export interface PreflightRequest {
  bin: string
  args: readonly string[]
}

export interface PreflightContext {
  hardStopActive: boolean
  allowlist: readonly AllowEntry[]
  limits: ExecutionLimits
  level: PermissionLevel
  runCommandCount: number
  /** 런 시작 UTC — 시간 판정 입력 */
  startedAtUtc: string
  lastSeenUtc: string
  nowUtc: string
  /** 이 런에 이상 시계가 이미 기록돼 있는가 */
  clockAnomaly?: boolean
}

export interface PreflightResult {
  verdict: PreflightVerdict
  reasonCode: PreflightReasonCode
  /** 통과했을 때 매칭된 허용목록 항목 id */
  matchedId?: string
  /** 통과했을 때 이 명령에 적용할 상한(초) — 호출부가 timeout 으로 넘긴다 */
  commandCapSec?: number
  /** 단조 증가를 강제한 다음 lastSeenUtc — 호출부가 상태 갱신에 쓴다 */
  nextLastSeenUtc?: string
  clockAnomaly?: boolean
}

function deny(reasonCode: PreflightReasonCode): PreflightResult {
  return { verdict: 'deny', reasonCode }
}

function levelIndex(level: PermissionLevel): number {
  return LEVELS.indexOf(level)
}

/**
 * 실행 전 판정 (§4.4).
 *
 * 같은 입력에 항상 같은 결과를 준다 — 시각·난수·네트워크·파일시스템을 직접 읽지 않는다.
 * 필요한 값은 전부 `ctx` 로 받는다. 그래야 판정이 재현 가능하고 테스트로 전수 고정된다.
 */
export function preflight(request: PreflightRequest, ctx: PreflightContext): PreflightResult {
  // ① 중단 신호 — 최상위 트립와이어. 사람만 해제한다.
  if (ctx.hardStopActive) return deny('HARD_STOP_ACTIVE')

  // ② 허용목록 — 정규화된 bin + args 정확 일치.
  const entry = matchAllowEntry(ctx.allowlist, request.bin, request.args)
  if (entry === null) return deny('NOT_IN_ALLOWLIST')

  // ③ 호출 수 — 기계가 직접 센 값.
  const call = evaluateCallBudget(ctx.runCommandCount, ctx.limits)
  if (call.exceeded) return deny('CALL_BUDGET_EXCEEDED')

  // ④ 시간 — 런 누적 먼저, 그 다음 "이번 명령이 끝날 수 있는가".
  //    끝날 수 없는 명령은 시작하지 않는다 — 어차피 죽일 실행에 토큰과 시계를 쓰지 않는다.
  const commandCapSec = resolveClock(entry, ctx.limits)
  const time = evaluateTimeBudget({
    startedAtUtc: ctx.startedAtUtc,
    lastSeenUtc: ctx.lastSeenUtc,
    nowUtc: ctx.nowUtc,
    limits: ctx.limits,
    commandMaxSec: commandCapSec,
    priorAnomaly: ctx.clockAnomaly,
  })
  if (time.exceeded) {
    return {
      verdict: 'deny',
      reasonCode: time.reasonCode ?? 'TIME_LIMIT_EXCEEDED',
      nextLastSeenUtc: time.nextLastSeenUtc,
      clockAnomaly: time.clockAnomaly,
    }
  }

  // ⑤ 권한 단계 — 하드리밋을 전부 통과한 뒤에만 사람을 부른다.
  if (levelIndex(ctx.level) < levelIndex(entry.minLevel)) {
    return {
      verdict: 'require-human',
      reasonCode: 'LEVEL_TOO_LOW',
      matchedId: entry.id,
      commandCapSec,
      nextLastSeenUtc: time.nextLastSeenUtc,
      clockAnomaly: time.clockAnomaly,
    }
  }

  return {
    verdict: 'allow',
    reasonCode: 'PREFLIGHT_PASSED',
    matchedId: entry.id,
    commandCapSec,
    nextLastSeenUtc: time.nextLastSeenUtc,
    clockAnomaly: time.clockAnomaly,
  }
}

/**
 * 종료 코드 (§4.3).
 *
 * `require-human` 을 0 으로 두지 않는다. 0 은 "그냥 해도 된다" 로 읽히고, 호출부가
 * 종료 코드만 보고 진행하면 승인 절차가 통째로 생략된다.
 */
export function exitCodeOf(verdict: PreflightVerdict): number {
  if (verdict === 'allow') return 0
  if (verdict === 'require-human') return 2
  return 1
}
