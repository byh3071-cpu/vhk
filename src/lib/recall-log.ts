import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWriteFile } from './atomic-write.js'
import { ensureVhkIgnored } from './backup.js'

/**
 * recall 사용 로그 (RFC 0049 ④) — 실쿼리 축적으로 정직한 검증(eval) 가능케 + 미래 데이터 씨앗.
 * best-effort: 기록 실패는 recall 본 기능을 절대 막지 않는다. maxSize 1000줄(초과 시 오래된 것 trim).
 */

export const RECALL_LOG_REL = join('.vhk', 'recall-log.jsonl')
export const RECALL_LOG_MAX = 1000

export interface RecallLogEntry {
  ts: string
  source: 'recall' | 'jit'
  query: string
  hitIds: string[]
  topScore: number
}

/** 한 건 append. ts 는 내부에서 부여. 1000줄 cap. 실패해도 throw 안 함(best-effort). */
export function logRecall(cwd: string, entry: Omit<RecallLogEntry, 'ts'>): void {
  try {
    const p = join(cwd, RECALL_LOG_REL)
    mkdirSync(join(cwd, '.vhk'), { recursive: true })
    // #331: 검색어 원문은 프라이버시 → 기록과 동시에 .vhk/.gitignore 로 자기방어(멱등).
    // 이미 init 된 기존 프로젝트(템플릿 미적용)도 첫 recall 시 자동 보호된다.
    ensureVhkIgnored(cwd, 'recall-log.jsonl')
    const lines = existsSync(p) ? readFileSync(p, 'utf-8').split('\n').filter((l) => l.trim()) : []
    lines.push(JSON.stringify({ ts: new Date().toISOString(), ...entry }))
    atomicWriteFile(p, lines.slice(-RECALL_LOG_MAX).join('\n') + '\n')
  } catch {
    /* best-effort — recall 본 기능 보호 */
  }
}

/** 로그 읽기 — 손상 줄은 skip(부분 파싱 안전). 없으면 빈 배열. */
export function readRecallLog(cwd: string): RecallLogEntry[] {
  const p = join(cwd, RECALL_LOG_REL)
  if (!existsSync(p)) return []
  const out: RecallLogEntry[] = []
  for (const line of readFileSync(p, 'utf-8').split('\n')) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line) as RecallLogEntry)
    } catch {
      /* 손상 줄 skip */
    }
  }
  return out
}
