import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { changedFeatureSources } from '../src/commands/testmap.js'

describe('changedFeatureSources (git porcelain 파싱)', () => {
  it('untracked 기능 소스 감지, 비-기능 제외', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-tmrepo-'))
    const g = (args: string[]): void => execFileSync('git', args, { cwd: d, stdio: 'pipe' })
    g(['init'])
    g(['config', 'user.email', 't@t'])
    g(['config', 'user.name', 't'])
    fs.mkdirSync(path.join(d, 'src', 'commands'), { recursive: true })
    fs.writeFileSync(path.join(d, 'src', 'commands', 'newcmd.ts'), 'export const x = 1\n')
    fs.writeFileSync(path.join(d, 'README.md'), 'hi\n') // 비-기능
    const changed = changedFeatureSources(d)
    expect(changed).toContain('src/commands/newcmd.ts')
    expect(changed.some((p) => p.includes('README'))).toBe(false)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('git 레포 아니면 빈 배열', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-nogit-'))
    expect(changedFeatureSources(d)).toEqual([])
    fs.rmSync(d, { recursive: true, force: true })
  })
})
