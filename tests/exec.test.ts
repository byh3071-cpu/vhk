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
      // #246: 배포 CLI도 .cmd shim — Windows 에서 deploy isCLIAvailable 탐지 위해.
      expect(platformCmd('vercel')).toBe('vercel.cmd')
      expect(platformCmd('netlify')).toBe('netlify.cmd')
      expect(platformCmd('wrangler')).toBe('wrangler.cmd')
      expect(platformCmd('git')).toBe('git')
      expect(platformCmd('node')).toBe('node')
    } finally {
      Object.defineProperty(process, 'platform', { value: original })
    }
  })

  it('#150: platformCmd Windows 에서 vhk → vhk.cmd (MCP spawn ENOENT 수정)', async () => {
    const { platformCmd } = await import('../src/lib/exec.js')
    const original = process.platform
    try {
      Object.defineProperty(process, 'platform', { value: 'win32' })
      expect(platformCmd('vhk')).toBe('vhk.cmd')
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

  it('safeExecFile: timeoutMs 초과 시 ok=false + 시간 초과 메시지', async () => {
    const { safeExecFile } = await import('../src/lib/exec.js')
    // setInterval 로 절대 self-exit 안 하는 프로세스 → 느린 머신에서도 timeout 만이 종료 사유 (flaky 제거).
    const result = safeExecFile('node', ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 200 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.err).toMatch(/시간 초과|timeout/i)
    }
  })

  it('safeExecFile: 빠른 명령은 timeout 안에 정상 완료', async () => {
    const { safeExecFile } = await import('../src/lib/exec.js')
    const result = safeExecFile('node', ['--version'], { timeoutMs: 30_000 })
    expect(result.ok).toBe(true)
  })

  it('safeExecFile: timeoutMs<=0 이면 timeout 비활성 (정상 완료)', async () => {
    const { safeExecFile } = await import('../src/lib/exec.js')
    const result = safeExecFile('node', ['--version'], { timeoutMs: 0 })
    expect(result.ok).toBe(true)
  })

  it('exec: 기본 timeout 상수 export 확인', async () => {
    const { DEFAULT_EXEC_TIMEOUT_MS, NETWORK_EXEC_TIMEOUT_MS } = await import('../src/lib/exec.js')
    expect(DEFAULT_EXEC_TIMEOUT_MS).toBeGreaterThan(0)
    expect(NETWORK_EXEC_TIMEOUT_MS).toBeGreaterThan(0)
    // 네트워크 timeout 은 기본 backstop 보다 짧아야 의미가 있다.
    expect(NETWORK_EXEC_TIMEOUT_MS).toBeLessThan(DEFAULT_EXEC_TIMEOUT_MS)
  })

  it('safeExecFileAsync: 성공 시 ok=true와 trim된 out 반환 (sync 파리티)', async () => {
    const { safeExecFileAsync } = await import('../src/lib/exec.js')
    const result = await safeExecFileAsync('node', ['--version'])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.out).toMatch(/^v\d+\.\d+\.\d+/)
    }
  })

  it('safeExecFileAsync: 실패 시 ok=false와 err 메시지 반환', async () => {
    const { safeExecFileAsync } = await import('../src/lib/exec.js')
    const result = await safeExecFileAsync('this-binary-does-not-exist-vhk-xyz', [])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.err).toBeTruthy()
    }
  })

  it('safeExecFileAsync: timeoutMs 초과 시 ok=false + 시간 초과 메시지 (이벤트루프 비블로킹)', async () => {
    const { safeExecFileAsync } = await import('../src/lib/exec.js')
    // async execFile 은 killSignal 로 죽이므로 killed/signal 기반 timeout 라벨이 동작해야 함.
    const result = await safeExecFileAsync('node', ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 200 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.err).toMatch(/시간 초과|timeout/i)
    }
  })

  it('safeExecFileStream: timeoutMs 초과 시 ok=false + 시간 초과 메시지', async () => {
    const { safeExecFileStream } = await import('../src/lib/exec.js')
    const result = safeExecFileStream('node', ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 200 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.err).toMatch(/시간 초과|timeout/i)
    }
  })
})
