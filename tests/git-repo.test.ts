import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getGitRoot, gitOut, isGitRepo, hasCommits, countLocalCommits } from '../src/lib/git-repo.js'

function gitInit(d: string): void {
  const g = (args: string[]): void => execFileSync('git', args, { cwd: d, stdio: 'pipe' })
  g(['init'])
  g(['config', 'user.email', 't@t'])
  g(['config', 'user.name', 't'])
}
function makeRepo(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-gitrepo-'))
  gitInit(d)
  fs.writeFileSync(path.join(d, 'a.txt'), 'hi\n')
  execFileSync('git', ['add', '.'], { cwd: d, stdio: 'pipe' })
  execFileSync('git', ['commit', '-m', 'init'], { cwd: d, stdio: 'pipe' })
  return d
}

describe('git-repo (Goal 46 — safeExecFile 단일 통로)', () => {
  it('getGitRoot: 레포 → 루트 경로, cwd 존중', () => {
    const d = makeRepo()
    const root = getGitRoot(d)
    // realpath 로 비교(macOS /var→/private/var 등 symlink 정규화). Windows 는 동일.
    expect(fs.realpathSync(root)).toBe(fs.realpathSync(d))
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('getGitRoot: 레포 아님 → throw(기존 계약 보존)', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-nogit-'))
    expect(() => getGitRoot(d)).toThrow()
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('gitOut: porcelain 선행 공백 보존(raw — trim 안 함)', () => {
    const d = makeRepo()
    fs.writeFileSync(path.join(d, 'a.txt'), 'changed\n') // 추적 파일 수정(unstaged) → " M a.txt"
    const out = gitOut(['status', '--porcelain'], d)
    expect(out.startsWith(' M')).toBe(true) // 선행 공백 안 깎임(trim 됐으면 "M a.txt")
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('isGitRepo: 레포 true / 비-레포 false', () => {
    const d = makeRepo()
    expect(isGitRepo(d)).toBe(true)
    const n = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-nogit-'))
    expect(isGitRepo(n)).toBe(false)
    fs.rmSync(d, { recursive: true, force: true })
    fs.rmSync(n, { recursive: true, force: true })
  })

  it('hasCommits: 커밋 있으면 true, init 만(커밋 0) false', () => {
    const d = makeRepo()
    expect(hasCommits(d)).toBe(true)
    expect(countLocalCommits(d)).toBeGreaterThan(0)
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-empty-'))
    gitInit(empty) // init 만, 커밋 없음
    expect(hasCommits(empty)).toBe(false)
    fs.rmSync(d, { recursive: true, force: true })
    fs.rmSync(empty, { recursive: true, force: true })
  })
})
