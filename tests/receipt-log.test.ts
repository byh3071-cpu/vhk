import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildReceipt, type ReceiptEvidence, type ReceiptMeta } from '../src/lib/receipt.js'
import {
  buildReceiptLogEntry,
  readReceiptLog,
  appendReceiptLog,
  RECEIPT_LOG_REL,
} from '../src/lib/receipt-log.js'

// N7: vhk receipt 발행마다 측정 엔트리를 .vhk/events/receipt-log.jsonl 에 append.
// diff-cover-log 패턴 미러 — 측정치만(사적 경로·reasons 원문 0), .vhk/events/*.jsonl
// 이라 self-tracked 제외 자동 상속. 추세(decision 분포)는 N6 stats --trend 가 소비.

function evidence(over: Partial<ReceiptEvidence> = {}): ReceiptEvidence {
  return {
    gates: { red: false, status: 'PASS', failedGateIds: [], hasSoftWarning: false },
    dirty: false,
    stale: false,
    staleKnown: true,
    diffCover: { measured: true, totalAdded: 10, totalUncovered: 2, ratio: 0.8 },
    ...over,
  }
}

function meta(over: Partial<ReceiptMeta> = {}): ReceiptMeta {
  return {
    generatedAt: '2026-07-01T12:00:00.000Z',
    date: '2026-07-01',
    slug: 'caution',
    headSha: 'abcdef1234567890',
    baseSha: 'abcdef1234567890',
    ...over,
  }
}

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-rlog-'))
}

describe('buildReceiptLogEntry', () => {
  it('영수증의 decision·SHA·플래그를 측정 엔트리로 매핑', () => {
    const r = buildReceipt(evidence(), meta())
    const e = buildReceiptLogEntry(r)
    expect(e.ts).toBe('2026-07-01T12:00:00.000Z')
    expect(e.decision).toBe(r.decision)
    expect(e.sha).toBe('abcdef1234567890')
    expect(e.shortSha).toBe('abcdef1')
    expect(e.red).toBe(false)
    expect(e.dirty).toBe(false)
    expect(e.gateStatus).toBe('PASS')
  })

  it('staleKnown=false → stale 필드 null (모름을 false 로 위장 안 함)', () => {
    const r = buildReceipt(evidence({ staleKnown: false, stale: false }), meta({ baseSha: null }))
    const e = buildReceiptLogEntry(r)
    expect(e.stale).toBeNull()
  })

  it('diffCover 미측정 → ratio·uncovered null', () => {
    const r = buildReceipt(
      evidence({ diffCover: { measured: false, totalAdded: 0, totalUncovered: 0, ratio: 1 } }),
      meta()
    )
    const e = buildReceiptLogEntry(r)
    expect(e.diffCoverRatio).toBeNull()
    expect(e.diffCoverUncovered).toBeNull()
  })

  it('mission 부재 → forbiddenHits·scopeWarnings null', () => {
    const r = buildReceipt(evidence(), meta())
    const e = buildReceiptLogEntry(r)
    expect(e.forbiddenHits).toBeNull()
    expect(e.scopeWarnings).toBeNull()
  })

  it('mission 있으면 forbiddenHits·scopeWarnings 수치 기록', () => {
    const r = buildReceipt(
      evidence({ intent: { missionKnown: true, forbiddenHits: 1, scopeWarnings: 2 } }),
      meta()
    )
    const e = buildReceiptLogEntry(r)
    expect(e.forbiddenHits).toBe(1)
    expect(e.scopeWarnings).toBe(2)
  })

  it('측정치만 — reasons·honesty 원문 안 남김', () => {
    const r = buildReceipt(evidence(), meta())
    const e = buildReceiptLogEntry(r) as Record<string, unknown>
    expect(e.reasons).toBeUndefined()
    expect(JSON.stringify(e)).not.toContain('honesty')
  })
})

describe('append/readReceiptLog', () => {
  it('append 후 read 라운드트립', () => {
    const d = tmp()
    const r = buildReceipt(evidence(), meta())
    appendReceiptLog(d, buildReceiptLogEntry(r))
    const log = readReceiptLog(d)
    expect(log).toHaveLength(1)
    expect(log[0].decision).toBe(r.decision)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('파일 없으면 []', () => {
    const d = tmp()
    expect(readReceiptLog(d)).toEqual([])
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('손상 라인 skip (no throw)', () => {
    const d = tmp()
    fs.mkdirSync(path.join(d, '.vhk', 'events'), { recursive: true })
    const r = buildReceipt(evidence(), meta())
    fs.writeFileSync(
      path.join(d, RECEIPT_LOG_REL),
      '{ bad json <<<\n' + JSON.stringify(buildReceiptLogEntry(r)) + '\n',
      'utf-8'
    )
    expect(() => readReceiptLog(d)).not.toThrow()
    expect(readReceiptLog(d)).toHaveLength(1)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('append-only — 두 번 append 시 2줄', () => {
    const d = tmp()
    const r = buildReceipt(evidence(), meta())
    appendReceiptLog(d, buildReceiptLogEntry(r))
    appendReceiptLog(d, buildReceiptLogEntry(r))
    expect(readReceiptLog(d)).toHaveLength(2)
    fs.rmSync(d, { recursive: true, force: true })
  })
})
