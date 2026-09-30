import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execGate, gateResultFromExec, verifyEvidence, GATE_TIMEOUT_MS } from '../src/commands/verify.js'
import { removeDirSync } from '../src/lib/fs-remove.js'

// 게이트가 왜 실패했는지(시간 초과·실행 불가·강제 종료·일반 실패)와 실제 소요 시간을 남기는지 확인한다.
// 어떤 종류든 실패는 실패로 남아야 한다 — 종류 구분이 통과로 바뀌는 경로가 되면 안 된다.
const node = process.execPath

describe('execGate 실패 종류와 소요 시간', () => {
  it('정상 종료는 종료코드 0과 실제 소요 시간만 남긴다', () => {
    const result = execGate(node, ['-e', '0'], os.tmpdir())
    expect(result.exitCode).toBe(0)
    expect(result.failureKind).toBeUndefined()
    expect(result.durationMs).toEqual(expect.any(Number))
  })

  it('0이 아닌 종료는 실제 종료코드와 exit 종류로 남긴다', () => {
    const result = execGate(node, ['-e', 'process.exit(7)'], os.tmpdir())
    expect(result).toMatchObject({ exitCode: 7, failureKind: 'exit' })
  })

  it('시간 한도를 넘기면 timeout 종류로 남기고 한도 근처에서 돌아온다', () => {
    const result = execGate(node, ['-e', 'setTimeout(() => {}, 20000)'], os.tmpdir(), 500)
    expect(result.failureKind).toBe('timeout')
    expect(result.exitCode).not.toBe(0)
    expect(result.durationMs).toBeGreaterThanOrEqual(400)
    expect(result.durationMs).toBeLessThan(15_000)
  }, 30_000)

  it('명령을 시작하지 못하면 spawn 종류로 남긴다', () => {
    const result = execGate('vhk-gate-outcome-missing-command', [], os.tmpdir())
    expect(result.failureKind).toBe('spawn')
    expect(result.exitCode).not.toBe(0)
  })

  it.skipIf(process.platform === 'win32')('신호로 끝나면 signal 종류로 남긴다', () => {
    const result = execGate(node, ['-e', "process.kill(process.pid, 'SIGKILL')"], os.tmpdir())
    expect(result.failureKind).toBe('signal')
    expect(result.exitCode).not.toBe(0)
  })

  it('기본 시간 한도는 기존 600초를 유지한다', () => {
    expect(GATE_TIMEOUT_MS).toBe(600_000)
  })
})

describe('gateResultFromExec — 종류는 사유만 바꾸고 판정은 바꾸지 않는다', () => {
  it('통과는 소요 시간을 남기고 사유가 없다', () => {
    const gate = gateResultFromExec('test', 'test:run', { exitCode: 0, out: '', durationMs: 1234 })
    expect(gate).toMatchObject({ status: 'pass', exitCode: 0, durationMs: 1234 })
    expect(gate.detail).toBeUndefined()
    expect(gate.failureKind).toBeUndefined()
  })

  it('일반 실패의 사유는 기존 "종료코드 N" 형식을 유지한다', () => {
    const gate = gateResultFromExec('test', 'test:run', { exitCode: 7, out: '', durationMs: 10, failureKind: 'exit' })
    expect(gate).toMatchObject({ status: 'fail', exitCode: 7, failureKind: 'exit', detail: '종료코드 7' })
  })

  it('시간 초과·실행 불가·강제 종료는 실패이면서 종류를 사유에 적는다', () => {
    const timeout = gateResultFromExec('test', 'test:run', { exitCode: 1, out: '', durationMs: 600_000, failureKind: 'timeout', timeoutMs: 600_000 })
    expect(timeout).toMatchObject({ status: 'fail', failureKind: 'timeout' })
    expect(timeout.detail).toContain('시간 초과')
    expect(timeout.detail).toContain('600초')
    const spawn = gateResultFromExec('build', 'build', { exitCode: 1, out: '', durationMs: 5, failureKind: 'spawn', error: 'ENOENT' })
    expect(spawn).toMatchObject({ status: 'fail', failureKind: 'spawn' })
    expect(spawn.detail).toContain('실행하지 못함')
    const signal = gateResultFromExec('lint', 'lint', { exitCode: 1, out: '', durationMs: 5, failureKind: 'signal', signal: 'SIGKILL' })
    expect(signal).toMatchObject({ status: 'fail', failureKind: 'signal' })
    expect(signal.detail).toContain('SIGKILL')
  })

  it('종료코드 0이어도 실패 종류가 붙어 있으면 통과로 보지 않는다', () => {
    const gate = gateResultFromExec('test', 'test:run', { exitCode: 0, out: '', durationMs: 5, failureKind: 'timeout', timeoutMs: 1000 })
    expect(gate.status).toBe('fail')
  })
})

describe('verify 리포트에 게이트별 소요 시간과 실패 종류가 남는다', () => {
  it('실패한 test 게이트는 exit 종류와 소요 시간을 리포트에 남긴다', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-gate-outcome-'))
    try {
      fs.writeFileSync(path.join(d, 'fail.js'), 'process.exit(3)\n', 'utf-8')
      fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'tp', version: '0.0.0', scripts: { 'test:run': 'node fail.js' } }), 'utf-8')
      const { report } = verifyEvidence(d)
      const testGate = report.gates.find((g) => g.id === 'test')
      expect(testGate).toMatchObject({ status: 'fail', exitCode: 3, failureKind: 'exit' })
      expect(testGate?.durationMs).toEqual(expect.any(Number))
      expect(report.status).toBe('FAIL')
    } finally {
      removeDirSync(d)
    }
  }, 30_000)
})
