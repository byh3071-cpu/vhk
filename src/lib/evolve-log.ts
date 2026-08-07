import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWriteFile } from './atomic-write.js'
import { stripBom } from './read-json.js'
import type { EvolveQueueItem, TargetLayer } from '../commands/evolve.js'

// #374 (evolve 효과측정 — data-needs-analysis.md/research-backlog.md 2026-06-22 초안의 구체화):
// evolve apply/reject 결정 시점마다 이벤트 1줄을 영속화한다. RULES.md 반영 여부(applied)와
// 기각 사유(rejectReason)를 쌓아 "진화 제안이 실제로 채택되는지 · 왜 기각되는지"를 실측한다.
//
// receipt-log.ts 미러 패턴: .vhk/events/*.jsonl(self-tracked.ts 의 SELF_TRACKED_DIR_PREFIX 가
// 이 디렉터리를 dirty 판정에서 이미 prefix 로 면제 — 추가 코드 없이 자동 안전) + git 추적(비영구
// 백업 아님, 레포 차원 추세 데이터).
//
// ⚠️ gitignore 비대칭 긴장(설계 조사에서 발견, RFC 0057 §6.1 메모리 프라이버시 긴장과 동일 계열):
// suggId(queue.json 의 'e1' 등)·patternId(memory.json 패턴 id) 는 둘 다 **로컬전용·gitignore**
// 파일(.vhk/evolve/queue.json, .vhk/memory.json)에서 나온 조인키다. 이 로그(evolve-log.jsonl)는
// git 추적이라, 새 클론/다른 머신에서는 로그가 가리키는 실체(큐 항목·패턴)가 없을 수 있다.
// → 이 로그는 "이 머신의 결정 히스토리"로만 의미부여한다(조인 실패를 정상으로 간주). draft 원문을
// 로그에 복사해 자기완결적으로 만드는 대안은 원장 비대화 우려로 이번 스코프에서 제외했다(후속 검토).
//
// best-effort — 로그 append 실패는 evolve apply/reject 의 본 판정(RULES.md 반영/큐 상태 전이)을
// 절대 막지 않는다(commands/evolve.ts 에서 try/catch 로 감싼다).

export const EVOLVE_LOG_REL = join('.vhk', 'events', 'evolve-log.jsonl')

export interface EvolveLogEntry {
  /** 생략된 이전 기록은 decision으로 읽는다. */
  event?: 'decision' | 'undo' | 'migration'
  /** 결정 시각 ISO. */
  ts: string
  /** 큐 항목 id('e1' 등) — 로컬전용 queue.json 조인키(위 캐비어트 참고). */
  suggId: string
  /** 근거 패턴 id — 로컬전용 memory.json 조인키(위 캐비어트 참고). */
  patternId: string
  /** 반영 타깃 계층. */
  targetLayer: TargetLayer
  /** true = apply(RULES.md 반영), false = reject(기각). */
  applied: boolean
  /** reject 사유(선택 입력, 비대화형 위치인자). apply 이거나 사유 미입력 reject → null. */
  rejectReason: string | null
  /** 신규 기록의 표시·되돌리기용 선택 필드. 이전 기록에는 없을 수 있다. */
  draft?: string
  rulesBackupPath?: string
}

function evolveDecisionKey(entry: EvolveLogEntry): string | null {
  if (typeof entry.patternId !== 'string' || entry.patternId.length === 0) return null
  return `${entry.patternId}:${entry.targetLayer ?? 'rule'}`
}

export function currentEvolveDecisions(entries: EvolveLogEntry[]): EvolveLogEntry[] {
  const current = new Map<string, EvolveLogEntry>()
  for (const entry of entries) {
    const key = evolveDecisionKey(entry)
    if (!key) continue
    if (entry.event === 'undo') current.delete(key)
    else current.set(key, entry)
  }
  return [...current.values()]
}

export function currentEvolveDecisionKeys(entries: EvolveLogEntry[]): Set<string> {
  const keys = new Set<string>()
  for (const entry of currentEvolveDecisions(entries)) {
    const key = evolveDecisionKey(entry)
    if (key) keys.add(key)
  }
  return keys
}

export function buildEvolveUndoLogEntry(
  item: Pick<EvolveQueueItem, 'id' | 'patternId' | 'targetLayer'>,
  ts: string,
): EvolveLogEntry {
  return {
    event: 'undo',
    ts,
    suggId: item.id,
    patternId: item.patternId,
    targetLayer: item.targetLayer ?? 'rule',
    applied: false,
    rejectReason: null,
  }
}

/** 폐지된 queue.json의 결정을 새 원장으로 옮길 때 쓰는 보존 이벤트. 새 사람 결정으로 집계하지 않는다. */
export function buildEvolveMigrationLogEntry(
  item: Pick<EvolveQueueItem, 'id' | 'patternId' | 'targetLayer' | 'status' | 'draft' | 'rulesBackupPath'>,
  ts: string,
): EvolveLogEntry {
  return {
    event: 'migration',
    ts,
    suggId: item.id,
    patternId: item.patternId,
    targetLayer: item.targetLayer ?? 'rule',
    applied: item.status === 'applied',
    rejectReason: null,
    draft: item.draft,
    ...(item.rulesBackupPath ? { rulesBackupPath: item.rulesBackupPath } : {}),
  }
}

/**
 * 결정(apply/reject) → 로그 엔트리(순수 함수, fs/시간 부수효과 0). ts 는 호출부가 주입(결정성 확보,
 * receipt-log.ts 의 buildReceiptLogEntry 와 동일 철학 — Date.now() 를 내부에서 부르지 않는다).
 * apply(applied=true) 는 rejectReason 인자를 줘도 항상 null 로 강제(의미상 apply 에 기각사유 없음).
 */
export function buildEvolveLogEntry(
  item: Pick<EvolveQueueItem, 'id' | 'patternId' | 'targetLayer'>,
  applied: boolean,
  ts: string,
  rejectReason: string | null = null
): EvolveLogEntry {
  return {
    ts,
    suggId: item.id,
    patternId: item.patternId,
    targetLayer: item.targetLayer ?? 'rule',
    applied,
    rejectReason: applied ? null : rejectReason,
  }
}

/**
 * .vhk/events/evolve-log.jsonl 파싱(JSONL). 파일 없음 → []. 손상 라인 skip. BOM-safe.
 * 최소 스키마(ts:string, suggId:string) 검증 — 형태 안 맞는 줄 무시.
 */
export function readEvolveLog(cwd: string): EvolveLogEntry[] {
  const p = join(cwd, EVOLVE_LOG_REL)
  if (!existsSync(p)) return []
  const out: EvolveLogEntry[] = []
  for (const line of stripBom(readFileSync(p, 'utf-8')).split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    try {
      const e = JSON.parse(t) as EvolveLogEntry
      if (e && typeof e.ts === 'string' && typeof e.suggId === 'string') out.push(e)
    } catch {
      /* 손상 라인 skip — 원장 한 줄 깨졌다고 죽지 않음 */
    }
  }
  return out
}

/**
 * 측정 엔트리 1개 append(append-only). 원자적 쓰기(temp→rename — 쓰기 중 kill 에도 손상 방지).
 */
export function appendEvolveLog(cwd: string, entry: EvolveLogEntry): void {
  appendEvolveLogEntries(cwd, [entry])
}

/** 여러 이벤트를 한 번의 원자 치환으로 추가한다. 빈 배열은 파일을 만들지 않는다. */
export function appendEvolveLogEntries(cwd: string, entries: EvolveLogEntry[]): void {
  if (entries.length === 0) return
  const p = join(cwd, EVOLVE_LOG_REL)
  mkdirSync(join(cwd, '.vhk', 'events'), { recursive: true })
  const existing = existsSync(p) ? stripBom(readFileSync(p, 'utf-8')).replace(/\n*$/, '') : ''
  const appended = entries.map((entry) => JSON.stringify(entry)).join('\n')
  const body = (existing ? existing + '\n' : '') + appended + '\n'
  atomicWriteFile(p, body)
}
