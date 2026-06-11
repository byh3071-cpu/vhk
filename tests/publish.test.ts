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

  // 회귀: publish 가 CLAUDE.md 버전줄을 범프하는데 gitPostRelease 가 스테이징 안 하면
  // 릴리즈 커밋에 package.json(신버전) ↔ CLAUDE.md(구버전) 불일치가 박혀 CI version-sync 가 깨진다.
  it('CLAUDE.md 존재 시 git add 에 포함 (릴리즈 커밋 version-sync 정합)', async () => {
    mockExistsSync.mockReturnValue(true)
    mockGit()
    const { gitPostRelease } = await import('../src/commands/publish.js')
    gitPostRelease('2.4.0')
    const addCall = exec.mock.calls.find((c) => (c[1] as string[])[0] === 'add')
    expect(addCall, 'git add 호출이 있어야 함').toBeDefined()
    expect(addCall![1]).toContain('package.json')
    expect(addCall![1]).toContain('CHANGELOG.md')
    expect(addCall![1]).toContain('CLAUDE.md')
  })
})

describe('evaluatePublishPreflight — 발행 전 브랜치/clean 가드 (2.3.1 오발행 재발 방지)', () => {
  it('default 브랜치 + clean → ok', async () => {
    const { evaluatePublishPreflight } = await import('../src/commands/publish.js')
    expect(evaluatePublishPreflight('main', '', 'main')).toEqual({ ok: true })
  })

  it('feature 브랜치 → wrong-branch 차단 (이번 2.3.1 오발행 원인)', async () => {
    const { evaluatePublishPreflight } = await import('../src/commands/publish.js')
    const r = evaluatePublishPreflight('feat/goal-20-evolve', '', 'main')
    expect(r.ok).toBe(false)
    expect(r.code).toBe('wrong-branch')
  })

  it('tracked 미커밋 변경 → dirty 차단', async () => {
    const { evaluatePublishPreflight } = await import('../src/commands/publish.js')
    const r = evaluatePublishPreflight('main', ' M src/x.ts', 'main')
    expect(r.ok).toBe(false)
    expect(r.code).toBe('dirty')
  })

  it('detached HEAD(빈 브랜치) → wrong-branch 차단', async () => {
    const { evaluatePublishPreflight } = await import('../src/commands/publish.js')
    expect(evaluatePublishPreflight('', '', 'main').code).toBe('wrong-branch')
  })

  it('브랜치 위반 우선 — feature + dirty 면 wrong-branch 먼저', async () => {
    const { evaluatePublishPreflight } = await import('../src/commands/publish.js')
    expect(evaluatePublishPreflight('feat/x', ' M a', 'main').code).toBe('wrong-branch')
  })

  it('master 등 다른 default 도 인식 (하드코딩 아님)', async () => {
    const { evaluatePublishPreflight } = await import('../src/commands/publish.js')
    expect(evaluatePublishPreflight('master', '', 'master')).toEqual({ ok: true })
    expect(evaluatePublishPreflight('main', '', 'master').code).toBe('wrong-branch')
  })
})

describe('publishPreflight — git 수집 + default 브랜치 추출', () => {
  const exec = vi.mocked(safeExecFile)

  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('origin/HEAD 에서 default 추출 + feature 브랜치 차단', async () => {
    exec.mockImplementation((_c: string, args: string[]) => {
      if (args[0] === 'branch') return { ok: true, out: 'feat/x' }
      if (args[0] === 'symbolic-ref') return { ok: true, out: 'origin/main' }
      if (args[0] === 'status') return { ok: true, out: '' }
      return { ok: true, out: '' }
    })
    const { publishPreflight } = await import('../src/commands/publish.js')
    const r = publishPreflight()
    expect(r.defaultBranch).toBe('main')
    expect(r.branch).toBe('feat/x')
    expect(r.ok).toBe(false)
    expect(r.code).toBe('wrong-branch')
  })

  it('origin/HEAD 감지 실패 → main fallback + main 이면 통과', async () => {
    exec.mockImplementation((_c: string, args: string[]) => {
      if (args[0] === 'branch') return { ok: true, out: 'main' }
      if (args[0] === 'symbolic-ref') return { ok: false, err: 'no remote', out: '' }
      if (args[0] === 'status') return { ok: true, out: '' }
      return { ok: true, out: '' }
    })
    const { publishPreflight } = await import('../src/commands/publish.js')
    const r = publishPreflight()
    expect(r.defaultBranch).toBe('main')
    expect(r.ok).toBe(true)
  })

  it('default 브랜치인데 tracked 변경 있으면 dirty 차단', async () => {
    exec.mockImplementation((_c: string, args: string[]) => {
      if (args[0] === 'branch') return { ok: true, out: 'main' }
      if (args[0] === 'symbolic-ref') return { ok: true, out: 'origin/main' }
      if (args[0] === 'status') return { ok: true, out: ' M src/x.ts' }
      return { ok: true, out: '' }
    })
    const { publishPreflight } = await import('../src/commands/publish.js')
    const r = publishPreflight()
    expect(r.ok).toBe(false)
    expect(r.code).toBe('dirty')
  })

  it('git status 실패는 clean 단정하지 않고 차단 — fail-closed (리뷰 A3-04)', async () => {
    exec.mockImplementation((_c: string, args: string[]) => {
      if (args[0] === 'branch') return { ok: true, out: 'main' }
      if (args[0] === 'symbolic-ref') return { ok: true, out: 'origin/main' }
      if (args[0] === 'status') return { ok: false, err: 'fatal', out: '' }
      return { ok: true, out: '' }
    })
    const { publishPreflight } = await import('../src/commands/publish.js')
    const r = publishPreflight()
    expect(r.ok).toBe(false)
    expect(r.code).toBe('status-failed')
  })

  it('untracked src 신규 파일은 빌드에 포함돼 발행되므로 차단 (리뷰 A3-01)', async () => {
    exec.mockImplementation((_c: string, args: string[]) => {
      if (args[0] === 'branch') return { ok: true, out: 'main' }
      if (args[0] === 'symbolic-ref') return { ok: true, out: 'origin/main' }
      if (args[0] === 'status') return { ok: true, out: '' }
      if (args[0] === 'ls-files') return { ok: true, out: 'src/commands/new-feature.ts\n' }
      return { ok: true, out: '' }
    })
    const { publishPreflight } = await import('../src/commands/publish.js')
    const r = publishPreflight()
    expect(r.ok).toBe(false)
    expect(r.code).toBe('untracked-src')
    expect(r.untrackedSrc).toEqual(['src/commands/new-feature.ts'])
  })

  it('untracked가 src 밖(plan 문서 등)이면 통과 유지 — ls-files가 src 한정', async () => {
    exec.mockImplementation((_c: string, args: string[]) => {
      if (args[0] === 'branch') return { ok: true, out: 'main' }
      if (args[0] === 'symbolic-ref') return { ok: true, out: 'origin/main' }
      if (args[0] === 'status') return { ok: true, out: '' }
      if (args[0] === 'ls-files') {
        expect(args).toContain('src') // src 경로 한정 호출 계약
        return { ok: true, out: '' }
      }
      return { ok: true, out: '' }
    })
    const { publishPreflight } = await import('../src/commands/publish.js')
    expect(publishPreflight().ok).toBe(true)
  })

  // 자동화 D — CHANGELOG 스텁 삽입(순수함수)
  const CL = '# Changelog\n\n## [Unreleased]\n\n## [2.3.0] - 2026-06-04\n\n> 기존 항목\n'

  it('insertChangelogStub: 신버전 스텁을 첫 릴리즈 항목 앞(Unreleased 다음)에 삽입', async () => {
    const { insertChangelogStub } = await import('../src/commands/publish.js')
    const out = insertChangelogStub(CL, '2.4.0', '2026-06-05')
    expect(out).toContain('## [2.4.0] - 2026-06-05')
    // 2.4.0 이 2.3.0 보다 앞에 와야 함(최신순)
    expect(out.indexOf('## [2.4.0]')).toBeLessThan(out.indexOf('## [2.3.0]'))
    // Unreleased 는 여전히 맨 위
    expect(out.indexOf('## [Unreleased]')).toBeLessThan(out.indexOf('## [2.4.0]'))
  })

  it('insertChangelogStub: 이미 해당 버전 항목 있으면 원본 그대로(멱등)', async () => {
    const { insertChangelogStub } = await import('../src/commands/publish.js')
    expect(insertChangelogStub(CL, '2.3.0', '2026-06-05')).toBe(CL)
  })

  it('insertChangelogStub: 버전 항목이 하나도 없으면 끝에 덧붙임', async () => {
    const { insertChangelogStub } = await import('../src/commands/publish.js')
    const bare = '# Changelog\n\n## [Unreleased]\n'
    const out = insertChangelogStub(bare, '1.0.0', '2026-06-05')
    expect(out).toContain('## [1.0.0] - 2026-06-05')
  })
})

// 회귀: publish 가 package.json 만 범프하고 CLAUDE.md "**버전:**" 줄은 안 올려서
// version-sync.test.ts 게이트가 항상 깨지던 자기방해 버그(8dca545 가드 도입 후).
describe('bumpClaudeMdVersion — CLAUDE.md "**버전:**" 줄 동기화 (publish ↔ version-sync 정합)', () => {
  it('버전 번호만 교체하고 뒤 설명 텍스트는 보존', async () => {
    const { bumpClaudeMdVersion } = await import('../src/commands/publish.js')
    const md = '# h\n\n- **버전:** v2.3.2 (npm latest) — 사실 확인은 package.json\n\n본문\n'
    const out = bumpClaudeMdVersion(md, '2.4.0')
    expect(out).toContain('**버전:** v2.4.0 (npm latest) — 사실 확인은 package.json')
    expect(out).not.toContain('v2.3.2')
    expect(out).toContain('본문')
  })

  it('범프 후 version-sync 가드 정규식이 새 버전을 추출 (게이트 통과 보장)', async () => {
    const { bumpClaudeMdVersion } = await import('../src/commands/publish.js')
    const md = '- **버전:** v2.3.2 (npm latest)\n'
    const out = bumpClaudeMdVersion(md, '2.4.0')
    const m = out.match(/\*\*버전:\*\*\s*v(\d+\.\d+\.\d+)/)
    expect(m![1]).toBe('2.4.0')
  })

  it('"**버전:**" 줄 없으면 원본 그대로(graceful no-op)', async () => {
    const { bumpClaudeMdVersion } = await import('../src/commands/publish.js')
    const md = '# 헌법\n버전 줄 없음\n'
    expect(bumpClaudeMdVersion(md, '2.4.0')).toBe(md)
  })
})
