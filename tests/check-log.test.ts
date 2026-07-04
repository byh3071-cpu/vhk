import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildCheckLogEntry,
  readCheckLog,
  appendCheckLog,
  CHECK_LOG_REL,
  type CheckLogEntry,
} from '../src/lib/check-log.js'

// #374 (evolve 효과측정): `vhk check` 실행마다 위반 총계 스냅샷을 .vhk/events/check-log.jsonl 에 append.
// receipt-log.ts 패턴 미러.

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-clog-'))
}

describe('buildCheckLogEntry', () => {
  it('summary → 로그 엔트리 매핑', () => {
    const e = buildCheckLogEntry(
      { totalRules: 5, violations: [{ ruleId: 'r1', severity: 'error', message: 'x' }], errors: 1, warnings: 0 },
      '2026-07-04T00:00:00.000Z'
    )
    expect(e).toEqual({
      ts: '2026-07-04T00:00:00.000Z',
      totalRules: 5,
      total: 1,
      errors: 1,
      warnings: 0,
    })
  })

  it('위반 0건 → total 0', () => {
    const e = buildCheckLogEntry({ totalRules: 3, violations: [], errors: 0, warnings: 0 }, 't')
    expect(e.total).toBe(0)
  })

  it('결정적 — 같은 입력 → 같은 출력', () => {
    const summary = { totalRules: 2, violations: [], errors: 0, warnings: 0 }
    expect(buildCheckLogEntry(summary, 't')).toEqual(buildCheckLogEntry(summary, 't'))
  })
})

describe('append/readCheckLog', () => {
  it('append 후 read 라운드트립', () => {
    const d = tmp()
    appendCheckLog(d, buildCheckLogEntry({ totalRules: 4, violations: [], errors: 0, warnings: 0 }, 't1'))
    const log = readCheckLog(d)
    expect(log).toHaveLength(1)
    expect(log[0].totalRules).toBe(4)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('파일 없으면 []', () => {
    const d = tmp()
    expect(readCheckLog(d)).toEqual([])
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('손상 라인 skip (no throw)', () => {
    const d = tmp()
    fs.mkdirSync(path.join(d, '.vhk', 'events'), { recursive: true })
    const good = buildCheckLogEntry({ totalRules: 1, violations: [], errors: 0, warnings: 0 }, 't1')
    fs.writeFileSync(path.join(d, CHECK_LOG_REL), '{ bad json <<<\n' + JSON.stringify(good) + '\n', 'utf-8')
    expect(() => readCheckLog(d)).not.toThrow()
    expect(readCheckLog(d)).toHaveLength(1)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('BOM 있는 파일도 정상 파싱', () => {
    const d = tmp()
    fs.mkdirSync(path.join(d, '.vhk', 'events'), { recursive: true })
    const good = buildCheckLogEntry({ totalRules: 1, violations: [], errors: 0, warnings: 0 }, 't1')
    fs.writeFileSync(path.join(d, CHECK_LOG_REL), '﻿' + JSON.stringify(good) + '\n', 'utf-8')
    expect(readCheckLog(d)).toHaveLength(1)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('append-only — 두 번 append 시 2줄', () => {
    const d = tmp()
    appendCheckLog(d, buildCheckLogEntry({ totalRules: 1, violations: [], errors: 0, warnings: 0 }, 't1'))
    appendCheckLog(d, buildCheckLogEntry({ totalRules: 1, violations: [], errors: 1, warnings: 0 }, 't2'))
    const log: CheckLogEntry[] = readCheckLog(d)
    expect(log).toHaveLength(2)
    expect(log[1].errors).toBe(1)
    fs.rmSync(d, { recursive: true, force: true })
  })
})
