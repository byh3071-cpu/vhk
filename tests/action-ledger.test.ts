import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  appendActionEntry,
  readActionLedger,
  ACTION_LEDGER_PATH_REL,
  type AiActionEntry,
} from '../src/lib/action-ledger.js'
import { runGuarded } from '../src/lib/safety-guard.js'
import { ensureNotHardStopped } from '../src/lib/hard-stop-guard.js'

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-action-ledger-'))
}

const entry = (over: Partial<AiActionEntry> = {}): AiActionEntry => ({
  ts: '2026-06-10T00:00:00.000Z',
  action: 'publish',
  channel: 'cli',
  guard: 'confirm',
  ran: true,
  reason: 'approved',
  ...over,
})

describe('action-ledger — 저수준 append/read (evidence-ledger 미러)', () => {
  it('append 1회 → read 1줄, 6필드 + .vhk/events/ai-actions.jsonl 경로', () => {
    const d = tmp()
    try {
      appendActionEntry(d, entry())
      const e = readActionLedger(d)
      expect(e).toHaveLength(1)
      expect(e[0]).toMatchObject({
        ts: '2026-06-10T00:00:00.000Z',
        action: 'publish',
        channel: 'cli',
        guard: 'confirm',
        ran: true,
        reason: 'approved',
      })
      expect(fs.existsSync(path.join(d, ACTION_LEDGER_PATH_REL))).toBe(true)
      expect(ACTION_LEDGER_PATH_REL.replace(/\\/g, '/')).toBe('.vhk/events/ai-actions.jsonl')
    } finally {
      fs.rmSync(d, { recursive: true, force: true })
    }
  })

  it('append-only — 같은 내용 2번 추가해도 2줄(dedup 없음, 모든 행동 보존)', () => {
    const d = tmp()
    try {
      appendActionEntry(d, entry({ action: 'undo', ran: false, reason: 'declined' }))
      appendActionEntry(d, entry({ action: 'undo', ran: false, reason: 'declined' }))
      expect(readActionLedger(d)).toHaveLength(2)
    } finally {
      fs.rmSync(d, { recursive: true, force: true })
    }
  })

  it('append-only 불변 — 추가가 과거 줄을 바꾸지 않음', () => {
    const d = tmp()
    try {
      appendActionEntry(d, entry({ action: 'deploy', reason: 'first' }))
      appendActionEntry(d, entry({ action: 'migrate', reason: 'second' }))
      const e = readActionLedger(d)
      expect(e[0]).toMatchObject({ action: 'deploy', reason: 'first' })
      expect(e[1]).toMatchObject({ action: 'migrate', reason: 'second' })
    } finally {
      fs.rmSync(d, { recursive: true, force: true })
    }
  })

  it('손상 라인 skip — 읽기가 죽지 않음', () => {
    const d = tmp()
    try {
      const p = path.join(d, ACTION_LEDGER_PATH_REL)
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, '{bad json not parseable\n' + JSON.stringify(entry({ action: 'deploy', reason: 'ok' })) + '\n', 'utf-8')
      const e = readActionLedger(d)
      expect(e).toHaveLength(1)
      expect(e[0].action).toBe('deploy')
    } finally {
      fs.rmSync(d, { recursive: true, force: true })
    }
  })

  it('원장 없으면 빈 배열', () => {
    const d = tmp()
    try {
      expect(readActionLedger(d)).toEqual([])
    } finally {
      fs.rmSync(d, { recursive: true, force: true })
    }
  })
})

describe('action-ledger — runGuarded 자동 기록 (chokepoint hook)', () => {
  it('NL preview 미승인 → 1줄 ran=false reason=preview-no-approve', async () => {
    const d = tmp()
    try {
      const { outcome } = await runGuarded(
        'publish',
        { channel: 'nl', mode: 'standard', approved: false, cwd: d, log: () => {} },
        async () => 'ran'
      )
      expect(outcome.ran).toBe(false)
      expect(outcome.reason).toBe('preview-no-approve')
      const e = readActionLedger(d)
      expect(e).toHaveLength(1)
      expect(e[0]).toMatchObject({ action: 'publish', channel: 'nl', guard: 'preview', ran: false, reason: 'preview-no-approve' })
    } finally {
      fs.rmSync(d, { recursive: true, force: true })
    }
  })

  it('CLI 비대화형 미승인 → reason=no-confirm 기록', async () => {
    const d = tmp()
    try {
      await runGuarded(
        'undo',
        { channel: 'cli', mode: 'standard', isTTY: false, approved: false, cwd: d, log: () => {} },
        async () => 'ran'
      )
      const e = readActionLedger(d)
      expect(e).toHaveLength(1)
      expect(e[0]).toMatchObject({ action: 'undo', channel: 'cli', ran: false, reason: 'no-confirm' })
    } finally {
      fs.rmSync(d, { recursive: true, force: true })
    }
  })

  it('저위험(allow) 작업도 기록 — ran=true guard=allow reason=low-risk', async () => {
    const d = tmp()
    try {
      await runGuarded('status', { channel: 'cli', mode: 'standard', cwd: d, log: () => {} }, async () => 'ok')
      const e = readActionLedger(d)
      expect(e).toHaveLength(1)
      expect(e[0]).toMatchObject({ action: 'status', guard: 'allow', ran: true, reason: 'low-risk' })
    } finally {
      fs.rmSync(d, { recursive: true, force: true })
    }
  })
})

describe('action-ledger — HARD_STOP 차단 기록', () => {
  it('ensureNotHardStopped 차단 → channel/guard=hardstop, ran=false, reason=hard-stop', () => {
    const origCwd = process.cwd()
    const d = tmp()
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      fs.mkdirSync(path.join(d, '.vhk'), { recursive: true })
      fs.writeFileSync(path.join(d, '.vhk', 'HARD_STOP'), 'ts\nblocked\n', 'utf-8')
      process.chdir(d)
      const ok = ensureNotHardStopped('publish')
      expect(ok).toBe(false)
      const e = readActionLedger(d)
      expect(e).toHaveLength(1)
      expect(e[0]).toMatchObject({ action: 'publish', channel: 'hardstop', guard: 'hardstop', ran: false, reason: 'hard-stop' })
    } finally {
      process.chdir(origCwd)
      errSpy.mockRestore()
      process.exitCode = 0
      fs.rmSync(d, { recursive: true, force: true })
    }
  })
})
