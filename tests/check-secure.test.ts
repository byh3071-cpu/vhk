import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  loadGitignore,
  isPathIgnored,
  findExposedSensitiveFiles,
  checkProjectSecurity,
  filterTrackedPaths,
} from '../src/lib/check-secure.js'

describe('check-secure', () => {
  it('.gitignore에 있는 경로는 ignore된다', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-secure-'))
    fs.writeFileSync(path.join(tmp, '.gitignore'), 'node_modules/\n.env\n')
    const ig = loadGitignore(tmp)

    expect(isPathIgnored(ig, 'node_modules/pkg/index.js')).toBe(true)
    expect(isPathIgnored(ig, '.env')).toBe(true)
    expect(isPathIgnored(ig, 'src/index.ts')).toBe(false)

    fs.rmSync(tmp, { recursive: true })
  })

  it('ignore 안 된 .env를 exposed로 찾는다', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-secure-'))
    fs.writeFileSync(path.join(tmp, '.gitignore'), 'node_modules/\n')
    fs.writeFileSync(path.join(tmp, '.env'), 'SECRET=1')

    const exposed = findExposedSensitiveFiles(tmp)
    expect(exposed).toContain('.env')

    fs.rmSync(tmp, { recursive: true })
  })

  it('checkProjectSecurity — .gitignore 없으면 warning', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-secure-'))
    const result = checkProjectSecurity(tmp)

    expect(result.missingGitignore).toBe(true)
    expect(result.ok).toBe(false)

    fs.rmSync(tmp, { recursive: true })
  })

  it('filterTrackedPaths — node_modules 제외', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-secure-'))
    fs.writeFileSync(path.join(tmp, '.gitignore'), 'node_modules/\n')

    const filtered = filterTrackedPaths(
      ['src/a.ts', 'node_modules/x.js'],
      tmp
    )
    expect(filtered).toEqual(['src/a.ts'])

    fs.rmSync(tmp, { recursive: true })
  })
})
