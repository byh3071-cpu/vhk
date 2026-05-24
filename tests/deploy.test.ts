import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExistsSync = vi.fn()

vi.mock('node:fs', () => ({
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
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

describe('deploy', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('모듈을 import 할 수 있다', async () => {
    const mod = await import('../src/commands/deploy.js')
    expect(mod.deploy).toBeDefined()
    expect(mod.detectPlatform).toBeDefined()
  })

  it('detectPlatform: vercel.json 있으면 vercel 반환', async () => {
    const { detectPlatform } = await import('../src/commands/deploy.js')
    mockExistsSync.mockImplementation((p: unknown) => String(p) === 'vercel.json')
    expect(detectPlatform()).toBe('vercel')
  })

  it('detectPlatform: netlify.toml 있으면 netlify 반환', async () => {
    const { detectPlatform } = await import('../src/commands/deploy.js')
    mockExistsSync.mockImplementation((p: unknown) => String(p) === 'netlify.toml')
    expect(detectPlatform()).toBe('netlify')
  })

  it('detectPlatform: wrangler.toml 있으면 cloudflare 반환', async () => {
    const { detectPlatform } = await import('../src/commands/deploy.js')
    mockExistsSync.mockImplementation((p: unknown) => String(p) === 'wrangler.toml')
    expect(detectPlatform()).toBe('cloudflare')
  })

  it('detectPlatform: 아무것도 없으면 null', async () => {
    const { detectPlatform } = await import('../src/commands/deploy.js')
    mockExistsSync.mockReturnValue(false)
    expect(detectPlatform()).toBeNull()
  })
})
