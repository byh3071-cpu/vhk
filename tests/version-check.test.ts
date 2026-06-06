import { describe, it, expect, vi, beforeEach } from 'vitest'

// version-check.ts 는 node:fs/os default import + readJsonFile + safeExecFile + getVhkVersion 사용.
const mockSafeExecFile = vi.fn()
const mockExistsSync = vi.fn()
const mockReadJsonFile = vi.fn()
const mockWriteFileSync = vi.fn()
const mockMkdirSync = vi.fn()

vi.mock('node:fs', () => ({
  default: {
    existsSync: (...a: unknown[]) => mockExistsSync(...a),
    writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
    mkdirSync: (...a: unknown[]) => mockMkdirSync(...a),
  },
}))
vi.mock('node:os', () => ({ default: { homedir: () => '/home/test' } }))
vi.mock('../src/lib/read-json.js', () => ({
  readJsonFile: (...a: unknown[]) => mockReadJsonFile(...a),
}))
vi.mock('../src/lib/version.js', () => ({ getVhkVersion: () => '2.4.0' }))
vi.mock('../src/lib/exec.js', () => ({
  safeExecFile: (...a: unknown[]) => mockSafeExecFile(...a),
  NETWORK_EXEC_TIMEOUT_MS: 30_000,
}))

const NOW = 1_700_000_000_000
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

beforeEach(() => {
  vi.clearAllMocks()
  mockExistsSync.mockReturnValue(false)
})

describe('compareSemver', () => {
  it('major/minor/patch 비교 + v 접두사 + pre-release 무시', async () => {
    const { compareSemver } = await import('../src/lib/version-check.js')
    expect(compareSemver('2.5.0', '2.4.0')).toBeGreaterThan(0)
    expect(compareSemver('2.4.0', '2.4.0')).toBe(0)
    expect(compareSemver('2.4.0', '2.4.1')).toBeLessThan(0)
    expect(compareSemver('v2.4.0', '2.4.0')).toBe(0)
    expect(compareSemver('2.4.0-beta.1', '2.4.0')).toBe(0) // pre-release 태그 무시
    expect(compareSemver('3.0.0', '2.9.9')).toBeGreaterThan(0)
  })
})

describe('getUpdateInfo — 가끔 자동 확인', () => {
  it('① 캐시 신선 + 최신>현재 → updateAvailable, 네트워크 0', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadJsonFile.mockReturnValue({ latest: '2.5.0', checkedAt: NOW })
    const { getUpdateInfo } = await import('../src/lib/version-check.js')
    const info = getUpdateInfo(NOW)
    expect(info).toEqual({ current: '2.4.0', latest: '2.5.0', updateAvailable: true })
    expect(mockSafeExecFile).not.toHaveBeenCalled() // 네트워크 0
  })

  it('② 캐시 신선 + 동일 버전 → updateAvailable false', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadJsonFile.mockReturnValue({ latest: '2.4.0', checkedAt: NOW })
    const { getUpdateInfo } = await import('../src/lib/version-check.js')
    expect(getUpdateInfo(NOW).updateAvailable).toBe(false)
    expect(mockSafeExecFile).not.toHaveBeenCalled()
  })

  it('③ 만료 + 쿨다운 지남 → 1회 조회 + 캐시 갱신 + 표시', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadJsonFile.mockReturnValue({ latest: '2.4.0', checkedAt: NOW - 25 * HOUR })
    mockSafeExecFile.mockReturnValue({ ok: true, out: '2.6.0' })
    const { getUpdateInfo } = await import('../src/lib/version-check.js')
    const info = getUpdateInfo(NOW)
    expect(mockSafeExecFile).toHaveBeenCalledTimes(1)
    expect(info.latest).toBe('2.6.0')
    expect(info.updateAvailable).toBe(true)
    expect(mockWriteFileSync).toHaveBeenCalled() // 캐시 갱신
  })

  it('④ 만료 + 조회 실패 → lastTriedAt 기록 + 이전 latest 유지', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadJsonFile.mockReturnValue({ latest: '2.5.0', checkedAt: NOW - 25 * HOUR })
    mockSafeExecFile.mockReturnValue({ ok: false, err: 'offline', out: '' })
    const { getUpdateInfo } = await import('../src/lib/version-check.js')
    const info = getUpdateInfo(NOW)
    expect(info.latest).toBe('2.5.0') // 이전 값 유지
    expect(info.updateAvailable).toBe(true)
    expect(mockWriteFileSync).toHaveBeenCalled() // lastTriedAt 갱신
  })

  it('⑤ 만료 + 쿨다운 내 → 네트워크 0, 이전 값', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadJsonFile.mockReturnValue({
      latest: '2.5.0',
      checkedAt: NOW - 25 * HOUR,
      lastTriedAt: NOW - 30 * 60 * 1000, // 30분 전(쿨다운 1h 내)
    })
    const { getUpdateInfo } = await import('../src/lib/version-check.js')
    const info = getUpdateInfo(NOW)
    expect(mockSafeExecFile).not.toHaveBeenCalled()
    expect(info.latest).toBe('2.5.0')
  })

  it('⑥ 캐시 없음 + 조회 실패 → latest undefined, 크래시 0', async () => {
    mockExistsSync.mockReturnValue(false)
    mockSafeExecFile.mockReturnValue({ ok: false, err: 'offline', out: '' })
    const { getUpdateInfo } = await import('../src/lib/version-check.js')
    const info = getUpdateInfo(NOW)
    expect(info).toEqual({ current: '2.4.0', latest: undefined, updateAvailable: false })
    expect(mockWriteFileSync).not.toHaveBeenCalled() // 캐시 없으면 write 안 함
  })

  it('⑦ 캐시 JSON 손상 → readCache null, throw 0 (알림만 생략)', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadJsonFile.mockImplementation(() => {
      throw new Error('bad json')
    })
    mockSafeExecFile.mockReturnValue({ ok: false, err: 'offline', out: '' })
    const { getUpdateInfo } = await import('../src/lib/version-check.js')
    const info = getUpdateInfo(NOW)
    expect(info.current).toBe('2.4.0')
    expect(info.updateAvailable).toBe(false)
  })

  it('스키마 불일치(latest 숫자) → readCache null', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadJsonFile.mockReturnValue({ latest: 123, checkedAt: NOW })
    mockSafeExecFile.mockReturnValue({ ok: false, err: 'x', out: '' })
    const { getUpdateInfo } = await import('../src/lib/version-check.js')
    expect(getUpdateInfo(NOW).latest).toBeUndefined()
  })
})

describe('recordLatest / writeCache', () => {
  it('⑧ recordLatest → ~/.vhk mkdir + writeFileSync 올바른 payload', async () => {
    const { recordLatest } = await import('../src/lib/version-check.js')
    recordLatest('2.7.0', NOW)
    expect(mockMkdirSync).toHaveBeenCalledWith(expect.stringContaining('.vhk'), { recursive: true })
    const call = mockWriteFileSync.mock.calls[0]
    expect(String(call[0])).toContain('version-check.json')
    const payload = JSON.parse(String(call[1]))
    expect(payload).toEqual({ latest: '2.7.0', checkedAt: NOW, lastTriedAt: NOW })
  })

  it('⑨ writeFileSync throw 해도 recordLatest 는 throw 0', async () => {
    mockWriteFileSync.mockImplementation(() => {
      throw new Error('EACCES')
    })
    const { recordLatest } = await import('../src/lib/version-check.js')
    expect(() => recordLatest('2.7.0', NOW)).not.toThrow()
  })
})

describe('isStale', () => {
  it('TTL 경계: 정확히 24h false, 24h+1ms true', async () => {
    const { isStale } = await import('../src/lib/version-check.js')
    expect(isStale({ latest: '1.0.0', checkedAt: NOW - DAY }, NOW)).toBe(false)
    expect(isStale({ latest: '1.0.0', checkedAt: NOW - DAY - 1 }, NOW)).toBe(true)
  })
})
