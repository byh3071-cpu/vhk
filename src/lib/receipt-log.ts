import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWriteFile } from './atomic-write.js'
import { stripBom } from './read-json.js'
import type { Receipt, ReceiptDecision } from './receipt.js'
import type { ReportStatus } from '../commands/verify.js'

// N7 (RFC0056 측정 토대): vhk receipt 발행마다 decision·기계증거 요약을 영속화.
// 콘솔 휘발 → "거짓완료 판정 분포" 추세 분석 토대(N6 vhk stats --trend 가 소비, #374 evolve
// 효과측정이 applied 시점과 조인).
//
// 위치(.vhk/events/receipt-log.jsonl): diff-cover-log·evidence-ledger·action-ledger 와 동일한
//   "추적되는 증거 원장" 패턴. self-tracked.ts 가 .vhk/events/*.jsonl prefix 를 dirty 판정에서
//   제외하므로(자기참조 봉인, #315 동형), receipt 가 스스로 append 해도 다음 receipt 의 dirty
//   판정을 오염시키지 않는다. recall-log 처럼 gitignore 하지 않는 이유 — 측정치(decision·SHA·
//   플래그·커버율)만 담고 사적 경로/reasons 원문은 안 남긴다. 레포 차원 영속 가치(추세)가 있어 추적.
//
// best-effort: 로그 실패는 receipt 본 판정/출력을 절대 막지 않는다(commands/receipt.ts 에서 try/catch).

export const RECEIPT_LOG_REL = join('.vhk', 'events', 'receipt-log.jsonl')

export interface ReceiptLogEntry {
  /** 발행 시각 ISO(receipt.generatedAt). */
  ts: string
  /** 기계 판정. */
  decision: ReceiptDecision
  /** 발행 시점 HEAD 전체 SHA(비-git/커밋0 → null). */
  sha: string | null
  /** 사람용 짧은 SHA(7자). */
  shortSha: string | null
  /** 게이트 red(실종료코드 fail). */
  red: boolean
  /** verify 종합 상태(PASS/WARN/FAIL). */
  gateStatus: ReportStatus
  /** git dirty(자기파일 제외 후). */
  dirty: boolean
  /** stale. staleKnown=false(기준선 미기록)면 null — 모름을 false 로 위장하지 않음. */
  stale: boolean | null
  /** 변경라인 커버율. diff-cover 미측정 → null. */
  diffCoverRatio: number | null
  /** 미검증 추가라인 수. 미측정 → null. 라인 원문은 안 남김. */
  diffCoverUncovered: number | null
  /** forbidden 위반 파일 수. mission 부재 → null. */
  forbiddenHits: number | null
  /** scope 밖 변경 파일 수. mission 부재 → null. */
  scopeWarnings: number | null
}

/**
 * Receipt → 측정 로그 엔트리(순수, fs/시간 부수효과 0). ts 는 receipt.generatedAt 에서 따옴.
 * 측정치만 추출 — reasons/honesty 등 원문은 의도적으로 제외(원장 비대화·사적정보 0).
 */
export function buildReceiptLogEntry(r: Receipt): ReceiptLogEntry {
  const e = r.evidence
  const intentKnown = e.intent?.missionKnown === true
  return {
    ts: r.generatedAt,
    decision: r.decision,
    sha: r.head.sha,
    shortSha: r.head.shortSha,
    red: e.gates.red,
    gateStatus: e.gates.status,
    dirty: e.dirty,
    stale: e.staleKnown ? e.stale : null,
    diffCoverRatio: e.diffCover.measured ? e.diffCover.ratio : null,
    diffCoverUncovered: e.diffCover.measured ? e.diffCover.totalUncovered : null,
    forbiddenHits: intentKnown ? e.intent!.forbiddenHits : null,
    scopeWarnings: intentKnown ? e.intent!.scopeWarnings : null,
  }
}

/**
 * .vhk/events/receipt-log.jsonl 파싱(JSONL). 파일 없음 → []. 손상 라인 skip. BOM-safe.
 * 최소 스키마(decision:string, ts:string) 검증 — 형태 안 맞는 줄 무시.
 */
export function readReceiptLog(cwd: string): ReceiptLogEntry[] {
  const p = join(cwd, RECEIPT_LOG_REL)
  if (!existsSync(p)) return []
  const out: ReceiptLogEntry[] = []
  for (const line of stripBom(readFileSync(p, 'utf-8')).split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    try {
      const e = JSON.parse(t) as ReceiptLogEntry
      if (e && typeof e.decision === 'string' && typeof e.ts === 'string') out.push(e)
    } catch {
      /* 손상 라인 skip — 원장 한 줄 깨졌다고 죽지 않음 */
    }
  }
  return out
}

/**
 * 측정 엔트리 1개 append(append-only). 원자적 쓰기(temp→rename — 쓰기 중 kill 에도 손상 방지).
 */
export function appendReceiptLog(cwd: string, entry: ReceiptLogEntry): void {
  const p = join(cwd, RECEIPT_LOG_REL)
  mkdirSync(join(cwd, '.vhk', 'events'), { recursive: true })
  const existing = existsSync(p) ? stripBom(readFileSync(p, 'utf-8')).replace(/\n*$/, '') : ''
  const body = (existing ? existing + '\n' : '') + JSON.stringify(entry) + '\n'
  atomicWriteFile(p, body)
}
