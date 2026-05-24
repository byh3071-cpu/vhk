import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExistsSync = vi.fn()
const mockReadFileSync = vi.fn()

vi.mock('node:fs', () => ({
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
}))

describe('getVhkVersion', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.resetModules()
  })

  it('package.json에서 버전을 읽어 반환한다', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: '0.10.0' }))
    const { getVhkVersion } = await import('../src/lib/version.js')
    expect(getVhkVersion()).toBe('0.10.0')
  })

  it('package.json이 없으면 0.0.0을 반환한다', async () => {
    mockExistsSync.mockReturnValue(false)
    const { getVhkVersion } = await import('../src/lib/version.js')
    expect(getVhkVersion()).toBe('0.0.0')
  })

  it('package.json이 깨졌어도 throw하지 않고 0.0.0을 반환한다', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('{ invalid json')
    const { getVhkVersion } = await import('../src/lib/version.js')
    expect(getVhkVersion()).toBe('0.0.0')
  })

  it('BOM 포함 package.json도 안전하게 파싱한다 (stripBom)', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('﻿' + JSON.stringify({ version: '1.0.0' }))
    const { getVhkVersion } = await import('../src/lib/version.js')
    expect(getVhkVersion()).toBe('1.0.0')
  })
})
