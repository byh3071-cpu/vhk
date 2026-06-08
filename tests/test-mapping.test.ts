import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  isFeatureSource,
  expectedTestBasename,
  findUntested,
  collectTestBasenames,
} from '../src/lib/test-mapping.js'

describe('test-mapping 순수 함수', () => {
  it('isFeatureSource: commands/lib .ts 만 true', () => {
    expect(isFeatureSource('src/commands/foo.ts')).toBe(true)
    expect(isFeatureSource('src/lib/bar.ts')).toBe(true)
    expect(isFeatureSource('src\\commands\\win.ts')).toBe(true) // Windows 경로
    expect(isFeatureSource('src/commands/foo.test.ts')).toBe(false)
    expect(isFeatureSource('src/types/x.ts')).toBe(false)
    expect(isFeatureSource('src/index.ts')).toBe(false) // src 루트는 기능 디렉터리 아님
    expect(isFeatureSource('README.md')).toBe(false)
  })

  it('expectedTestBasename: foo.ts → foo.test.ts', () => {
    expect(expectedTestBasename('src/commands/foo.ts')).toBe('foo.test.ts')
    expect(expectedTestBasename('src/lib/git-repo.ts')).toBe('git-repo.test.ts')
  })

  it('findUntested: 대응 테스트 없는 기능 소스만', () => {
    const tests = new Set(['foo.test.ts'])
    const r = findUntested(['src/commands/foo.ts', 'src/lib/bar.ts', 'src/types/x.ts'], tests)
    expect(r).toEqual(['src/lib/bar.ts']) // foo 는 있음, x 는 기능 아님
  })
})

describe('collectTestBasenames', () => {
  it('tests/ 재귀 스캔으로 *.test.ts basename 수집', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-tm-'))
    fs.mkdirSync(path.join(d, 'sub'), { recursive: true })
    fs.writeFileSync(path.join(d, 'a.test.ts'), '')
    fs.writeFileSync(path.join(d, 'sub', 'b.test.ts'), '')
    fs.writeFileSync(path.join(d, 'notatest.ts'), '')
    const set = collectTestBasenames(d)
    expect(set.has('a.test.ts')).toBe(true)
    expect(set.has('b.test.ts')).toBe(true)
    expect(set.has('notatest.ts')).toBe(false)
    fs.rmSync(d, { recursive: true, force: true })
  })
})
