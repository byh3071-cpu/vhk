/*
 * autonomy-stats.ts — 자율 런 3중 판정 집계 (Goal 110).
 *
 * 왜 lib 에 있나 (RFC 0066 §2.1): 이 계산은 원래 commands/stats.ts 에 있었다. 권한 단계 판정
 * (작업 단위 124)이 이것을 유일한 입력으로 쓰는데, lib 모듈이 commands 를 import 하면
 * 역방향 의존이 생긴다. 계산은 순수하므로 lib 으로 내리고 stats.ts 는 re-export 만 남긴다.
 *
 * 판정 계약의 원본은 여기 하나다 — stats.ts 에 재정의를 남기지 않는다.
 */
import type { AutonomyRunEntry } from './autonomy-log.js'
import type { ReceiptLogEntry } from './receipt-log.js'
import { normalizeTaskKind, type TaskKind } from './task-kind.js'

/** Goal 104 / #373 + Goal 110: autonomy-run 완주율. 표본 0 이면 rate null(0% 위장 금지). */
export interface AutonomyStats {
  starts: number
  complete: number
  hardstop: number
  blocked: number
  /**
   * **자기 보고** 완주율 — (complete && interventions=0) / starts. Goal 110 이전의 식 그대로다.
   * 판정용이 아니라 아래 completionRate 와의 괴리를 보기 위한 참고값이다(리서치 결정 1:
   * 자기 보고는 카운터 자격이 없다 — 얼마나 부정확한지를 수치로 남긴다).
   */
  selfReportedRate: number | null
  /** complete 중 interventions>0 */
  intervenedComplete: number

  // ── Goal 110: 3중 판정 ──

  /** 3중 조건을 전부 통과한 완주 수. */
  verifiedComplete: number
  /** 판정 대상 런 수(분모) — v2 스키마이고 인프라 실패가 아닌 런. */
  judgedRuns: number
  /** **공식 완주율** = verifiedComplete / judgedRuns. 표본 0 → null. */
  completionRate: number | null
  /** v1 라인(sha 없음)이라 기계 증거와 조인할 수 없는 런 — 분자·분모 양쪽에서 뺀다. */
  unjudgeable: number
  /** 종결 이벤트가 없는 런 — 아직 결과가 없다. 실패가 아니라 미판정이다. */
  inProgress: number
  /** 인프라 실패로 분모에서 제외된 런(110-T5). */
  infraExcluded: number
  /**
   * 인프라 제외 비율 = infraExcluded / (판정 대상 + infraExcluded). 표본이 적으면 null.
   * failureKind 는 에이전트 자기 보고라 실패를 분모에서 빼는 남용 경로가 된다 — 그 남용을
   * 막을 기계 증거가 없으므로, 대신 비율을 노출해 사람이 볼 수 있게 한다.
   */
  infraExcludedRatio: number | null
  /** 인프라 제외 비율이 임계를 넘어 자기 보고 남용이 의심되는 상태. */
  infraAbuseSuspected: boolean
  /** complete 라고 신고했지만 기계 증거가 뒷받침하지 못한 런 — 자기 보고와 실제의 격차. */
  selfReportedOnly: number
  /** 판정 대상 런의 작업 유형 분포(110-T3). */
  byTaskKind: Record<TaskKind, number>
  /** 최근 10회 중 완주 실패 수. 표본 10 미만이면 null(모름을 0 으로 위장 금지). */
  rollingFailures: number | null
  /** 최근 10회 중 3회 이상 실패 → 권한 축소 판정(110-T4). 표본 부족 → null. */
  demotionTriggered: boolean | null
  /**
   * 최근 창(ROLLING_WINDOW) 안의 자기 보고 격차 — complete 라고 신고했으나 기계 증거가
   * 뒷받침하지 못한 런의 수. 전기간 누적 selfReportedOnly 와 달리 창 안으로 한정한다.
   *
   * RFC 0066 §4.4 의 승급 차단 신호. optional 인 이유는 이 필드가 additive 로 들어와서
   * 과거 호출부·직렬화된 값이 없어도 타입이 깨지지 않게 하기 위해서다.
   */
  rollingSelfReportedOnly?: number
}

/** 롤링 판정 구간. roadmap 110-T4("최근 10회 중 3회")와 관찰 게이트("10회 중 2회 이하")의 공통 크기. */
export const ROLLING_WINDOW = 10
/** 이 횟수 이상 실패하면 권한 축소. 관찰 게이트의 "실패 2회 이하 통과"와 같은 경계. */
export const DEMOTION_FAILURE_THRESHOLD = 3

/**
 * 인프라 제외 비율이 이 값을 넘으면 자기 보고 남용을 의심한다.
 * 값의 근거 = 강등 임계와 같은 비율(3/10). 별도 임의값을 새로 만들지 않는다.
 */
export const INFRA_ABUSE_RATIO = DEMOTION_FAILURE_THRESHOLD / ROLLING_WINDOW
/** 표본이 이보다 적으면 비율을 내지 않는다 — 1건 중 1건 제외를 100% 남용으로 읽지 않기 위해. */
export const INFRA_RATIO_MIN_SAMPLE = 3

const EMPTY_KIND_COUNTS = (): Record<TaskKind, number> => ({
  chore: 0,
  docs: 0,
  deps: 0,
  source: 0,
  schema: 0,
  security: 0,
  unknown: 0,
})

/** 런 하나로 접은 결과 — 종결 이벤트 기준. */
export interface RunOutcome {
  ts: string
  judged: boolean
  verified: boolean
  taskKind: TaskKind
}

/**
 * Goal 110-T2: 완주 판정을 **검증 통과 + 검증 리포트 유효 + 사람 개입 0** 세 조건 전부로 바꾼다.
 *
 * why receipt-log 조인인가:
 *   complete 이벤트도 interventions 도 에이전트가 스스로 쓴다(commands/agent.ts). 그 둘만 세면
 *   카운터가 자기 보고 위에 서게 된다. receipt-log 는 vhk receipt 가 남기는 기계 판정
 *   (decision·red·dirty·stale)이고 SHA 를 달고 있어, 같은 SHA 로 조인하면 "그 시점 코드가 실제로
 *   게이트를 통과했는가"를 자기 보고와 무관하게 확인할 수 있다.
 *
 * ★한계(정직): ③ interventions 는 여전히 자기 보고다. 기계로 세는 방법을 찾지 못했다. 다만
 *   ①②가 기계 증거라 자기 보고만으로는 완주가 성립하지 않는다. 또한 원장 자체를 위조하면
 *   막을 수 없다 — receipt-log 는 추적 파일이라 위조가 커밋 diff 에 드러나는 수준까지가 방어선이다.
 */
export function calcAutonomyStats(
  entries: AutonomyRunEntry[],
  receipts: ReceiptLogEntry[] = [],
): AutonomyStats {
  let starts = 0
  let complete = 0
  let hardstop = 0
  let blocked = 0
  let unattendedComplete = 0
  let intervenedComplete = 0
  for (const e of entries) {
    if (e.event === 'start') starts++
    else if (e.event === 'complete') {
      complete++
      if ((e.interventions ?? 0) > 0) intervenedComplete++
      else unattendedComplete++
    } else if (e.event === 'hardstop') hardstop++
    else if (e.event === 'blocked') blocked++
  }

  // 같은 SHA 로 receipt 가 여러 번 발행될 수 있다(재실행). 마지막 발행이 최종 판정이므로
  // ts 오름차순으로 넣어 뒤엣것이 앞엣것을 덮게 한다.
  const receiptBySha = new Map<string, ReceiptLogEntry>()
  for (const r of [...receipts].sort((a, b) => a.ts.localeCompare(b.ts))) {
    if (r.sha) receiptBySha.set(r.sha, r)
  }

  const outcomes: RunOutcome[] = []
  let unjudgeable = 0
  let inProgress = 0
  let infraExcluded = 0
  let selfReportedOnly = 0
  const byTaskKind = EMPTY_KIND_COUNTS()

  for (const [, run] of groupRuns(entries)) {
    const { start, end } = run
    if (!start) continue // 종결만 있고 시작이 없는 라인 — 런으로 세지 않는다(분모 오염 방지)
    // v1 라인은 sha 가 없어 기계 증거와 이을 수 없다. 실패로 몰지 않고 "판정 불가"로 뺀다.
    if (start.schemaVersion === undefined || !start.sha) {
      unjudgeable++
      continue
    }
    // 종결 이벤트가 없는 런은 아직 결과가 없다. 실패로 세면 지금 돌고 있는 런이 즉시 실패
    // 1건이 되어 완주율과 롤링 강등을 왜곡한다. 판정 대상이 아니라 "진행 중"으로 뺀다.
    if (!end) {
      inProgress++
      continue
    }
    // 인프라 실패는 도구의 자율성 실패가 아니다 → 분모에서 제외(110-T5).
    // ★ 종결 실패에서만 인정한다. complete 에 붙은 infra 를 그대로 받으면 "성공했는데 분모에서도
    //   빠지는" 경로가 생긴다. 기록 단계(commands/agent.ts)에서도 막지만, 원장에 직접 쓴 라인과
    //   과거 라인이 있을 수 있으므로 집계 단계에서 이벤트 종류를 다시 확인한다.
    if (end.event !== 'complete' && end.failureKind === 'infra') {
      infraExcluded++
      continue
    }
    const kind = normalizeTaskKind(end.taskKind ?? start.taskKind)
    byTaskKind[kind]++

    const verified = end.event === 'complete' && isVerifiedComplete(end, receiptBySha)
    if (end.event === 'complete' && !verified) selfReportedOnly++
    outcomes.push({ ts: end.ts, judged: true, verified, taskKind: kind })
  }

  const judgedRuns = outcomes.length
  const verifiedComplete = outcomes.filter((o) => o.verified).length

  // 롤링 강등 — 판정 대상 런만, 종결 시각 오름차순의 마지막 ROLLING_WINDOW 개.
  const recent = [...outcomes].sort((a, b) => a.ts.localeCompare(b.ts)).slice(-ROLLING_WINDOW)
  const windowFull = recent.length >= ROLLING_WINDOW
  const rollingFailures = windowFull ? recent.filter((o) => !o.verified).length : null

  // 인프라 제외 남용 감시 — 분모는 "제외되지 않았다면 판정 대상이었을 런" 전체다.
  const infraBase = judgedRuns + infraExcluded
  const infraExcludedRatio = infraBase < INFRA_RATIO_MIN_SAMPLE ? null : infraExcluded / infraBase

  return {
    starts,
    complete,
    hardstop,
    blocked,
    intervenedComplete,
    selfReportedRate: starts === 0 ? null : unattendedComplete / starts,
    verifiedComplete,
    judgedRuns,
    completionRate: judgedRuns === 0 ? null : verifiedComplete / judgedRuns,
    unjudgeable,
    inProgress,
    infraExcluded,
    infraExcludedRatio,
    infraAbuseSuspected: infraExcludedRatio !== null && infraExcludedRatio > INFRA_ABUSE_RATIO,
    selfReportedOnly,
    byTaskKind,
    rollingFailures,
    demotionTriggered: rollingFailures === null ? null : rollingFailures >= DEMOTION_FAILURE_THRESHOLD,
  }
}

/** runId → {start, end}. 종결이 여러 번 기록되면 첫 종결이 그 런의 결말이다. */
export function groupRuns(
  entries: AutonomyRunEntry[],
): Map<string, { start?: AutonomyRunEntry; end?: AutonomyRunEntry }> {
  const runs = new Map<string, { start?: AutonomyRunEntry; end?: AutonomyRunEntry }>()
  for (const e of entries) {
    const slot = runs.get(e.runId) ?? {}
    if (e.event === 'start') {
      slot.start ??= e
    } else {
      slot.end ??= e
    }
    runs.set(e.runId, slot)
  }
  return runs
}

/**
 * 3중 조건 — 전부 참이어야 완주다.
 * ① 검증 통과: 같은 SHA 의 receipt 가 block 이 아니고 실종료코드 red 도 아님
 * ② 리포트 유효: 그 receipt 가 dirty 아니고 stale 도 아님
 * ③ 사람 개입 0
 *
 * why stale===false 를 요구하지 않는가:
 *   과거 receipt-log에는 신선도 미상(null)이 남아 있다. 이를 소급 탈락시키지 않되, 관찰 게이트가
 *   요구하는 "현재 HEAD와 일치하는 verify 결과"는 SHA 조인(receipt.sha === 종결.sha)으로 보장한다.
 *   신규 receipt는 verify SHA·dirty와 현재 HEAD·dirty를 직접 대조하고 true일 때 탈락시킨다.
 */
export function isVerifiedComplete(end: AutonomyRunEntry, receiptBySha: Map<string, ReceiptLogEntry>): boolean {
  if ((end.interventions ?? 0) > 0) return false // ③
  if (!end.sha) return false // 조인 불가 — 기계 증거 없음
  const r = receiptBySha.get(end.sha)
  if (!r) return false // 그 시점 receipt 가 아예 없다 → 검증되지 않은 완료 주장
  if (r.decision === 'block' || r.red) return false // ①
  return !r.dirty && r.stale !== true // ②
}
