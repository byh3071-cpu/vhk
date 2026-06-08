import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildLedgerEntry,
  appendLedgerEntry,
  readLedger,
  LEDGER_PATH_REL,
  type LedgerEntry,
} from '../src/lib/evidence-ledger.js'
import { buildReport } from '../src/commands/verify.js'

const COMMIT = { sha: 'a'.repeat(40), shortSha: 'aaaaaaa', dirty: false }

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-ledger-'))
}

describe('buildLedgerEntry', () => {
  it('commit 있으면 version/date/status/sha 기록', () => {
    const r = buildReport([], 't', '2026-06-08', COMMIT)
    const e = buildLedgerEntry(r, '2.4.3')
    expect(e).toEqual({
      version: '2.4.3',
      date: '2026-06-08',
      status: 'PASS',
      sha: COMMIT.sha,
      shortSha: COMMIT.shortSha,
      dirty: false,
    })
  })
  it('commit 없으면(v1/비-git) sha 계열 null', () => {
    const e = buildLedgerEntry(buildReport([], 't', '2026-06-08'), '2.4.3')
    expect(e.sha).toBeNull()
    expect(e.shortSha).toBeNull()
    expect(e.dirty).toBeNull()
  })
})

describe('appendLedgerEntry / readLedger', () => {
  const mk = (sha: string): LedgerEntry => ({ version: '2.4.3', date: 'd', status: 'PASS', sha, shortSha: sha.slice(0, 7), dirty: false })

  it('빈 원장 → append 시 .vhk/ledger.jsonl 1줄 생성', () => {
    const d = tmp()
    expect(appendLedgerEntry(d, mk('a'.repeat(40))).appended).toBe(true)
    expect(fs.existsSync(path.join(d, LEDGER_PATH_REL))).toBe(true)
    expect(readLedger(d)).toHaveLength(1)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('직전과 동일(version·sha·status·dirty) → append 안 함(중복 churn 0)', () => {
    const d = tmp()
    appendLedgerEntry(d, mk('a'.repeat(40)))
    expect(appendLedgerEntry(d, mk('a'.repeat(40))).appended).toBe(false)
    expect(readLedger(d)).toHaveLength(1)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('sha 다르면 새 줄 append (코드 바뀜)', () => {
    const d = tmp()
    appendLedgerEntry(d, mk('a'.repeat(40)))
    appendLedgerEntry(d, mk('b'.repeat(40)))
    const led = readLedger(d)
    expect(led).toHaveLength(2)
    expect(led[1].sha).toBe('b'.repeat(40))
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('손상 라인은 관용적으로 skip', () => {
    const d = tmp()
    fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
    fs.writeFileSync(path.join(d, LEDGER_PATH_REL), '{bad json\n' + JSON.stringify(mk('c'.repeat(40))) + '\n')
    expect(readLedger(d)).toHaveLength(1)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('원장은 .vhk/ledger.jsonl (reports/ 아래 아님 → git 추적 가능)', () => {
    expect(LEDGER_PATH_REL).toContain('.vhk')
    expect(LEDGER_PATH_REL).toContain('ledger.jsonl')
    expect(LEDGER_PATH_REL).not.toContain('reports')
  })
})
