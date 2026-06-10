import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isScannableFileName, walkProjectFiles, MAX_SCAN_FILE_BYTES } from '../src/lib/scan-files.js'

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

  // #170: .cursor 는 tracked 에이전트 설정 디렉터리 → walk 대상 (캐시는 gitignore 가 거름)
  it('.cursor/mcp.json 은 walk 대상에 포함', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-scan-cursor-'))
    fs.mkdirSync(path.join(tmp, '.cursor'), { recursive: true })
    fs.writeFileSync(path.join(tmp, '.cursor', 'mcp.json'), '{}\n')

    const scanned: string[] = []
    walkProjectFiles(tmp, (_abs, rel) => scanned.push(rel))

    expect(scanned).toContain('.cursor/mcp.json')

    fs.rmSync(tmp, { recursive: true })
  })

  // Goal 59: 512KB 초과 파일은 스캔 스킵 + onSkippedLargeFile 콜백으로 신호(불완전 스캔 가시화).
  it('512KB 초과 파일은 스킵하고 onSkippedLargeFile 콜백 호출', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-scan-big-'))
    try {
      fs.writeFileSync(path.join(tmp, 'big.js'), 'x'.repeat(MAX_SCAN_FILE_BYTES + 1), 'utf-8')
      fs.writeFileSync(path.join(tmp, 'small.js'), 'const x = 1\n', 'utf-8')

      const scanned: string[] = []
      const skipped: string[] = []
      walkProjectFiles(tmp, (_abs, rel) => scanned.push(rel), undefined, (rel) => skipped.push(rel))

      expect(scanned).toContain('small.js')
      expect(scanned).not.toContain('big.js')
      expect(skipped).toEqual(['big.js'])
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})
