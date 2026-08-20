import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as lib from '../src/lib/autonomy-stats.js'
import * as cmd from '../src/commands/stats.js'
import type { AutonomyRunEntry } from '../src/lib/autonomy-log.js'
import type { ReceiptLogEntry } from '../src/lib/receipt-log.js'

/*
 * RFC 0066 §2.1 — 3중 판정 집계를 commands/stats.ts 에서 lib/autonomy-stats.ts 로 이관했다.
 * 권한 단계 판정(작업 단위 124)이 이 계산을 유일한 입력으로 쓰는데, lib 모듈이 commands 를
 * import 하면 역방향 의존이 생기기 때문이다.
 *
 * 여기서 고정하는 것은 두 가지다.
 *   ① 이관 후에도 기존 공개 표면(commands/stats.js)이 같은 값을 준다 — 호출부 무수정 보장
 *   ② 판정 계약의 원본이 한 곳이다 — stats.ts 에 재정의가 남아 있으면 두 원본이 갈린다
 */

function run(over: Partial<AutonomyRunEntry> = {}): AutonomyRunEntry {
  return {
    ts: '2026-08-20T00:00:00.000Z',
    runId: 'r1',
    goal: 1,
    event: 'start',
    schemaVersion: 2,
    sha: 'abc123',
    ...over,
  } as AutonomyRunEntry
}

function receipt(over: Partial<ReceiptLogEntry> = {}): ReceiptLogEntry {
  return {
    ts: '2026-08-20T00:01:00.000Z',
    sha: 'abc123',
    decision: 'pass',
    red: false,
    dirty: false,
    stale: false,
    ...over,
  } as ReceiptLogEntry
}

describe('autonomy-stats 이관 (RFC 0066 §2.1)', () => {
  it('lib 과 commands 가 같은 함수를 가리킨다 — 재정의 없음', () => {
    expect(cmd.calcAutonomyStats).toBe(lib.calcAutonomyStats)
    expect(cmd.ROLLING_WINDOW).toBe(lib.ROLLING_WINDOW)
    expect(cmd.DEMOTION_FAILURE_THRESHOLD).toBe(lib.DEMOTION_FAILURE_THRESHOLD)
    expect(cmd.INFRA_ABUSE_RATIO).toBe(lib.INFRA_ABUSE_RATIO)
    expect(cmd.INFRA_RATIO_MIN_SAMPLE).toBe(lib.INFRA_RATIO_MIN_SAMPLE)
  })

  it('두 경로가 같은 입력에 같은 결과를 준다', () => {
    const entries = [run(), run({ event: 'complete', interventions: 0 })]
    const receipts = [receipt()]
    expect(lib.calcAutonomyStats(entries, receipts)).toEqual(cmd.calcAutonomyStats(entries, receipts))
  })

  // 이관하면서 export 로 열었다 — 권한 판정이 판정 단위를 직접 재현하지 않고 재사용하게 한다.
  it('groupRuns·isVerifiedComplete 가 lib 에서 공개돼 있다', () => {
    expect(typeof lib.groupRuns).toBe('function')
    expect(typeof lib.isVerifiedComplete).toBe('function')
  })

  // dirty 는 완주를 탈락시킨다 — RFC 0066 §7.2 데드락 분석이 이 규칙 위에 서 있다.
  it('작업 트리가 dirty 면 완주로 세지 않는다', () => {
    const entries = [run(), run({ event: 'complete', interventions: 0 })]
    expect(lib.calcAutonomyStats(entries, [receipt()]).verifiedComplete).toBe(1)
    expect(lib.calcAutonomyStats(entries, [receipt({ dirty: true })]).verifiedComplete).toBe(0)
  })

  // lib → commands 역방향 의존이 생기면 이관 목적이 무너진다.
  it('lib 모듈이 commands 를 import 하지 않는다', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'lib', 'autonomy-stats.ts'), 'utf-8')
    expect(source).not.toMatch(/from\s+['"][^'"]*commands\//)
  })
})
