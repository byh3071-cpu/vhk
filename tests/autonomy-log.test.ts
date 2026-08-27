import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { removeDirSync } from '../src/lib/fs-remove.js'
import {
  appendAutonomyEntry,
  readAutonomyLog,
  newAutonomyRunId,
  AUTONOMY_LOG_PATH_REL,
  type AutonomyRunEntry,
} from '../src/lib/autonomy-log.js'

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-autonomy-log-'))
}

const entry = (over: Partial<AutonomyRunEntry> = {}): AutonomyRunEntry => ({
  ts: '2026-07-04T00:00:00.000Z',
  runId: 'run-1',
  event: 'start',
  ...over,
})

describe('autonomy-log — 저수준 append/read (action-ledger 패턴 미러)', () => {
  it('append 1회 → read 1줄 + .vhk/events/autonomy-run.jsonl 경로', () => {
    const d = tmp()
    try {
      appendAutonomyEntry(d, entry())
      const e = readAutonomyLog(d)
      expect(e).toHaveLength(1)
      expect(e[0]).toMatchObject({ ts: '2026-07-04T00:00:00.000Z', runId: 'run-1', event: 'start' })
      expect(fs.existsSync(path.join(d, AUTONOMY_LOG_PATH_REL))).toBe(true)
      expect(AUTONOMY_LOG_PATH_REL.replace(/\\/g, '/')).toBe('.vhk/events/autonomy-run.jsonl')
    } finally {
      fs.rmSync(d, { recursive: true, force: true })
    }
  })

  it('append-only — start → complete 2줄, 과거 줄 안 바뀜', () => {
    const d = tmp()
    try {
      appendAutonomyEntry(d, entry({ event: 'start' }))
      appendAutonomyEntry(d, entry({ event: 'complete', ticks: 3, interventions: 0 }))
      const e = readAutonomyLog(d)
      expect(e).toHaveLength(2)
      expect(e[0]).toMatchObject({ event: 'start' })
      expect(e[1]).toMatchObject({ event: 'complete', ticks: 3, interventions: 0 })
    } finally {
      fs.rmSync(d, { recursive: true, force: true })
    }
  })

  it('4이벤트(start/complete/hardstop/blocked) 전부 append 가능', () => {
    const d = tmp()
    try {
      appendAutonomyEntry(d, entry({ event: 'start' }))
      appendAutonomyEntry(d, entry({ event: 'complete' }))
      appendAutonomyEntry(d, entry({ event: 'hardstop', reviewRejected: true }))
      appendAutonomyEntry(d, entry({ event: 'blocked' }))
      const e = readAutonomyLog(d)
      expect(e.map((x) => x.event)).toEqual(['start', 'complete', 'hardstop', 'blocked'])
      expect(e[2].reviewRejected).toBe(true)
    } finally {
      fs.rmSync(d, { recursive: true, force: true })
    }
  })

  it('손상 라인 skip — 읽기가 죽지 않음', () => {
    const d = tmp()
    try {
      const p = path.join(d, AUTONOMY_LOG_PATH_REL)
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, '{bad json not parseable\n' + JSON.stringify(entry({ event: 'complete' })) + '\n', 'utf-8')
      const e = readAutonomyLog(d)
      expect(e).toHaveLength(1)
      expect(e[0].event).toBe('complete')
    } finally {
      fs.rmSync(d, { recursive: true, force: true })
    }
  })

  it('원장 없으면 빈 배열', () => {
    const d = tmp()
    try {
      expect(readAutonomyLog(d)).toEqual([])
    } finally {
      fs.rmSync(d, { recursive: true, force: true })
    }
  })

  it('newAutonomyRunId — 호출마다 다른 UUID 발급', () => {
    const a = newAutonomyRunId()
    const b = newAutonomyRunId()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[0-9a-f-]{36}$/i)
  })

  it('중단된 불완전 꼬리가 다음 정상 기록을 삼키지 않는다', () => {
    const d = tmp()
    try {
      const p = path.join(d, AUTONOMY_LOG_PATH_REL)
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, `${JSON.stringify(entry())}\n{"partial"`, 'utf-8')

      appendAutonomyEntry(d, entry({ event: 'complete' }))

      expect(readAutonomyLog(d).map((item) => item.event)).toEqual(['start', 'complete'])
    } finally {
      removeDirSync(d)
    }
  })
})
