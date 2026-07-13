// #457 — secure 스캔 이벤트 원장. report-mode 의 계측면:
// "발행물 스캔이 얼마나 돌고 뭘 잡았나"를 쌓아야 차단 전환(Phase 4 판정)이
// measure-first 로 가능하다. receipt-log 와 같은 .vhk/events/*.jsonl append-only 패턴.
import fs from 'node:fs'
import path from 'node:path'

export const SECURE_SCAN_LOG_REL = path.join('.vhk', 'events', 'secure-scan-log.jsonl')

export interface SecureScanLogEntry {
  /** 'paths' = 명시 경로(발행물 초안) 스캔. 전체 스캔 로깅은 후속(v1 은 발행 경로만 계측). */
  mode: 'paths'
  paths: string[]
  /** no-op/에러 스캔과 clean 스캔을 원장에서 구별(적대검증 중대-2 — 판정 데이터의 정직성). */
  scannedFiles: number
  errorCount: number
  critical: number
  high: number
  medium: number
  info: number
}

export function appendSecureScanLog(cwd: string, entry: SecureScanLogEntry): void {
  const logPath = path.join(cwd, SECURE_SCAN_LOG_REL)
  fs.mkdirSync(path.dirname(logPath), { recursive: true })
  fs.appendFileSync(logPath, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n', 'utf-8')
}
