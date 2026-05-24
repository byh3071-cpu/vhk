import { describe, it, expect } from 'vitest'

describe('lib/exec', () => {
  it('platformCmd: Windows에서 pnpm은 pnpm.cmd로 변환', async () => {
    const { platformCmd } = await import('../src/lib/exec.js')
    // process.platform이 win32일 때 .cmd 부착
    const original = process.platform
    try {
      Object.defineProperty(process, 'platform', { value: 'win32' })
      expect(platformCmd('pnpm')).toBe('pnpm.cmd')
      expect(platformCmd('npm')).toBe('npm.cmd')
      expect(platformCmd('npx')).toBe('npx.cmd')
      expect(platformCmd('yarn')).toBe('yarn.cmd')
      expect(platformCmd('git')).toBe('git')
      expect(platformCmd('node')).toBe('node')
    } finally {
      Object.defineProperty(process, 'platform', { value: original })
    }
  })

  it('platformCmd: 비 Windows에서는 그대로 반환', async () => {
    const { platformCmd } = await import('../src/lib/exec.js')
    const original = process.platform
    try {
      Object.defineProperty(process, 'platform', { value: 'linux' })
      expect(platformCmd('pnpm')).toBe('pnpm')
      expect(platformCmd('git')).toBe('git')
    } finally {
      Object.defineProperty(process, 'platform', { value: original })
    }
  })

  it('safeExecFile: 성공 시 ok=true와 trim된 out 반환', async () => {
    const { safeExecFile } = await import('../src/lib/exec.js')
    const result = safeExecFile('node', ['--version'])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.out).toMatch(/^v\d+\.\d+\.\d+/)
    }
  })

  it('safeExecFile: 실패 시 ok=false와 err 메시지 반환', async () => {
    const { safeExecFile } = await import('../src/lib/exec.js')
    const result = safeExecFile('this-binary-does-not-exist-vhk-xyz', [])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.err).toBeTruthy()
    }
  })

  it('safeExecFile: Windows .cmd shim 실행 (Node 20.12+ CVE-2024-27980 회귀 방지)', async () => {
    // pnpm.cmd가 spawnSync EINVAL 없이 실행되어야 함
    const { safeExecFile } = await import('../src/lib/exec.js')
    const result = safeExecFile('pnpm', ['--version'])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.out).toMatch(/^\d+\.\d+\.\d+/)
    }
  })
})
