import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { discoverProjects } from '../src/lib/workspaces.js'

function tmp(): string {
  const d = join(tmpdir(), `vhk-ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  mkdirSync(d, { recursive: true })
  return d
}
function pkg(dir: string, obj: object): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify(obj), 'utf-8')
}

describe('discoverProjects (#171)', () => {
  let root: string
  beforeEach(() => { root = tmp() })
  afterEach(() => { rmSync(root, { recursive: true, force: true }) })

  it('루트만 있으면 루트 1개 (scripts 보존)', () => {
    pkg(root, { name: 'root', scripts: { build: 'x' } })
    const ps = discoverProjects(root)
    expect(ps.map((p) => p.path)).toEqual(['.'])
    expect(ps[0].scripts.build).toBe('x')
  })

  it('중첩 package.json(dashboard/) 을 발견', () => {
    pkg(root, { name: 'root' })
    pkg(join(root, 'dashboard'), { name: 'dash', scripts: { lint: 'eslint' } })
    const ps = discoverProjects(root)
    expect(ps.map((p) => p.path).sort()).toEqual(['.', 'dashboard'])
    expect(ps.find((p) => p.path === 'dashboard')?.scripts.lint).toBe('eslint')
  })

  it('node_modules·.git·dist 는 스캔 제외', () => {
    pkg(root, { name: 'root' })
    pkg(join(root, 'node_modules', 'dep'), { name: 'dep' })
    pkg(join(root, 'dist'), { name: 'built' })
    pkg(join(root, '.git', 'x'), { name: 'g' })
    const ps = discoverProjects(root)
    expect(ps.map((p) => p.path)).toEqual(['.'])
  })

  it('vhk.projects 명시 오버라이드 시 그 경로 + 루트만 (자동스캔 무시)', () => {
    pkg(root, { name: 'root', vhk: { projects: ['apps/web'] } })
    pkg(join(root, 'apps', 'web'), { name: 'web' })
    pkg(join(root, 'other'), { name: 'other' }) // 오버라이드면 자동스캔 제외돼 안 잡혀야
    const ps = discoverProjects(root)
    expect(ps.map((p) => p.path).sort()).toEqual(['.', 'apps/web'])
  })

  it('package.json 없는 디렉터리는 무시', () => {
    pkg(root, { name: 'root' })
    mkdirSync(join(root, 'docs'), { recursive: true })
    const ps = discoverProjects(root)
    expect(ps.map((p) => p.path)).toEqual(['.'])
  })

  it('루트에 package.json 없으면 빈 배열', () => {
    const ps = discoverProjects(root)
    expect(ps).toEqual([])
  })
})
