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
import { removeDirSync } from '../src/lib/fs-remove.js'

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
    removeDirSync(d)
  })

  // #559: 소스 옆에 둔 테스트(src/lib/foo.test.ts)를 tests/ 만 보면 못 찾아
  // 실제로는 테스트가 있는 파일을 "테스트 없음"으로 보고했다.
  it('소스와 같은 위치에 둔 테스트도 수집한다 (#559)', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-tm-colocated-'))
    fs.mkdirSync(path.join(d, 'tests'), { recursive: true })
    fs.mkdirSync(path.join(d, 'src', 'lib'), { recursive: true })
    fs.writeFileSync(path.join(d, 'tests', 'in-tests-dir.test.ts'), '')
    fs.writeFileSync(path.join(d, 'src', 'lib', 'colocated.test.ts'), '')
    fs.writeFileSync(path.join(d, 'src', 'lib', 'colocated.ts'), '')

    const set = collectTestBasenames(path.join(d, 'tests'), d)
    expect(set.has('in-tests-dir.test.ts')).toBe(true)
    expect(set.has('colocated.test.ts')).toBe(true)
    expect(findUntested(['src/lib/colocated.ts'], set)).toEqual([])

    removeDirSync(d)
  })

  it('rootDir 를 안 주면 종전대로 tests/ 만 본다 (기존 호출부 하위호환)', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-tm-compat-'))
    fs.mkdirSync(path.join(d, 'tests'), { recursive: true })
    fs.writeFileSync(path.join(d, 'tests', 'only.test.ts'), '')
    const set = collectTestBasenames(path.join(d, 'tests'))
    expect(set.has('only.test.ts')).toBe(true)
    expect(set.size).toBe(1)
    removeDirSync(d)
  })
})
