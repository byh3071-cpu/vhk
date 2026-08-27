/*
 * execution-limits.ts — 호출 수·시간 한도 판정 (작업 단위 125a-T3 · RFC 0067 §5.3-3·§5.4).
 *
 * **기계가 직접 세는 값만 쓴다.** 단조 시계 경과와 명령 호출 수다.
 *
 * why 달러 금액을 안 쓰나(§5.5 치명 4): `cost.jsonl` 은 수동 입력이고(`vhk cost add`),
 * `CostEntry` 에 `runId` 가 없어 런 단위 조인이 안 되며, 에이전트가 안 부르면 사용량이 0 이다.
 * **안 부르는 것이 가장 쉬운 우회**다. 자기 보고 원장은 하드리밋의 근거가 될 수 없다 —
 * 110 이 완주율에서 자기 보고를 뺐는데 여기서 다시 들이면 같은 구멍을 다른 자리에 뚫는 것이다.
 * 정확한 달러 금액은 아니지만 **막으려는 것은 금액이 아니라 폭주**다.
 *
 * 이 모듈은 순수하다. 상태 파일 읽기·쓰기는 run-state.ts 소관이다.
 */
import type { ExecutionLimits } from './policy-config.js'

export type { ExecutionLimits }

export type LimitReasonCode =
  | 'CALL_BUDGET_EXCEEDED'
  | 'TIME_LIMIT_EXCEEDED'
  | 'TIME_LIMIT_WOULD_EXCEED'
  | 'CLOCK_ANOMALY'

export interface CallBudgetResult {
  exceeded: boolean
  reasonCode?: LimitReasonCode
}

export interface TimeBudgetInput {
  startedAtUtc: string
  lastSeenUtc: string
  nowUtc: string
  limits: ExecutionLimits
  /** 이번에 띄울 명령의 개별 상한(초) */
  commandMaxSec: number
  /** 이 런에 이미 이상 시계가 기록돼 있는가 */
  priorAnomaly?: boolean
}

export interface TimeBudgetResult {
  exceeded: boolean
  reasonCode?: LimitReasonCode
  /** 음수 클램프를 거친 경과(초) */
  elapsedSec: number
  clockAnomaly: boolean
  /** 단조 증가를 강제한 다음 `lastSeenUtc` */
  nextLastSeenUtc: string
}

/**
 * 호출 수 판정.
 *
 * `count` 는 **이번 호출을 포함하기 직전** 값이다. 진입점이 실행 **전**에 세기 때문이다 —
 * 실행 후에 세면 프로세스가 죽었을 때 카운트가 누락되고, 죽는 명령을 반복하는 루프가
 * 카운터를 영원히 올리지 못한다.
 */
export function evaluateCallBudget(count: number, limits: ExecutionLimits): CallBudgetResult {
  if (!Number.isSafeInteger(count) || count < 0 || count >= limits.perRunCommandCount) {
    return { exceeded: true, reasonCode: 'CALL_BUDGET_EXCEEDED' }
  }
  return { exceeded: false }
}

/** 이번 명령에 적용할 상한(초). 런 상한을 넘지 못한다. */
export function resolveClock(
  entry: { maxDurationSec?: number },
  limits: ExecutionLimits,
): number {
  const base = entry.maxDurationSec ?? limits.perCommandSec
  return Math.min(base, limits.perRunSec)
}

/**
 * 시간 판정 (§5.3-3).
 *
 * 런 누적은 **벽시계 UTC 차**로 잰다 — 프로세스 경계를 넘어야 해서 시스템 공통 기준이 필요하다.
 * 명령 하나는 프로세스 지역 단조시계로 재고, 그건 `SafeExecOptions.timeoutMs` 가 처리한다(§5.4).
 * 두 층을 섞지 않는다.
 *
 * 벽시계는 역행할 수 있다(NTP 보정·시간대 변경·수동 조정). `clockAnomaly` 가 한 번 켜지면
 * **그 런은 끝난다.** 시계가 흔들린 런에서 시간 한도를 계속 믿는 것보다 멈추는 쪽이 안전하다 —
 * 드문 상황에서 관대해지는 것이 정확히 하드리밋이 뚫리는 방식이다.
 */
export function evaluateTimeBudget(input: TimeBudgetInput): TimeBudgetResult {
  const { startedAtUtc, lastSeenUtc, nowUtc, limits, commandMaxSec } = input
  const now = Date.parse(nowUtc)
  const started = Date.parse(startedAtUtc)
  const lastSeen = Date.parse(lastSeenUtc)

  let clockAnomaly = input.priorAnomaly === true
  const parsedClock = [now, started, lastSeen].every(Number.isFinite)
  let elapsedSec = parsedClock ? (now - started) / 1000 : 0

  if (!parsedClock) {
    return {
      exceeded: true,
      reasonCode: 'CLOCK_ANOMALY',
      elapsedSec,
      clockAnomaly: true,
      nextLastSeenUtc: Number.isFinite(now) ? nowUtc : lastSeenUtc,
    }
  }

  if (elapsedSec < 0) {
    elapsedSec = 0 // 음수 클램프
    clockAnomaly = true
  }
  if (now < lastSeen) {
    clockAnomaly = true // 시간이 뒤로 갔다
  }

  // 단조 증가 강제 — 벽시계를 뒤로 돌려 경과를 줄이는 우회도 같이 막힌다.
  const nextLastSeenUtc = now >= lastSeen ? nowUtc : lastSeenUtc

  if (clockAnomaly) {
    return { exceeded: true, reasonCode: 'CLOCK_ANOMALY', elapsedSec, clockAnomaly, nextLastSeenUtc }
  }
  if (elapsedSec >= limits.perRunSec) {
    return {
      exceeded: true,
      reasonCode: 'TIME_LIMIT_EXCEEDED',
      elapsedSec,
      clockAnomaly,
      nextLastSeenUtc,
    }
  }
  // 지금 띄우면 런 상한을 넘길 게 확정이면 띄우기 전에 막는다.
  if (elapsedSec + commandMaxSec > limits.perRunSec) {
    return {
      exceeded: true,
      reasonCode: 'TIME_LIMIT_WOULD_EXCEED',
      elapsedSec,
      clockAnomaly,
      nextLastSeenUtc,
    }
  }
  return { exceeded: false, elapsedSec, clockAnomaly, nextLastSeenUtc }
}
