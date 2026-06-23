import { describe, it, expect } from 'vitest'
import { pickCliInvocation, composeInvocation } from '../src/mcp/cli-path.js'

describe('MCP CLI 경로 resolve fallback (배치3 §5)', () => {
  it('동봉 dist 가 있으면 전역 vhk 보다 우선 — node 로 로컬 CLI 위임 (parity, #339)', () => {
    const r = pickCliInvocation(true, '/x/dist/index.js', true)
    expect(r.bin).toBe(process.execPath)
    expect(r.prefixArgs).toEqual(['/x/dist/index.js'])
    expect(r.fallback).toBe(true)
  })

  it('전역 vhk 가 없고 로컬 dist/index.js 가 있으면 node 로 로컬 CLI fallback', () => {
    const r = pickCliInvocation(false, '/x/dist/index.js', true)
    expect(r.bin).toBe(process.execPath)
    expect(r.prefixArgs).toEqual(['/x/dist/index.js'])
    expect(r.fallback).toBe(true)
  })

  it('전역도 로컬도 없으면 vhk 로 폴백(호출부가 에러 처리)', () => {
    const r = pickCliInvocation(false, '/x/dist/index.js', false)
    expect(r.bin).toBe('vhk')
    expect(r.fallback).toBe(false)
  })
})

describe('composeInvocation — ⑤ fallback 인자 합성 (실행 경로)', () => {
  it('전역 vhk: prefixArgs 없이 args 그대로', () => {
    expect(
      composeInvocation({ bin: 'vhk', prefixArgs: [], fallback: false }, ['sync'])
    ).toEqual({ bin: 'vhk', args: ['sync'] })
  })

  it('fallback: node + 로컬 dist/index.js + args 순서대로', () => {
    expect(
      composeInvocation(
        { bin: process.execPath, prefixArgs: ['/x/dist/index.js'], fallback: true },
        ['secure', 'scan']
      )
    ).toEqual({ bin: process.execPath, args: ['/x/dist/index.js', 'secure', 'scan'] })
  })
})
