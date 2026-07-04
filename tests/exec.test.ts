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

  // CodeQL #1·#3·#7·#9(js/shell-command-injection-from-environment) dismiss 후속 하드닝.
  // resolveCmd 의 Windows shim(cmd.exe /c) 래핑은 오늘 기준 실제 호출부(전부 리터럴 인자)엔
  // 안 걸리지만, safeExecFile 은 범용 함수라 미래에 cwd·파일명 등 오염된 값이 shim 바이너리
  // 인자로 들어오면 위험해질 수 있다. 직접 프로브로 실증: 단순 '&'만으론 Node 의 argv 인용이
  // 막아주지만(안전), '" & echo X & "'(따옴표+앰퍼샌드 조합, CVE-2024-27980 과 같은 근본원인
  // 클래스)는 실제로 cmd.exe 인용 경계를 탈출해 echo 가 진짜 실행됨(STDOUT 에 마커 출력으로
  // 직접 확인) — "제대로 이스케이프"보다 "위험 문자 있으면 거부"가 안전한 방어.
  it('safeExecFile: Windows shim 바이너리 호출 시 cmd.exe 인용 탈출 인자는 거부해 실제 인젝션을 막는다(하드닝)', async () => {
    const { safeExecFile } = await import('../src/lib/exec.js')
    const original = process.platform
    try {
      Object.defineProperty(process, 'platform', { value: 'win32' })
      const result = safeExecFile('pnpm', ['--version', '" & echo VHK_INJECTION_PROBE & "'])
      expect(result.ok).toBe(false)
      // 핵심 단언: 주입된 echo 가 실행돼 STDOUT 에 마커가 찍히면 안 됨(실제 인젝션 차단 증명).
      // out 필드는 실패 시에도 채워짐(safeExecFile 계약) — 인젝션 성공 시 여기 마커가 남는다.
      if (!result.ok) {
        expect(result.out).not.toContain('VHK_INJECTION_PROBE')
      }
    } finally {
      Object.defineProperty(process, 'platform', { value: original })
    }
  })

  it('safeExecFile: 비-shim 바이너리는 같은 인자도 거부 없이 통과(과잉차단 방지 — cmd.exe 자체를 안 거치므로 애초에 안전)', async () => {
    const { safeExecFile } = await import('../src/lib/exec.js')
    const original = process.platform
    try {
      Object.defineProperty(process, 'platform', { value: 'win32' })
      // 'git'은 SHIM_BINARIES 밖 → cmd.exe 경유 안 함 → 우리 하드닝 검사도 적용 안 돼야 함.
      const result = safeExecFile('git', ['status', '" & echo VHK_INJECTION_PROBE & "'])
      if (!result.ok) {
        expect(result.err).not.toContain('안전하지 않은')
      }
    } finally {
      Object.defineProperty(process, 'platform', { value: original })
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
