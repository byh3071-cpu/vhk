import { describe, it, expect, vi, beforeEach } from 'vitest'
import { safeExecFile } from '../src/lib/exec.js'

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

describe('publish — gitPostRelease (commit 실패 시 tag 미생성)', () => {
  const exec = vi.mocked(safeExecFile)

  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  // git 서브커맨드별로 ok/실패를 제어하는 헬퍼
  function mockGit(failOn: Record<string, boolean> = {}) {
    exec.mockImplementation((_cmd: string, args: string[]) => {
      const sub = args[0]
      const join = args.join(' ')
      // push --tags 는 push 와 구분
      const key = sub === 'push' && args[1] === '--tags' ? 'push-tags' : sub
      if (failOn[key]) return { ok: false, err: `${join} 실패`, out: '' }
      return { ok: true, out: '' }
    })
  }

  it('모두 성공: added/committed/tagged/pushed 전부 true, warning 없음', async () => {
    mockGit()
    const { gitPostRelease } = await import('../src/commands/publish.js')
    const r = gitPostRelease('1.5.0')
    expect(r).toEqual({ added: true, committed: true, tagged: true, pushed: true })
  })

  it('commit 실패 시: tagged=false 이고 git tag 가 호출되지 않는다', async () => {
    mockGit({ commit: true })
    const { gitPostRelease } = await import('../src/commands/publish.js')
    const r = gitPostRelease('1.5.0')
    expect(r.committed).toBe(false)
    expect(r.tagged).toBe(false)
    expect(r.pushed).toBe(false)
    expect(r.warning).toContain('git commit 실패')
    // 핵심: 잘못된 HEAD 에 태그가 박히지 않도록 tag 호출 자체가 없어야 함
    const tagCalled = exec.mock.calls.some(c => (c[1] as string[])[0] === 'tag')
    expect(tagCalled).toBe(false)
    const pushCalled = exec.mock.calls.some(c => (c[1] as string[])[0] === 'push')
    expect(pushCalled).toBe(false)
  })

  it('add 실패 시: commit/tag/push 미호출 + 경고', async () => {
    mockGit({ add: true })
    const { gitPostRelease } = await import('../src/commands/publish.js')
    const r = gitPostRelease('1.5.0')
    expect(r.added).toBe(false)
    expect(r.warning).toContain('git add 실패')
    const subs = exec.mock.calls.map(c => (c[1] as string[])[0])
    expect(subs).not.toContain('commit')
    expect(subs).not.toContain('tag')
  })

  it('tag 실패 시: committed=true, tagged=false, push 미호출', async () => {
    mockGit({ tag: true })
    const { gitPostRelease } = await import('../src/commands/publish.js')
    const r = gitPostRelease('1.5.0')
    expect(r.committed).toBe(true)
    expect(r.tagged).toBe(false)
    expect(r.warning).toContain('git tag 생성 실패')
    const pushCalled = exec.mock.calls.some(c => (c[1] as string[])[0] === 'push')
    expect(pushCalled).toBe(false)
  })

  it('push 실패 시: tagged=true 이지만 pushed=false (tag 는 로컬에 남음)', async () => {
    mockGit({ 'push-tags': true })
    const { gitPostRelease } = await import('../src/commands/publish.js')
    const r = gitPostRelease('1.5.0')
    expect(r.tagged).toBe(true)
    expect(r.pushed).toBe(false)
    expect(r.warning).toBeUndefined()
  })
})
