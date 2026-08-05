import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildEvolveLogEntry,
  buildEvolveUndoLogEntry,
  currentEvolveDecisionKeys,
  currentEvolveDecisions,
  readEvolveLog,
  appendEvolveLog,
  EVOLVE_LOG_REL,
  type EvolveLogEntry,
} from '../src/lib/evolve-log.js'
import type { EvolveQueueItem } from '../src/commands/evolve.js'

// #374 (evolve 효과측정): apply/reject 결정 이벤트를 .vhk/events/evolve-log.jsonl 에 append.
// receipt-log.ts 패턴 미러 — 순수 빌더 + BOM-safe/손상라인-skip 리더 + 원자쓰기 어펜더.

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-elog-'))
}

function item(over: Partial<EvolveQueueItem> = {}): EvolveQueueItem {
  return {
    id: 'e1',
    patternId: 'p1',
    kind: 'rule',
    targetLayer: 'rule',
    status: 'pending',
    draft: '- 초안',
    dedupeKey: 'p1:rule',
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('buildEvolveLogEntry', () => {
  it('apply → applied:true, rejectReason:null', () => {
    const e = buildEvolveLogEntry(item(), true, '2026-07-04T00:00:00.000Z')
    expect(e).toEqual({
      ts: '2026-07-04T00:00:00.000Z',
      suggId: 'e1',
      patternId: 'p1',
      targetLayer: 'rule',
      applied: true,
      rejectReason: null,
    })
  })

  it('reject + 사유 있음 → applied:false, rejectReason 기록', () => {
    const e = buildEvolveLogEntry(item(), false, '2026-07-04T00:00:00.000Z', '문구가 부정확함')
    expect(e.applied).toBe(false)
    expect(e.rejectReason).toBe('문구가 부정확함')
  })

  it('reject + 사유 없음 → rejectReason null', () => {
    const e = buildEvolveLogEntry(item(), false, '2026-07-04T00:00:00.000Z')
    expect(e.rejectReason).toBeNull()
  })

  it('apply 시 사유 인자를 줘도 무시(rejectReason 항상 null)', () => {
    const e = buildEvolveLogEntry(item(), true, '2026-07-04T00:00:00.000Z', '이 사유는 무시돼야 함')
    expect(e.rejectReason).toBeNull()
  })

  it('targetLayer 미지정 항목(v1 호환) → rule 로 폴백', () => {
    const legacy = item({ targetLayer: undefined })
    const e = buildEvolveLogEntry(legacy, true, '2026-07-04T00:00:00.000Z')
    expect(e.targetLayer).toBe('rule')
  })

  it('결정적 — 같은 입력 → 같은 출력', () => {
    const a = buildEvolveLogEntry(item(), false, 't', '사유')
    const b = buildEvolveLogEntry(item(), false, 't', '사유')
    expect(a).toEqual(b)
  })
})

describe('현재 진화 결정 계산', () => {
  it('이전 형식 결정도 읽고 undo가 나오면 다시 미판정으로 돌린다', () => {
    const applied = buildEvolveLogEntry(item(), true, 't1')
    const undone = buildEvolveUndoLogEntry(item(), 't2')

    expect(currentEvolveDecisionKeys([applied])).toEqual(new Set(['p1:rule']))
    expect(currentEvolveDecisionKeys([applied, undone])).toEqual(new Set())
    expect(currentEvolveDecisions([applied, undone])).toEqual([])
  })
})

describe('append/readEvolveLog', () => {
  it('append 후 read 라운드트립', () => {
    const d = tmp()
    appendEvolveLog(d, buildEvolveLogEntry(item(), true, 't1'))
    const log = readEvolveLog(d)
    expect(log).toHaveLength(1)
    expect(log[0].suggId).toBe('e1')
    expect(log[0].applied).toBe(true)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('파일 없으면 []', () => {
    const d = tmp()
    expect(readEvolveLog(d)).toEqual([])
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('손상 라인 skip (no throw)', () => {
    const d = tmp()
    fs.mkdirSync(path.join(d, '.vhk', 'events'), { recursive: true })
    const good = buildEvolveLogEntry(item(), true, 't1')
    fs.writeFileSync(
      path.join(d, EVOLVE_LOG_REL),
      '{ bad json <<<\n' + JSON.stringify(good) + '\n',
      'utf-8'
    )
    expect(() => readEvolveLog(d)).not.toThrow()
    expect(readEvolveLog(d)).toHaveLength(1)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('BOM 있는 파일도 정상 파싱', () => {
    const d = tmp()
    fs.mkdirSync(path.join(d, '.vhk', 'events'), { recursive: true })
    const good = buildEvolveLogEntry(item(), true, 't1')
    fs.writeFileSync(path.join(d, EVOLVE_LOG_REL), '﻿' + JSON.stringify(good) + '\n', 'utf-8')
    expect(readEvolveLog(d)).toHaveLength(1)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('append-only — 두 번 append 시 2줄', () => {
    const d = tmp()
    appendEvolveLog(d, buildEvolveLogEntry(item(), true, 't1'))
    appendEvolveLog(d, buildEvolveLogEntry(item({ id: 'e2' }), false, 't2', '사유'))
    const log: EvolveLogEntry[] = readEvolveLog(d)
    expect(log).toHaveLength(2)
    expect(log[1].suggId).toBe('e2')
    expect(log[1].rejectReason).toBe('사유')
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('하위호환 — suggId/ts 형태만 맞으면 신규 필드 없는 구버전 줄도 안전 파싱', () => {
    const d = tmp()
    fs.mkdirSync(path.join(d, '.vhk', 'events'), { recursive: true })
    fs.writeFileSync(
      path.join(d, EVOLVE_LOG_REL),
      JSON.stringify({ ts: 't0', suggId: 'e0' }) + '\n',
      'utf-8'
    )
    expect(() => readEvolveLog(d)).not.toThrow()
    expect(readEvolveLog(d)).toHaveLength(1)
    fs.rmSync(d, { recursive: true, force: true })
  })
})
