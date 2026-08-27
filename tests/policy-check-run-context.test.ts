import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { policyCheck } from '../src/commands/policy.js'
import { POLICY_CONFIG_REL } from '../src/lib/policy-config.js'
import { RUN_STATE_REL } from '../src/lib/run-state.js'
import { removeDirSync } from '../src/lib/fs-remove.js'

const POLICY = {
  schemaVersion: 1,
  record: false,
  enforce: false,
  allow: [{ id: 'lint', bin: 'pnpm', args: ['lint'], minLevel: 'L1' }],
  limits: { perRunSec: 3600, perCommandSec: 900, perRunCommandCount: 1 },
}

const STALE_RUN = {
  startedAtUtc: '2026-08-20T00:00:00.000Z',
  commandCount: 1,
  lastSeenUtc: '2026-08-20T00:01:00.000Z',
  clockAnomaly: false,
}

describe('vhk policy check — 활성 런 컨텍스트 선택', () => {
  let dir: string
  let originalExitCode: number | string | undefined
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vhk-policy-check-run-'))
    mkdirSync(join(dir, '.vhk'), { recursive: true })
    writeFileSync(join(dir, POLICY_CONFIG_REL), `${JSON.stringify(POLICY)}\n`, 'utf-8')
    originalExitCode = process.exitCode
    process.exitCode = 0
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.exitCode = originalExitCode
    vi.restoreAllMocks()
    removeDirSync(dir)
  })

  function writeRunState(records: Record<string, object>): void {
    writeFileSync(join(dir, RUN_STATE_REL), `${JSON.stringify(records, null, 2)}\n`, 'utf-8')
  }

  function output(): string {
    return logSpy.mock.calls.flat().join(' ')
  }

  it.each([
    ['terminal 요청', {
      terminalRequestExpected: {
        ts: '2026-08-20T00:02:00.000Z',
        event: 'complete',
        policyInvalidated: false,
      },
    }],
    ['정책 원장 pending', { policyRecordPending: true }],
  ] as const)('%s 재시도 증거만 남으면 stale 예산·시작 시각을 적용하지 않는다', (_label, marker) => {
    writeRunState({ retry: { ...STALE_RUN, ...marker } })

    policyCheck(['pnpm', 'lint'], dir)

    expect(process.exitCode).toBe(0)
    expect(output()).toContain('런 밖 판정')
  })

  it('재시도 증거와 활성 런이 함께 있으면 활성 런만 선택한다', () => {
    const nowUtc = new Date().toISOString()
    writeRunState({
      active: {
        startedAtUtc: nowUtc,
        commandCount: 1,
        lastSeenUtc: nowUtc,
        clockAnomaly: false,
      },
      retry: { ...STALE_RUN, policyRecordPending: true },
    })

    policyCheck(['pnpm', 'lint'], dir)

    expect(process.exitCode).toBe(1)
    expect(output()).toContain('명령 호출 수가 상한에 도달')
    expect(output()).not.toContain('런 밖 판정')
  })
})
