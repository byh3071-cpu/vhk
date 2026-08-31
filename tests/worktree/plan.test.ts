import { describe, expect, it } from 'vitest'
import { basename, dirname, join, resolve } from 'node:path'
import { copyPreviewNames, decideWorktreeMutation, resolveWorktreeTarget } from '../../src/worktree/plan.js'

const repoRoot = resolve('/repo/sample-app')

describe('resolveWorktreeTarget', () => {
  it('기본은 형제 디렉터리', () => {
    expect(resolveWorktreeTarget({ repoRoot, branch: 'feat/login' })).toBe(
      join(dirname(repoRoot), 'sample-app-feat-login'),
    )
  })

  it('상대 --path 는 git 루트 기준', () => {
    expect(resolveWorktreeTarget({ repoRoot, branch: 'feat/login', pathOpt: '.worktrees/feat-login' })).toBe(
      resolve(repoRoot, '.worktrees/feat-login'),
    )
  })

  it('절대 --path 를 canonicalize 한다', () => {
    const abs = resolve('/approved/feat-login')
    expect(resolveWorktreeTarget({ repoRoot, branch: 'feat/login', pathOpt: abs })).toBe(abs)
  })

  it('--path 가 worktreeRoot 보다 우선', () => {
    expect(
      resolveWorktreeTarget({
        repoRoot,
        branch: 'feat/login',
        pathOpt: '.worktrees/custom',
        worktreeRoot: '.worktrees',
      }),
    ).toBe(resolve(repoRoot, '.worktrees/custom'))
  })

  it('worktreeRoot 아래 형제식 이름을 만든다', () => {
    expect(resolveWorktreeTarget({ repoRoot, branch: 'feat/login', worktreeRoot: '.worktrees' })).toBe(
      join(resolve(repoRoot, '.worktrees'), `${basename(repoRoot)}-feat-login`),
    )
  })
})

describe('decideWorktreeMutation', () => {
  it('--dry-run 은 TTY·--yes 보다 앞선다', () => {
    expect(decideWorktreeMutation({ dryRun: true, yes: true, stdinTty: true })).toBe('dry-run')
  })

  it('비-TTY 는 --yes 없이 거부', () => {
    expect(decideWorktreeMutation({ stdinTty: false })).toBe('need-yes')
  })

  it('--yes 는 비-TTY 에서 생성한다', () => {
    expect(decideWorktreeMutation({ yes: true, stdinTty: false })).toBe('mutate')
  })

  it('stdin TTY 는 미리보기 후 생성', () => {
    expect(decideWorktreeMutation({ stdinTty: true })).toBe('mutate')
  })
})

describe('copyPreviewNames', () => {
  it('빈 목록은 (none)', () => {
    expect(copyPreviewNames([])).toBe('(none)')
  })

  it('파일명만 이어 붙인다', () => {
    expect(copyPreviewNames(['.env', 'settings.json'])).toBe('.env, settings.json')
  })
})
