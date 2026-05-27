import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isScannableFileName, walkProjectFiles } from '../src/lib/scan-files.js'

describe('scan-files', () => {
  it('lock 파일은 스캔 대상에서 제외', () => {
    expect(isScannableFileName('pnpm-lock.yaml')).toBe(false)
    expect(isScannableFileName('package-lock.json')).toBe(false)
  })

  it('node_modules는 walk에서 제외', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-scan-'))
    fs.mkdirSync(path.join(tmp, 'node_modules', 'pkg'), { recursive: true })
    // fake AWS key — 자기 레포 secure 스캔에 걸리지 않게 조각 합성 (regex contiguous 매칭만).
    fs.writeFileSync(
      path.join(tmp, 'node_modules', 'pkg', 'secret.js'),
      'AKIA' + 'IOSFODNN7EXAMPLE'
    )
    fs.mkdirSync(path.join(tmp, 'src'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'src', 'app.ts'), 'export {}\n')
    fs.writeFileSync(path.join(tmp, '.gitignore'), 'node_modules/\n')

    const scanned: string[] = []
    walkProjectFiles(tmp, (_abs, rel) => scanned.push(rel))

    expect(scanned.some(p => p.includes('node_modules'))).toBe(false)
    expect(scanned).toContain('src/app.ts')

    fs.rmSync(tmp, { recursive: true })
  })
})
