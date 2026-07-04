import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWriteFile } from './atomic-write.js'
import { stripBom } from './read-json.js'

// #374 (evolve 효과측정): `vhk check` 실행마다 RULES.md 위반 총계 스냅샷을 영속화한다. evolve
// apply 전후로 이 로그를 비교하면 "룰을 반영한 뒤 실제로 위반이 줄었는지"를 실측할 수 있다
// (계측 없이는 "적용은 되는데 효과가 있는지" 자체가 미지수였다 — 설계 조사에서 확인).
//
// receipt-log.ts 미러 패턴: .vhk/events/*.jsonl(self-tracked.ts 가 dirty 판정에서 이미 prefix
// 로 면제) + git 추적(레포 차원 추세 데이터). check-log 는 사용자가 명시적으로 `vhk check` 를
// 실행할 때만 쌓인다 — verify/receipt 등 다른 자동 게이트에는 의도적으로 연동하지 않는다(verify
// 스코프 침범 방지, 모듈 결합 최소화).
//
// best-effort — 로그 append 실패는 check 본 판정(콘솔 출력·exitCode)을 절대 막지 않는다
// (commands/check.ts 에서 try/catch 로 감싼다).

export const CHECK_LOG_REL = join('.vhk', 'events', 'check-log.jsonl')

export interface CheckLogEntry {
  /** 실행 시각 ISO. */
  ts: string
  /** 자동 검증 가능 규칙 총 개수. */
  totalRules: number
  /** 위반 총 건수(error+warning+info 합산). */
  total: number
  /** severity=error 건수. */
  errors: number
  /** severity=warning 건수. */
  warnings: number
}

/** checkRules 의 위반 요약(computeCheckSummary 반환값의 부분집합) → 로그 엔트리(순수 함수). */
export function buildCheckLogEntry(
  summary: { totalRules: number; violations: unknown[]; errors: number; warnings: number },
  ts: string
): CheckLogEntry {
  return {
    ts,
    totalRules: summary.totalRules,
    total: summary.violations.length,
    errors: summary.errors,
    warnings: summary.warnings,
  }
}

/**
 * .vhk/events/check-log.jsonl 파싱(JSONL). 파일 없음 → []. 손상 라인 skip. BOM-safe.
 * 최소 스키마(ts:string, total:number) 검증 — 형태 안 맞는 줄 무시.
 */
export function readCheckLog(cwd: string): CheckLogEntry[] {
  const p = join(cwd, CHECK_LOG_REL)
  if (!existsSync(p)) return []
  const out: CheckLogEntry[] = []
  for (const line of stripBom(readFileSync(p, 'utf-8')).split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    try {
      const e = JSON.parse(t) as CheckLogEntry
      if (e && typeof e.ts === 'string' && typeof e.total === 'number') out.push(e)
    } catch {
      /* 손상 라인 skip — 원장 한 줄 깨졌다고 죽지 않음 */
    }
  }
  return out
}

/**
 * 측정 엔트리 1개 append(append-only). 원자적 쓰기(temp→rename — 쓰기 중 kill 에도 손상 방지).
 */
export function appendCheckLog(cwd: string, entry: CheckLogEntry): void {
  const p = join(cwd, CHECK_LOG_REL)
  mkdirSync(join(cwd, '.vhk', 'events'), { recursive: true })
  const existing = existsSync(p) ? stripBom(readFileSync(p, 'utf-8')).replace(/\n*$/, '') : ''
  const body = (existing ? existing + '\n' : '') + JSON.stringify(entry) + '\n'
  atomicWriteFile(p, body)
}
