/*
 * permission-level.ts — 자율 실행의 권한 단계 판정 (작업 단위 124-T1 · RFC 0066 §4).
 *
 * 이 모듈은 **계산만** 한다. 원장에 쓰지 않고(그건 policy-log.ts / T3), 단계를 저장하지도
 * 않는다(§4.7). 현재 단계는 원장의 마지막 level 라인에서 매번 다시 계산되는 파생값이다.
 * 파생 스냅샷이 원본 행세를 하는 것을 막기 위해서다.
 *
 * 원장이 통째로 사라지면 단계는 시작값으로 돌아간다. 이것은 결함이 아니라 fail-closed 다 —
 * "과거 로컬 진행 상태는 복구된 것으로 추측하지 않고 unknown 으로 돌아간다"는 규율과 같다.
 */
import type { AutonomyStats } from './autonomy-stats.js'

/** 무엇을 허용하는가의 상한. 낮은 단계가 높은 단계의 부분집합이다. */
export const LEVELS = ['L0', 'L1', 'L2', 'L3'] as const
export type PermissionLevel = (typeof LEVELS)[number]

/**
 * `L3` 가 절대 상한인 근거는 ADR-009 ② 다. `L4` 는 정의하지 않는다 —
 * "자동 머지 활성화" 는 로드맵 §8 에서 이번 계열 밖으로 명시 제외돼 있다.
 */
export const MAX_LEVEL: PermissionLevel = 'L3'

/**
 * 승급을 허용하는 최근 창의 실패 상한. **이 계열의 유일한 새 상수다**(§4.6).
 *
 * 값이 1인 근거는 진동(flapping) 방지다. 관찰 게이트의 통과선은 "실패 2회 이하", 축소선은
 * "3회 이상" 이다. 승급선을 통과선과 같은 2로 두면 실패 2건과 3건 사이를 오갈 때 매 런마다
 * 승급·축소가 번갈아 난다. 승급 ≤1 / 유지 =2 / 축소 ≥3 으로 한 칸을 비워 히스테리시스를 만든다.
 */
export const PROMOTION_FAILURE_MAX = 1

export type TransitionKind = 'init' | 'promote' | 'demote' | 'hold'

export type LevelReasonCode =
  | 'LEDGER_EMPTY'
  | 'NO_NEW_JUDGED_RUN'
  | 'INSUFFICIENT_SAMPLE'
  | 'DEMOTE_ROLLING_FAILURES'
  | 'INFRA_ABUSE_SUSPECTED'
  | 'SELF_REPORT_GAP'
  | 'PROMOTE_ROLLING_CLEAN'
  | 'HOLD_HYSTERESIS'

/** 원장의 마지막 `kind: 'level'` 라인에서 판정에 필요한 부분만(§3.3). */
export interface LevelLine {
  to: PermissionLevel
  /** 전이 근거 표본 수. 다음 판정의 트리거 비교 기준이다(§4.3). */
  judgedRuns: number
  ts: string
}

/** 사람이 설정하는 것 — 상한을 **낮출 때만** 쓴다(§4.7). */
export interface PermissionConfig {
  maxLevel?: PermissionLevel
}

export interface LevelDecision {
  level: PermissionLevel
  transition: TransitionKind
  reasonCode: LevelReasonCode
}

function indexOf(level: PermissionLevel): number {
  return LEVELS.indexOf(level)
}

/** 하한 `L0` 과 상한 `L3` 을 둘 다 고정한다. 이 범위 밖으로 나가는 경로는 코드에 없어야 한다. */
export function clampLevel(index: number): PermissionLevel {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, index))]
}

/** 계산 결과와 사람이 정한 상한 중 낮은 쪽. 사람은 낮출 수만 있다. */
function capped(index: number, config: PermissionConfig): PermissionLevel {
  const ceiling = config.maxLevel ? indexOf(config.maxLevel) : indexOf(MAX_LEVEL)
  return clampLevel(Math.min(index, ceiling))
}

/**
 * 권한 단계 판정 (§4.4 의사코드).
 *
 * 분기 순서가 곧 계약이다. 특히 축소(3)가 승급(5)보다 **먼저**여야 한다 —
 * 순서를 바꾸면 실패가 쌓이는 중에도 승급이 난다.
 *
 * @param stats 3중 판정 집계 — 권한 판정의 유일한 입력(§2)
 * @param config 사람이 설정한 상한
 * @param last 원장의 마지막 level 라인. 없으면 null
 */
export function decidePermissionLevel(
  stats: AutonomyStats,
  config: PermissionConfig,
  last: LevelLine | null,
): LevelDecision {
  // 0) 신규 진입 — 원장에 level 라인이 없다.
  //    §11 Q1 확정: L1(제안)에서 시작한다. L0 완전 차단은 원장이 비는 게 흔한 상태(새 클론·
  //    유실)라 자율 레인이 매번 멈추고, 그러면 표본이 안 쌓여 승급도 영원히 못 한다.
  if (last === null) {
    return { level: capped(indexOf('L1'), config), transition: 'init', reasonCode: 'LEDGER_EMPTY' }
  }

  const previous = indexOf(last.to)

  // 1) 전이 트리거 — 판정 대상 런이 늘지 않았으면 아무 일도 없다(§4.3 치명 3).
  //    이게 없으면 vhk policy level 을 세 번 불러 L1 → L3 로 올라가는 경로가 열린다.
  if (stats.judgedRuns <= last.judgedRuns) {
    return { level: capped(previous, config), transition: 'hold', reasonCode: 'NO_NEW_JUDGED_RUN' }
  }

  // 2) 표본 부족 — 유지한다. 하강시키지 않는다(중대 15).
  //    표본이 없다는 것은 나쁜 소식이 아니라 무소식이다.
  if (stats.rollingFailures === null) {
    return { level: capped(previous, config), transition: 'hold', reasonCode: 'INSUFFICIENT_SAMPLE' }
  }

  // 3) 축소가 승급보다 먼저다.
  if (stats.demotionTriggered === true) {
    return {
      level: capped(previous - 1, config),
      transition: 'demote',
      reasonCode: 'DEMOTE_ROLLING_FAILURES',
    }
  }

  // 4) 승급 차단 신호 — 하나라도 켜지면 유지. 첫 신호만 기록한다.
  if (stats.infraAbuseSuspected) {
    return {
      level: capped(previous, config),
      transition: 'hold',
      reasonCode: 'INFRA_ABUSE_SUSPECTED',
    }
  }
  if ((stats.rollingSelfReportedOnly ?? 0) > 0) {
    return { level: capped(previous, config), transition: 'hold', reasonCode: 'SELF_REPORT_GAP' }
  }

  // 5) 승급 — 창이 충분히 깨끗할 때만 한 칸.
  if (stats.rollingFailures <= PROMOTION_FAILURE_MAX) {
    return {
      level: capped(previous + 1, config),
      transition: 'promote',
      reasonCode: 'PROMOTE_ROLLING_CLEAN',
    }
  }

  // 6) 그 사이 — 히스테리시스 구간.
  return { level: capped(previous, config), transition: 'hold', reasonCode: 'HOLD_HYSTERESIS' }
}
