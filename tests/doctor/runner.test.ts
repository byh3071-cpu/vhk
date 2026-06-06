import { describe, it, expect } from 'vitest'
import { runDiagnostics } from '../../src/doctor/runner.js'
import type { DiagDeps, DiagFn } from '../../src/doctor/types.js'

const deps: DiagDeps = { run: () => ({ ok: true, out: '' }), nodeVersion: 'v20.18.0', platform: 'win32', osRelease: '10' }

const okDiag: DiagFn = () => ({ name: 'ok-one', status: 'ok', value: 'fine' })
const throwDiag: DiagFn = () => { throw new Error('진단 폭발') }

describe('runDiagnostics', () => {
  it('모든 진단을 실행해 결과 배열 반환', async () => {
    const r = await runDiagnostics([okDiag, okDiag], {}, deps)
    expect(r).toHaveLength(2)
    expect(r.every((d) => d.status === 'ok')).toBe(true)
  })

  it('한 진단이 throw 해도 fail 로 격리 — 나머지 정상', async () => {
    const r = await runDiagnostics([okDiag, throwDiag, okDiag], {}, deps)
    expect(r).toHaveLength(3)
    expect(r[1].status).toBe('fail')
    expect(r[1].advice).toContain('진단 폭발')
    expect(r[0].status).toBe('ok')
    expect(r[2].status).toBe('ok')
  })

  it('전부 throw 해도 정상 종료(전부 fail)', async () => {
    const r = await runDiagnostics([throwDiag, throwDiag], {}, deps)
    expect(r.every((d) => d.status === 'fail')).toBe(true)
  })
})
