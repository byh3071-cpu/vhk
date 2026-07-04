import { existsSync, readFileSync, mkdirSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripBom } from './read-json.js'
import type { AgentId } from './detect-agent.js'

// Goal 55: AI 행동 원장.
// "AI 가 무엇을 실행/차단당했나" 를 레포 영속으로 남긴다 — 가드 chokepoint(runGuarded) 와
// HARD_STOP 트립와이어 차단을 행동 단위(JSONL)로 기록.
// evidence-ledger(릴리즈 verify 증거 요약)와 별개·중복 아님: 이건 행동 로그다.
// .vhk/events/ai-actions.jsonl 은 .vhk/.gitignore·root .gitignore 어디서도 제외하지 않는다(영속 목적).

export const ACTION_LEDGER_PATH_REL = join('.vhk', 'events', 'ai-actions.jsonl')

export interface AiActionEntry {
  /** 머신 타임스탬프(UTC ISO) */
  ts: string
  /** 가드 대상 action 문자열(publish/undo/save 등) */
  action: string
  /** 실행 경로 — 'cli'|'mcp'|'nl', HARD_STOP 차단은 'hardstop' (그래서 Channel 이 아니라 string) */
  channel: string
  /** 가드 결정 — 'confirm'|'preview'|'warn'|'allow', HARD_STOP 차단은 'hardstop' */
  guard: string
  /** 실제 실행됐는가 */
  ran: boolean
  /** 결정 사유 — approved/declined/no-confirm/preview-no-approve/low-risk/lite-warn/hard-stop 등 */
  reason: string
  /** 대상(파일/경로 등) — 있을 때만 */
  target?: string
  /** 행동 시점 커밋 SHA — 있을 때만 */
  sha?: string
  /**
   * RFC 0057 트랙②: 이 행동을 시킨 에이전트(env 신호 자동 감지 또는 GuardDeps.agent override).
   * 옵셔널 — 필드 추가 이전 과거 원장 라인(agent 프로퍼티 자체 없음)을 읽어도 타입이 깨지지
   * 않게(하위호환).
   */
  agent?: AgentId
}

/** 행동 원장 파싱(JSONL). 손상 라인은 관용적으로 skip(원장이 한 줄 깨졌다고 읽기가 죽지 않음). */
export function readActionLedger(cwd: string): AiActionEntry[] {
  const p = join(cwd, ACTION_LEDGER_PATH_REL)
  if (!existsSync(p)) return []
  const out: AiActionEntry[] = []
  // BOM-safe: stripBom 변수 경유로 읽어 raw parse 금지 게이트(check-no-raw-json-parse) 통과.
  for (const line of stripBom(readFileSync(p, 'utf-8')).split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    try {
      out.push(JSON.parse(t) as AiActionEntry)
    } catch {
      /* 손상 라인 skip */
    }
  }
  return out
}

/**
 * 행동 한 줄 append(append-only · dedup 없음 — 모든 행동이 보존돼야 감사가 정직하다).
 * O(1) append(O_APPEND) — evidence-ledger 의 read-modify-write(전체 재기록)와 달리 행동 원장은
 * dedup 이 없어 통째 다시 쓸 이유가 없다. appendFileSync 면:
 *  - 동시성: 병렬 세션·CLI+MCP 가 같은 레포에 동시 기록해도 각자 한 줄을 원자적으로 덧붙여
 *    lost-update 가 없다(read→결합→rename 의 통째 덮어쓰기 경합 제거 — 적대리뷰 high).
 *  - 성능: 호출당 O(1)(누적 O(n²) → O(n)). 쓰기 도중 kill 로 마지막 줄이 잘려도
 *    readActionLedger 가 손상 라인을 skip 하므로 안전.
 */
export function appendActionEntry(cwd: string, entry: AiActionEntry): void {
  const p = join(cwd, ACTION_LEDGER_PATH_REL)
  mkdirSync(join(cwd, '.vhk', 'events'), { recursive: true })
  appendFileSync(p, JSON.stringify(entry) + '\n', 'utf-8')
}
