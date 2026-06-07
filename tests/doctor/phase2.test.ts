import { describe, it, expect } from 'vitest'
import { buildVhkDiag } from '../../src/doctor/diagnostics/vhk.js'
import { buildMcpDiag } from '../../src/doctor/diagnostics/mcp.js'
import { buildAuditDiag } from '../../src/doctor/diagnostics/audit.js'
import { formatDiagnosticsJson } from '../../src/doctor/report.js'
import type { Diagnostic } from '../../src/doctor/types.js'

describe('buildVhkDiag', () => {
  it('버전 있고 최신 → ok', () => {
    const r = buildVhkDiag({ version: '2.4.2', latest: '2.4.2' })
    expect(r.status).toBe('ok')
    expect(r.value).toContain('2.4.2')
  })
  it('업데이트 있으면 warn + 안내', () => {
    const r = buildVhkDiag({ version: '2.4.0', latest: '2.4.2' })
    expect(r.status).toBe('warn')
    expect(r.advice).toContain('2.4.2')
  })
  it('버전 확인 불가 → warn', () => {
    expect(buildVhkDiag({ version: undefined, latest: null }).status).toBe('warn')
  })
  it('최신 조회 실패(latest null)여도 버전 있으면 ok', () => {
    expect(buildVhkDiag({ version: '2.4.2', latest: null }).status).toBe('ok')
  })
})

describe('buildMcpDiag', () => {
  it('도구 수 충분(>= 기대) → ok', () => {
    const r = buildMcpDiag(29, 20)
    expect(r.status).toBe('ok')
    expect(r.value).toContain('29')
  })
  it('도구 수 부족 → warn', () => {
    expect(buildMcpDiag(10, 20).status).toBe('warn')
  })
  it('0개 → fail (서버 깨짐)', () => {
    expect(buildMcpDiag(0, 20).status).toBe('fail')
  })
})

describe('buildAuditDiag', () => {
  it('--audit 없으면 skip (기본 생략)', () => {
    let called = false
    const r = buildAuditDiag({ audit: false }, () => { called = true; return { ok: true, out: '' } })
    expect(r.status).toBe('skip')
    expect(called).toBe(false)
  })
  it('--audit + 취약점 0(run ok) → ok', () => {
    const r = buildAuditDiag({ audit: true }, () => ({ ok: true, out: 'No known vulnerabilities found' }))
    expect(r.status).toBe('ok')
  })
  it('--audit + 취약점 발견(run fail) → warn + 안내', () => {
    const r = buildAuditDiag({ audit: true }, () => ({ ok: false, out: '3 vulnerabilities', err: '' }))
    expect(r.status).toBe('warn')
    expect(r.advice).toBeTruthy()
  })
})

describe('formatDiagnosticsJson', () => {
  it('Diagnostic[] 를 파싱 가능한 JSON 으로', () => {
    const diags: Diagnostic[] = [{ name: 'Node', status: 'ok', value: 'v20' }]
    const json = formatDiagnosticsJson(diags)
    expect(JSON.parse(json)).toEqual(diags)
  })
})
