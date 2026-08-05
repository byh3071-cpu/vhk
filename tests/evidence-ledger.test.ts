import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildLedgerEntry,
  appendLedgerEntry,
  readLedger,
  LEDGER_PATH_REL,
  ADVISORY_ESCALATION_THRESHOLD,
  formatAdvisoryAge,
  trackAdvisories,
  type LedgerEntry,
} from '../src/lib/evidence-ledger.js'
import { buildReport } from '../src/commands/verify.js'
import type { AiActionEntry } from '../src/lib/action-ledger.js'

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
      generatedAt: 't',
      status: 'PASS',
      sha: COMMIT.sha,
      shortSha: COMMIT.shortSha,
      dirty: false,
      // RFC 0057 트랙②: agent 인자 생략 시 정적 기본값 'unknown'(순수함수 유지).
      agent: 'unknown',
      advisories: [],
    })
  })
  it('commit 없으면(v1/비-git) sha 계열 null', () => {
    const e = buildLedgerEntry(buildReport([], 't', '2026-06-08'), '2.4.3')
    expect(e.sha).toBeNull()
    expect(e.shortSha).toBeNull()
    expect(e.dirty).toBeNull()
  })
})

describe('buildLedgerEntry — agent 필드 (RFC 0057 트랙②)', () => {
  it('agent 인자 지정 시 반영', () => {
    const r = buildReport([], 't', '2026-06-08', COMMIT)
    const e = buildLedgerEntry(r, '2.4.3', 'claude-code')
    expect(e.agent).toBe('claude-code')
  })

  // buildLedgerEntry 는 순수함수(부수효과 0) — 기본값은 detectAgent() 호출이 아니라 정적
  // 리터럴 'unknown' 이어야 한다(실제 감지는 호출부인 verify.ts 가 담당).
  it('agent 인자 생략 시 unknown 기본값', () => {
    const r = buildReport([], 't', '2026-06-08', COMMIT)
    const e = buildLedgerEntry(r, '2.4.3')
    expect(e.agent).toBe('unknown')
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

  it('같은 커밋·상태라도 권고가 사라지면 새 관측을 append', () => {
    const d = tmp()
    appendLedgerEntry(d, { ...mk('a'.repeat(40)), advisories: [{ id: 'lint-gate', message: 'lint 없음' }] })
    expect(appendLedgerEntry(d, { ...mk('a'.repeat(40)), advisories: [] }).appended).toBe(true)
    expect(readLedger(d)).toHaveLength(2)
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

describe('권고 나이·무시 추적', () => {
  const ledger = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
    version: '2.4.3',
    date: '2026-08-01',
    generatedAt: '2026-08-01T00:00:00.000Z',
    status: 'WARN',
    sha: null,
    shortSha: null,
    dirty: null,
    advisories: [{ id: 'lint-gate', message: 'lint 게이트 없음' }],
    ...over,
  })

  const dismiss = (ts: string): AiActionEntry => ({
    ts,
    action: 'advisory-dismiss',
    channel: 'cli',
    guard: 'allow',
    ran: true,
    reason: 'user-dismissed',
    target: 'lint-gate',
  })

  it('최초 발견 시각부터 경과 시간과 현재 무시 여부를 계산', () => {
    const tracked = trackAdvisories(
      [{ id: 'lint-gate', message: 'lint 게이트 없음' }],
      [ledger()],
      [dismiss('2026-08-01T12:00:00.000Z')],
      '2026-08-03T00:00:00.000Z',
    )
    expect(tracked[0]).toMatchObject({
      id: 'lint-gate',
      firstSeenAt: '2026-08-01T00:00:00.000Z',
      ageMs: 2 * 24 * 60 * 60 * 1000,
      dismissCount: 1,
      dismissed: true,
    })
    expect(formatAdvisoryAge(tracked[0].ageMs)).toBe('2일째')
  })

  it('사라졌다 다시 생긴 권고는 새 나이로 시작하고, 누적 무시가 임계면 표현 강화', () => {
    const actions = Array.from({ length: ADVISORY_ESCALATION_THRESHOLD }, (_, index) =>
      dismiss(`2026-08-0${index + 1}T12:00:00.000Z`),
    )
    const tracked = trackAdvisories(
      [{ id: 'lint-gate', message: 'lint 게이트 없음' }],
      [
        ledger(),
        ledger({
          generatedAt: '2026-08-04T00:00:00.000Z',
          date: '2026-08-04',
          status: 'PASS',
          advisories: [],
        }),
      ],
      actions,
      '2026-08-05T00:00:00.000Z',
    )
    expect(tracked[0]).toMatchObject({
      firstSeenAt: '2026-08-05T00:00:00.000Z',
      dismissCount: ADVISORY_ESCALATION_THRESHOLD,
      dismissed: false,
      escalated: true,
    })
  })
})
