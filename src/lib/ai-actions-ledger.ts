import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripBom } from './read-json.js'

// Goal 55(action-ledger, 별도 배치): AI 행동 원장 .vhk/events/ai-actions.jsonl 의 **reader**.
//   Goal 61(stats) 집계용으로 본 배치에서 먼저 도입. 55 의 writer(runGuarded append)가
//   main 에 머지되기 전에는 파일이 없을 수 있다 → 안전하게 [] 반환(차단율 0, 멈춤 없음).
//   입출력은 evidence-ledger.readLedger 패턴 재사용(JSONL·손상 skip·BOM-safe — 라인 변수 파싱이라 raw-json-parse 가드 통과).
export const AI_ACTIONS_PATH_REL = join('.vhk', 'events', 'ai-actions.jsonl')

export interface AiActionEntry {
  ts: string
  action: string
  channel: string
  guard: string
  ran: boolean
  reason: string
  target?: string
  sha?: string
}

/**
 * ai-actions.jsonl 파싱(JSONL). 파일 없음 → [](55 미연동 안전). 손상 라인 skip. BOM-safe.
 * 최소 스키마(action:string, ran:boolean) 검증 — 형태 안 맞는 줄은 무시.
 */
export function readAiActions(cwd: string): AiActionEntry[] {
  const p = join(cwd, AI_ACTIONS_PATH_REL)
  if (!existsSync(p)) return []
  const out: AiActionEntry[] = []
  for (const line of stripBom(readFileSync(p, 'utf-8')).split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    try {
      const e = JSON.parse(t) as AiActionEntry
      if (e && typeof e.action === 'string' && typeof e.ran === 'boolean') out.push(e)
    } catch {
      /* 손상 라인 skip — 원장이 한 줄 깨졌다고 죽지 않음 */
    }
  }
  return out
}
