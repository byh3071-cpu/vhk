import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWriteFile } from './atomic-write.js'
import { stripBom } from './read-json.js'

// Goal 56: AI 비용 사용량 원장. evidence-ledger.ts 의 append 패턴 재사용(append-only, 원자적 쓰기).
// vhk 는 Claude API 를 직접 호출하지 않아 비용을 자동 추적할 수 없으므로, 사용량은 외부 입력
// (`vhk cost add` 또는 환경변수 VHK_COST_*)으로 먹인다. dedup 없음 — 매 기록이 실 사용분.

export const COST_PATH_REL = join('.vhk', 'cost.jsonl')

export interface CostEntry {
  /** ISO timestamp */
  ts: string
  /** 입력 출처 — 'manual' | 'env' 등 */
  source: string
  /** 이 기록의 비용(USD). add 시점에 토큰×요율로 환산해 저장(cost-policy.usdOf). */
  usd: number
  model?: string
  inputTokens?: number
  outputTokens?: number
}

/** .vhk/cost.jsonl 파싱(JSONL). 손상 라인은 관용적으로 skip(원장 한 줄 깨져도 안 죽음). */
export function readCostEntries(cwd: string): CostEntry[] {
  const p = join(cwd, COST_PATH_REL)
  if (!existsSync(p)) return []
  const out: CostEntry[] = []
  for (const line of stripBom(readFileSync(p, 'utf-8')).split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    try {
      out.push(JSON.parse(t) as CostEntry)
    } catch {
      /* 손상 라인 skip */
    }
  }
  return out
}

/**
 * cost.jsonl 에 한 줄 append(append-only). 원자적 쓰기(temp→rename) — 쓰기 도중 kill 에도 손상 방지.
 * 비용 기록은 dedup 안 함(동일 값도 별개 사용분).
 */
export function appendCostEntry(cwd: string, entry: CostEntry): { appended: boolean } {
  const p = join(cwd, COST_PATH_REL)
  mkdirSync(join(cwd, '.vhk'), { recursive: true })
  const existing = existsSync(p) ? stripBom(readFileSync(p, 'utf-8')).replace(/\n*$/, '') : ''
  const body = (existing ? existing + '\n' : '') + JSON.stringify(entry) + '\n'
  atomicWriteFile(p, body)
  return { appended: true }
}

/** 누적 사용량 합($). */
export function sumUsd(entries: CostEntry[]): number {
  return entries.reduce((s, e) => s + (typeof e.usd === 'number' ? e.usd : 0), 0)
}
