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

describe('#152 — Cloudflare Pages vs Workers 감지', () => {
  it('wrangler.toml 에 pages_build_output_dir → Pages', async () => {
    const { isCloudflarePages } = await import('../src/commands/deploy.js')
    expect(isCloudflarePages('name = "x"\npages_build_output_dir = "dist"\n', {})).toBe(true)
  })
  it('wrangler.toml 에 [pages] 섹션 → Pages', async () => {
    const { isCloudflarePages } = await import('../src/commands/deploy.js')
    expect(isCloudflarePages('[pages]\n', {})).toBe(true)
  })
  it('deploy 스크립트가 wrangler pages deploy → Pages', async () => {
    const { isCloudflarePages } = await import('../src/commands/deploy.js')
    expect(isCloudflarePages(null, { 'deploy:cf': 'npx wrangler pages deploy dist' })).toBe(true)
  })
  it('일반 wrangler.toml(Workers) → Pages 아님', async () => {
    const { isCloudflarePages } = await import('../src/commands/deploy.js')
    expect(isCloudflarePages('name = "worker"\nmain = "src/index.ts"\n', {})).toBe(false)
  })

  it('cloudflareDeployConfig: Pages → npx wrangler pages deploy', async () => {
    const { cloudflareDeployConfig } = await import('../src/commands/deploy.js')
    const c = cloudflareDeployConfig('pages_build_output_dir = "dist"', {})
    expect(c.name).toContain('Pages')
    expect(c.command).toBe('npx')
    expect(c.commandArgs).toEqual(['wrangler', 'pages', 'deploy'])
  })
  it('cloudflareDeployConfig: Workers → npx wrangler deploy', async () => {
    const { cloudflareDeployConfig } = await import('../src/commands/deploy.js')
    const c = cloudflareDeployConfig('main = "src/index.ts"', {})
    expect(c.name).toContain('Workers')
    expect(c.command).toBe('npx')
    expect(c.commandArgs).toEqual(['wrangler', 'deploy'])
  })
})
