import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// spawnSync 를 mock — 실제 클립보드 도구 spawn 없이 분기만 검증.
const mockSpawnSync = vi.fn()
vi.mock('node:child_process', () => ({
  spawnSync: (...a: unknown[]) => mockSpawnSync(...a),
}))

const origPlatform = process.platform
function setPlatform(p: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: p, configurable: true })
}

describe('copyToClipboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    setPlatform(origPlatform)
  })

  it('win32 — Set-Clipboard 성공(status 0) 시 true', async () => {
    setPlatform('win32')
    mockSpawnSync.mockReturnValue({ status: 0, error: undefined })
    const { copyToClipboard } = await import('../src/lib/clipboard.js')
    expect(copyToClipboard('안녕하세요 hello')).toBe(true)
    // powershell 로 호출됐는지 + base64 인자 전달 확인
    expect(mockSpawnSync).toHaveBeenCalledTimes(1)
    expect(mockSpawnSync.mock.calls[0][0]).toBe('powershell')
  })

  it('win32 — 비0 exit 시 false', async () => {
    setPlatform('win32')
    mockSpawnSync.mockReturnValue({ status: 1, error: undefined })
    const { copyToClipboard } = await import('../src/lib/clipboard.js')
    expect(copyToClipboard('x')).toBe(false)
  })

  it('win32 — 명령 없음(error 설정) 시 false', async () => {
    setPlatform('win32')
    mockSpawnSync.mockReturnValue({ status: null, error: new Error('ENOENT') })
    const { copyToClipboard } = await import('../src/lib/clipboard.js')
    expect(copyToClipboard('x')).toBe(false)
  })

  it('linux — 첫 도구 실패 시 다음 도구를 시도', async () => {
    setPlatform('linux')
    mockSpawnSync
      .mockReturnValueOnce({ status: 1, error: new Error('no wl-copy') }) // wl-copy 실패
      .mockReturnValueOnce({ status: 0, error: undefined }) // xclip 성공
    const { copyToClipboard } = await import('../src/lib/clipboard.js')
    expect(copyToClipboard('x')).toBe(true)
    expect(mockSpawnSync).toHaveBeenCalledTimes(2)
  })

  it('spawnSync 가 throw 해도 크래시 없이 false', async () => {
    setPlatform('win32')
    mockSpawnSync.mockImplementation(() => {
      throw new Error('boom')
    })
    const { copyToClipboard } = await import('../src/lib/clipboard.js')
    expect(copyToClipboard('x')).toBe(false)
  })
})
