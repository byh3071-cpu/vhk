import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  appendMorningObservation,
  normalizeMorningObservation,
  readAutonomyLog,
  readMorningObservations,
  selectDailyObservations,
  AUTONOMY_LOG_PATH_REL,
  type MorningObservation,
} from '../src/lib/autonomy-log.js'

// Goal 111-T1: morning 관측이 같은 JSONL 을 쓰되 런 이벤트 집계를 오염시키지 않는 계약.

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vhk-morning-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function writeLines(lines: string[]): void {
  const p = join(dir, AUTONOMY_LOG_PATH_REL)
  mkdirSync(join(dir, '.vhk', 'events'), { recursive: true })
  writeFileSync(p, lines.join('\n') + '\n', 'utf-8')
}

const RUN_LINE = JSON.stringify({ ts: '2026-08-12T00:00:00.000Z', runId: 'r1', event: 'start' })
const MORNING_LINE = JSON.stringify({
  kind: 'morning',
  ts: '2026-08-12T00:00:00.000Z',
  date: '2026-08-12',
  trackingMin: 5,
})

describe('분리 파싱 — RunEvent 와 MorningObservation 이 서로를 오염시키지 않음', () => {
  it('readAutonomyLog 는 morning 라인을 반환하지 않는다', () => {
    writeLines([RUN_LINE, MORNING_LINE])
    const runs = readAutonomyLog(dir)
    expect(runs).toHaveLength(1)
    expect(runs[0]!.event).toBe('start')
  })

  it('readMorningObservations 는 런 라인을 반환하지 않는다', () => {
    writeLines([RUN_LINE, MORNING_LINE])
    const obs = readMorningObservations(dir)
    expect(obs).toHaveLength(1)
    expect(obs[0]!.trackingMin).toBe(5)
  })

  it('손상·미지 라인은 양쪽 모두 skip', () => {
    writeLines(['not-json', '{"foo":1}', RUN_LINE, MORNING_LINE])
    expect(readAutonomyLog(dir)).toHaveLength(1)
    expect(readMorningObservations(dir)).toHaveLength(1)
  })
})

describe('normalizeMorningObservation — 검증 규칙', () => {
  const base = { kind: 'morning', ts: '2026-08-12T00:00:00.000Z', date: '2026-08-12' }

  it('0 ≤ unchecked ≤ total 위반은 무효', () => {
    expect(
      normalizeMorningObservation({ ...base, uncheckedApprovals: 3, approvalDecisionsTotal: 2 }),
    ).toBeNull()
    expect(
      normalizeMorningObservation({ ...base, uncheckedApprovals: 2, approvalDecisionsTotal: 2 }),
    ).not.toBeNull()
  })

  it('음수·비정수·경로형 날짜는 무효', () => {
    expect(normalizeMorningObservation({ ...base, trackingMin: -1 })).toBeNull()
    expect(normalizeMorningObservation({ ...base, trackingMin: 1.5 })).toBeNull()
    expect(normalizeMorningObservation({ ...base, date: '../../etc' })).toBeNull()
  })

  it('값이 하나도 없어도 유효 — 리포트 실행 자체가 응답률 분모', () => {
    expect(normalizeMorningObservation(base)).not.toBeNull()
  })

  it('하나만 입력된 승인 필드는 기록은 유효 (비율 계산 제외는 집계 책임)', () => {
    expect(normalizeMorningObservation({ ...base, uncheckedApprovals: 1 })).not.toBeNull()
  })
})

describe('appendMorningObservation', () => {
  it('유효 관측은 기록되고 다시 읽힌다', () => {
    const obs: MorningObservation = {
      kind: 'morning',
      ts: '2026-08-12T00:00:00.000Z',
      date: '2026-08-12',
      uncheckedApprovals: 1,
      approvalDecisionsTotal: 3,
    }
    expect(appendMorningObservation(dir, obs)).toBe(true)
    expect(readMorningObservations(dir)).toHaveLength(1)
    expect(readAutonomyLog(dir)).toHaveLength(0)
  })

  it('무효 관측은 기록 자체를 거부', () => {
    const bad = {
      kind: 'morning',
      ts: '2026-08-12T00:00:00.000Z',
      date: '2026-08-12',
      uncheckedApprovals: 5,
      approvalDecisionsTotal: 1,
    } as MorningObservation
    expect(appendMorningObservation(dir, bad)).toBe(false)
    expect(readMorningObservations(dir)).toHaveLength(0)
  })
})

describe('selectDailyObservations — 값 있는 마지막 관측 우선', () => {
  it('같은 날짜에 값 있는 관측 둘이면 뒤엣것 채택', () => {
    const a: MorningObservation = { kind: 'morning', ts: '2026-08-12T00:00:00.000Z', date: '2026-08-12', trackingMin: 5 }
    const b: MorningObservation = { kind: 'morning', ts: '2026-08-12T01:00:00.000Z', date: '2026-08-12', trackingMin: 9 }
    const sel = selectDailyObservations([a, b])
    expect(sel.size).toBe(1)
    expect(sel.get('2026-08-12')!.trackingMin).toBe(9)
  })

  it('값 없는 재실행이 앞선 신고값을 지우지 않는다 (리뷰 실측 지적)', () => {
    const a: MorningObservation = { kind: 'morning', ts: '2026-08-12T00:00:00.000Z', date: '2026-08-12', trackingMin: 30 }
    const b: MorningObservation = { kind: 'morning', ts: '2026-08-12T01:00:00.000Z', date: '2026-08-12' }
    expect(selectDailyObservations([a, b]).get('2026-08-12')!.trackingMin).toBe(30)
  })

  it('값 없는 관측뿐이면 마지막 관측 채택 (분모는 유지)', () => {
    const a: MorningObservation = { kind: 'morning', ts: '2026-08-12T00:00:00.000Z', date: '2026-08-12' }
    const b: MorningObservation = { kind: 'morning', ts: '2026-08-12T01:00:00.000Z', date: '2026-08-12' }
    const sel = selectDailyObservations([a, b])
    expect(sel.size).toBe(1)
    expect(sel.get('2026-08-12')!.ts).toBe(b.ts)
  })

  it('다른 날짜는 각각 유지', () => {
    const a: MorningObservation = { kind: 'morning', ts: '2026-08-11T00:00:00.000Z', date: '2026-08-11' }
    const b: MorningObservation = { kind: 'morning', ts: '2026-08-12T00:00:00.000Z', date: '2026-08-12' }
    expect(selectDailyObservations([a, b]).size).toBe(2)
  })
})
