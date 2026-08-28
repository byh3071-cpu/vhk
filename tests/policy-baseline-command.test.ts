import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { policyBaseline } from '../src/commands/policy-baseline.js'
import { policyCheck } from '../src/commands/policy.js'
import { POLICY_BASELINE_REL, checkPolicyBaseline } from '../src/lib/policy-baseline.js'
import { POLICY_CONFIG_REL } from '../src/lib/policy-config.js'
import { removeDirSync } from '../src/lib/fs-remove.js'
import { runNaturalLanguageRoute } from '../src/lib/nlp-run.js'

describe('vhk policy baseline — 사람 전용 기준선 고정', () => {
  let dir: string
  let originalExitCode: number | string | undefined
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vhk-policy-baseline-command-'))
    originalExitCode = process.exitCode
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    process.exitCode = originalExitCode
    vi.restoreAllMocks()
    removeDirSync(dir)
  })

  function writePolicy(body: string = '{"schemaVersion":1,"record":true,"enforce":false}'): void {
    mkdirSync(join(dir, '.vhk'), { recursive: true })
    writeFileSync(join(dir, POLICY_CONFIG_REL), body, 'utf-8')
  }

  it('--confirm 없이는 파일을 쓰지 않는다', () => {
    writePolicy()
    policyBaseline({ confirm: false }, dir)
    expect(existsSync(join(dir, POLICY_BASELINE_REL))).toBe(false)
    expect(process.exitCode).toBe(1)
  })

  it('설정 파일이 없으면 명시 승인으로 default-off 부재 상태를 고정한다', () => {
    policyBaseline({ confirm: true }, dir)
    expect(JSON.parse(readFileSync(join(dir, POLICY_BASELINE_REL), 'utf-8'))).toEqual({ hash: null })
    expect(checkPolicyBaseline(dir)).toMatchObject({ mutated: false, baselineMissing: false })
    expect(process.exitCode).toBe(originalExitCode)
  })

  it('설정 파일이 손상됐으면 기존 기준선을 덮어쓰지 않는다', () => {
    policyBaseline({ confirm: true }, dir)
    const before = readFileSync(join(dir, POLICY_BASELINE_REL), 'utf-8')
    writePolicy('{ broken')
    policyBaseline({ confirm: true }, dir)
    expect(readFileSync(join(dir, POLICY_BASELINE_REL), 'utf-8')).toBe(before)
    expect(process.exitCode).toBe(1)
  })

  it('첫 실행의 설정이 손상돼도 판정 전에 로컬 파일 ignore를 보강한다', () => {
    writePolicy('{ broken')
    writeFileSync(
      join(dir, '.vhk', '.gitignore'),
      'policy.json\n!policy.json\n',
      'utf-8',
    )

    policyBaseline({ confirm: true }, dir)

    const lines = readFileSync(join(dir, '.vhk', '.gitignore'), 'utf-8').split(/\r?\n/)
    expect(lines.lastIndexOf('policy.json')).toBeGreaterThan(lines.lastIndexOf('!policy.json'))
    expect(existsSync(join(dir, POLICY_BASELINE_REL))).toBe(false)
    expect(process.exitCode).toBe(1)
  })

  it('명시 승인하면 현재 유효 설정을 고정하고 대조가 통과한다', () => {
    writePolicy()
    policyBaseline({ confirm: true }, dir)
    expect(checkPolicyBaseline(dir)).toMatchObject({ mutated: false, baselineMissing: false })
    expect(readFileSync(join(dir, POLICY_BASELINE_REL), 'utf-8')).not.toContain(POLICY_CONFIG_REL)
    expect(process.exitCode).toBe(originalExitCode)
  })

  it('사람 명령만 writer를 import하고 자율 종결 경로는 import하지 않는다', () => {
    const commandSource = readFileSync('src/commands/policy-baseline.ts', 'utf-8')
    const agentSource = readFileSync('src/commands/agent.ts', 'utf-8')
    expect(commandSource).toContain('writePolicyBaseline')
    expect(commandSource).toContain('printNextStep')
    expect(agentSource).not.toContain('writePolicyBaseline')
  })

  it('기준선을 쓰기 전에 정책 상태·잠금·원자 임시본을 기존 .vhk/.gitignore에 멱등 보강한다', () => {
    mkdirSync(join(dir, '.vhk'), { recursive: true })
    writeFileSync(join(dir, '.vhk', '.gitignore'), 'memory.json\n', 'utf-8')
    policyBaseline({ confirm: true }, dir)
    policyBaseline({ confirm: true }, dir)
    const lines = readFileSync(join(dir, '.vhk', '.gitignore'), 'utf-8').split(/\r?\n/)
    expect(lines).toContain('memory.json')
    for (const name of [
      'policy.json',
      'policy-baseline.json',
      '.policy-baseline.json.tmp-*',
      'run-state.json',
      'run-state.lock',
      'run-state-recovery.lock',
      '.run-state.json.tmp-*',
    ]) {
      expect(lines.filter((line) => line.trim() === name)).toHaveLength(1)
    }
  })

  it('기준선과 다른 유효 allowlist도 명시형 policy check에서 deny/1로 실패 폐쇄한다', () => {
    writePolicy(JSON.stringify({
      schemaVersion: 1,
      record: true,
      allow: [{ id: 'lint', bin: 'pnpm', args: ['lint'], minLevel: 'L1' }],
      limits: { perRunSec: 3600, perCommandSec: 900, perRunCommandCount: 40 },
    }))
    policyBaseline({ confirm: true }, dir)
    writePolicy(JSON.stringify({
      schemaVersion: 1,
      record: true,
      allow: [{ id: 'tests', bin: 'pnpm', args: ['test:run'], minLevel: 'L1' }],
      limits: { perRunSec: 3600, perCommandSec: 900, perRunCommandCount: 40 },
    }))
    process.exitCode = originalExitCode

    policyCheck(['pnpm', 'test:run'], dir)

    expect(process.exitCode).toBe(1)
  })

  it('자연어 policy check도 변조된 allowlist를 실행 가능으로 판정하지 않는다', async () => {
    writePolicy(JSON.stringify({
      schemaVersion: 1,
      record: true,
      allow: [{ id: 'lint', bin: 'pnpm', args: ['lint'], minLevel: 'L1' }],
      limits: { perRunSec: 3600, perCommandSec: 900, perRunCommandCount: 40 },
    }))
    policyBaseline({ confirm: true }, dir)
    writePolicy(JSON.stringify({
      schemaVersion: 1,
      record: true,
      allow: [{ id: 'tests', bin: 'pnpm', args: ['test:run'], minLevel: 'L1' }],
      limits: { perRunSec: 3600, perCommandSec: 900, perRunCommandCount: 40 },
    }))
    process.exitCode = originalExitCode
    const previousCwd = process.cwd()
    try {
      process.chdir(dir)
      await runNaturalLanguageRoute('pnpm test:run 실행 가능해?')
    } finally {
      process.chdir(previousCwd)
    }

    expect(process.exitCode).toBe(1)
  })
})
