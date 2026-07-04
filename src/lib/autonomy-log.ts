import { existsSync, readFileSync, mkdirSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { stripBom } from './read-json.js'

// 이슈 #373: 자율성완주율 측정 스키마.
// vhk-auto(SKILL.md) 루프가 "몇 번 시작해서 몇 번 사람 개입(HARD_STOP·blocker) 없이
// 끝났나"를 레포 영속으로 남긴다 — action-ledger.ts(가드 chokepoint 행동 로그)와 별개·중복
// 아님: 이건 "자율 루프 런(run) 단위" 완주율 로그다.
// .vhk/events/autonomy-run.jsonl 은 .vhk/.gitignore·root .gitignore 어디서도 제외하지
// 않는다(영속 목적) — action-ledger.ts 선례 그대로.

export const AUTONOMY_LOG_PATH_REL = join('.vhk', 'events', 'autonomy-run.jsonl')

/** 자율 루프 종결 방식 4종. SKILL.md 루프 6번 종결 분기 3개 + 시작(start) 1개. */
export type AutonomyEvent = 'start' | 'complete' | 'hardstop' | 'blocked'

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
}

/** 자율 런 원장 파싱(JSONL). 손상 라인은 관용적으로 skip(action-ledger.ts 와 동일 계약). */
export function readAutonomyLog(cwd: string): AutonomyRunEntry[] {
  const p = join(cwd, AUTONOMY_LOG_PATH_REL)
  if (!existsSync(p)) return []
  const out: AutonomyRunEntry[] = []
  // BOM-safe: stripBom 변수 경유로 읽어 raw parse 금지 게이트(check-no-raw-json-parse) 통과.
  for (const line of stripBom(readFileSync(p, 'utf-8')).split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    try {
      out.push(JSON.parse(t) as AutonomyRunEntry)
    } catch {
      /* 손상 라인 skip */
    }
  }
  return out
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

/** 새 런 ID 발급(crypto.randomUUID) — start 이벤트에서만 호출된다. */
export function newAutonomyRunId(): string {
  return randomUUID()
}
