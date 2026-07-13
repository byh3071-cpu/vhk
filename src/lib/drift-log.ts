// RFC 0062 — 드리프트 검사 이벤트 원장. warn 모드의 계측면: "드리프트 신규 발생률"이
// 쌓여야 fail 승격/포기(트립와이어)를 measure-first 로 판정한다. secure-scan-log 와 동일 패턴.
import fs from 'node:fs'
import path from 'node:path'

export const DRIFT_LOG_REL = path.join('.vhk', 'events', 'drift-log.jsonl')

export interface DriftLogEntry {
  numeric: number
  crossref: number
  state: number
}

export function appendDriftLog(cwd: string, entry: DriftLogEntry): void {
  const logPath = path.join(cwd, DRIFT_LOG_REL)
  fs.mkdirSync(path.dirname(logPath), { recursive: true })
  fs.appendFileSync(logPath, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n', 'utf-8')
}
