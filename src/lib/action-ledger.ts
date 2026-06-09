import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWriteFile } from './atomic-write.js'
import { stripBom } from './read-json.js'

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
 * 원자적 쓰기(temp→rename) — 쓰기 도중 kill 에도 원장 손상 방지(evidence-ledger 패턴 답습).
 */
export function appendActionEntry(cwd: string, entry: AiActionEntry): void {
  const p = join(cwd, ACTION_LEDGER_PATH_REL)
  mkdirSync(join(cwd, '.vhk', 'events'), { recursive: true })
  const existing = existsSync(p) ? stripBom(readFileSync(p, 'utf-8')).replace(/\n*$/, '') : ''
  const body = (existing ? existing + '\n' : '') + JSON.stringify(entry) + '\n'
  atomicWriteFile(p, body)
}
