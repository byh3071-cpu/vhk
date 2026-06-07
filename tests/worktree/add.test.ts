import { describe, it, expect } from 'vitest'
import { addWorktree, sanitizeBranchToDir, type AddDeps } from '../../src/worktree/add.js'
import type { CopyItem, CopyResult } from '../../src/worktree/types.js'

function mkDeps(over: Partial<AddDeps> = {}): { deps: AddDeps; calls: string[] } {
  const calls: string[] = []
  const items: CopyItem[] = [{ source: '/s/.env', target: '/t/.env', kind: 'env' }]
  const deps: AddDeps = {
    sourceDir: '/repo',
    run: (cmd, args) => {
      calls.push(`${cmd} ${args.join(' ')}`)
      return { ok: true, out: '' }
    },
    exists: () => false,
    resolveTargetPath: () => '/repo-feat-x',
    collectItems: () => items,
    copyAll: (its): CopyResult[] => its.map((it) => ({ item: it, status: 'copied', keyCount: 1, detail: '1 keys' })),
    ...over,
  }
  return { deps, calls }
}

describe('sanitizeBranchToDir', () => {
  it('슬래시·특수문자를 - 로 정규화', () => {
    expect(sanitizeBranchToDir('vhk', 'feat/login')).toBe('vhk-feat-login')
    expect(sanitizeBranchToDir('vhk', 'fix/a@b#c')).toBe('vhk-fix-a-b-c')
  })
})

describe('addWorktree', () => {
  it('대상 경로 이미 있으면 안전 중단 — git 호출 안 함', () => {
    const { deps, calls } = mkDeps({ exists: () => true })
    const r = addWorktree('feat/x', {}, deps)
    expect(r.status).toBe('aborted-exists')
    expect(calls).toEqual([]) // git worktree add 호출 없음
    expect(r.copies).toEqual([])
  })

  it('정상 → git worktree add 후 복사', () => {
    const { deps, calls } = mkDeps()
    const r = addWorktree('feat/x', {}, deps)
    expect(r.status).toBe('created')
    expect(calls[0]).toContain('git worktree add')
    expect(r.copies).toHaveLength(1)
    expect(r.copies[0].status).toBe('copied')
  })

  it('git 실패 → git-failed, 복사 안 함', () => {
    let copied = false
    const { deps } = mkDeps({
      run: () => ({ ok: false, out: '', err: 'fatal' }),
      copyAll: (its) => { copied = true; return its.map((it) => ({ item: it, status: 'copied' as const, detail: '' })) },
    })
    const r = addWorktree('feat/x', {}, deps)
    expect(r.status).toBe('git-failed')
    expect(copied).toBe(false)
    // detail 은 순수 err — ko.worktree.gitFailed 가 접두사를 1회만 붙이도록(이중 접두사 방지)
    expect(r.detail).toBe('fatal')
  })

  it('--install 시 installRun(PM 주입) 우선 사용 — 대상 경로 전달', () => {
    let installedTp = ''
    const { deps } = mkDeps({ installRun: (tp) => { installedTp = tp; return { ok: true, out: '' } } })
    const r = addWorktree('feat/x', { install: true }, deps)
    expect(r.installed).toBe(true)
    expect(installedTp).toBe('/repo-feat-x')
  })

  it('--install + installRun 미주입 → pnpm 폴백(하위호환)', () => {
    const { deps, calls } = mkDeps()
    const r = addWorktree('feat/x', { install: true }, deps)
    expect(r.installed).toBe(true)
    expect(calls.some((c) => c.includes('pnpm') && c.includes('install') && c.includes('/repo-feat-x'))).toBe(true)
  })

  it('--install 없으면 pnpm 미호출', () => {
    const { deps, calls } = mkDeps()
    addWorktree('feat/x', {}, deps)
    expect(calls.some((c) => c.includes('pnpm'))).toBe(false)
  })
})
