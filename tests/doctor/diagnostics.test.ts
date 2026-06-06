import { describe, it, expect } from 'vitest'
import { diagNode } from '../../src/doctor/diagnostics/node.js'
import { diagNpm } from '../../src/doctor/diagnostics/npm.js'
import { diagPnpm } from '../../src/doctor/diagnostics/pnpm.js'
import { diagGit } from '../../src/doctor/diagnostics/git.js'
import { diagOs } from '../../src/doctor/diagnostics/os.js'
import type { DiagDeps } from '../../src/doctor/types.js'

function deps(over: Partial<DiagDeps> = {}, responses: Record<string, { ok: boolean; out: string; err?: string }> = {}): DiagDeps {
  return {
    run: (cmd, args) => responses[`${cmd} ${args.join(' ')}`.trim()] ?? { ok: true, out: '' },
    nodeVersion: 'v20.18.0',
    platform: 'win32',
    osRelease: '10.0.26200',
    ...over,
  }
}

describe('diagNode (nodeMeetsShimSafe 재사용 + PATH 도달성)', () => {
  it('shim-safe 버전 + PATH node 도달 → ok', () => {
    const r = diagNode({}, deps({ nodeVersion: 'v20.18.0' }, { 'node --version': { ok: true, out: 'v20.18.0' } }))
    expect(r.status).toBe('ok')
  })
  it('취약 버전 → warn + 권장 조치', () => {
    const r = diagNode({}, deps({ nodeVersion: 'v20.10.0' }, { 'node --version': { ok: true, out: 'v20.10.0' } }))
    expect(r.status).toBe('warn')
    expect(r.advice).toBeTruthy()
  })
  it('PATH 에 node 없음(셸 미인식) → fail (옛 checkCommand 가드 복원)', () => {
    const r = diagNode({}, deps({ nodeVersion: 'v20.18.0' }, { 'node --version': { ok: false, out: '', err: 'not found' } }))
    expect(r.status).toBe('fail')
    expect(r.advice).toBeTruthy()
  })
})

describe('diagNpm', () => {
  it('설치됨 → ok + 버전', () => {
    const r = diagNpm({}, deps({}, { 'npm --version': { ok: true, out: '10.8.0' } }))
    expect(r.status).toBe('ok')
    expect(r.value).toContain('10.8.0')
  })
  it('npm 없음/PATH 누락 → fail (publish·update 흐름이 npm 의존)', () => {
    const r = diagNpm({}, deps({}, { 'npm --version': { ok: false, out: '', err: 'not found' } }))
    expect(r.status).toBe('fail')
    expect(r.advice).toBeTruthy()
  })
})

describe('diagPnpm', () => {
  it('설치됨 → ok + 버전', () => {
    const r = diagPnpm({}, deps({}, { 'pnpm --version': { ok: true, out: '9.12.0' } }))
    expect(r.status).toBe('ok')
    expect(r.value).toContain('9.12.0')
  })
  it('없음 → fail + 설치 안내', () => {
    const r = diagPnpm({}, deps({}, { 'pnpm --version': { ok: false, out: '', err: 'not found' } }))
    expect(r.status).toBe('fail')
    expect(r.advice).toBeTruthy()
  })
})

describe('diagGit', () => {
  it('설치 + user 설정 → ok', () => {
    const r = diagGit({}, deps({}, {
      'git --version': { ok: true, out: 'git version 2.45.0' },
      'git config user.name': { ok: true, out: 'byh3071' },
      'git config user.email': { ok: true, out: 'a@b.com' },
    }))
    expect(r.status).toBe('ok')
    expect(r.value).toContain('2.45')
  })
  it('설치됐지만 user 미설정 → warn', () => {
    const r = diagGit({}, deps({}, {
      'git --version': { ok: true, out: 'git version 2.45.0' },
      'git config user.name': { ok: false, out: '' },
      'git config user.email': { ok: false, out: '' },
    }))
    expect(r.status).toBe('warn')
  })
  it('git 없음 → fail', () => {
    const r = diagGit({}, deps({}, { 'git --version': { ok: false, out: '', err: 'no git' } }))
    expect(r.status).toBe('fail')
  })
})

describe('diagOs', () => {
  it('항상 ok + platform/release', () => {
    const r = diagOs({}, deps({ platform: 'win32', osRelease: '10.0.26200' }))
    expect(r.status).toBe('ok')
    expect(r.value).toContain('win32')
    expect(r.value).toContain('10.0.26200')
  })
})
