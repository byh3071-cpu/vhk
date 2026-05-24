import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExistsSync = vi.fn()
const mockReadFileSync = vi.fn()
const mockWriteFileSync = vi.fn()

vi.mock('node:fs', () => ({
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
  writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
}))

vi.mock('inquirer', () => ({
  default: { prompt: vi.fn() },
}))

vi.mock('ora', () => ({
  default: () => ({
    start: () => ({ succeed: vi.fn(), fail: vi.fn() }),
  }),
}))

vi.mock('../src/lib/exec.js', () => ({
  safeExecFile: vi.fn(() => ({ ok: true, out: '' })),
}))

describe('publish', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('bumpVersion: patch 0.6.0 → 0.6.1', async () => {
    const { bumpVersion } = await import('../src/commands/publish.js')
    expect(bumpVersion('0.6.0', 'patch')).toBe('0.6.1')
  })

  it('bumpVersion: minor 0.6.5 → 0.7.0', async () => {
    const { bumpVersion } = await import('../src/commands/publish.js')
    expect(bumpVersion('0.6.5', 'minor')).toBe('0.7.0')
  })

  it('bumpVersion: major 0.6.5 → 1.0.0', async () => {
    const { bumpVersion } = await import('../src/commands/publish.js')
    expect(bumpVersion('0.6.5', 'major')).toBe('1.0.0')
  })

  it('bumpVersion: 1.2.3 patch → 1.2.4', async () => {
    const { bumpVersion } = await import('../src/commands/publish.js')
    expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4')
  })

  it('모듈을 import 할 수 있다', async () => {
    const mod = await import('../src/commands/publish.js')
    expect(mod.publish).toBeDefined()
    expect(mod.bumpVersion).toBeDefined()
  })
})
