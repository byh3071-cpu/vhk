import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { detectNaturalLanguageInput } from '../src/lib/cli-args.js'
import { routeNaturalLanguage } from '../src/lib/nlp-router.js'
import { stripBom, readJsonFile } from '../src/lib/read-json.js'

describe('detectNaturalLanguageInput', () => {
  it('vhk (인자 없음) → null', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk'])).toBeNull()
  })

  it('vhk save → null', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', 'save'])).toBeNull()
  })

  it('vhk init --skip-gate → null', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', 'init', '--skip-gate'])).toBeNull()
  })

  it('vhk init --skip-gate --name vhk --type cli -y → null (옵션값 포함)', () => {
    expect(
      detectNaturalLanguageInput([
        'node', 'vhk', 'init',
        '--skip-gate', '--name', 'vhk', '--type', 'cli', '-y',
      ])
    ).toBeNull()
  })

  it('vhk recap --since 2026-01-01 → null (옵션값 포함)', () => {
    expect(
      detectNaturalLanguageInput(['node', 'vhk', 'recap', '--since', '2026-01-01'])
    ).toBeNull()
  })

  it('vhk "보안 확인" (한 덩어리) → 자연어', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', '보안 확인'])).toBe('보안 확인')
  })

  it('vhk 보안 확인 (여러 토큰) → 자연어', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', '보안', '확인'])).toBe('보안 확인')
  })

  it('vhk 프로젝트 현황 → status NLP', () => {
    const input = detectNaturalLanguageInput(['node', 'vhk', '프로젝트', '현황'])
    expect(input).toBe('프로젝트 현황')
    expect(routeNaturalLanguage(input!)?.command).toBe('status')
  })

  it('vhk 뭐 바뀌었어 → diff NLP', () => {
    const input = detectNaturalLanguageInput(['node', 'vhk', '뭐', '바뀌었어'])
    expect(routeNaturalLanguage(input!)?.command).toBe('diff')
  })
})

describe('read-json BOM', () => {
  it('UTF-8 BOM package.json 파싱', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-bom-'))
    const pkgPath = path.join(dir, 'package.json')
    fs.writeFileSync(pkgPath, '\uFEFF{"name":"t","version":"1.0.0"}', 'utf-8')
    const pkg = readJsonFile<{ name: string }>(pkgPath)
    expect(pkg.name).toBe('t')
    expect(stripBom('\uFEFFhello')).toBe('hello')
  })
})

describe('cli NL e2e', () => {
  const bin = path.join(process.cwd(), 'dist', 'index.js')

  it('vhk "보안 확인" — too many arguments 없음', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-cli-'))
    const r = spawnSync(process.execPath, [bin, '보안 확인'], {
      encoding: 'utf-8',
      cwd: tmp,
      env: { ...process.env, CI: '1' },
    })
    expect(String(r.stderr ?? '')).not.toMatch(/too many arguments/i)
    expect(String(r.stdout ?? '')).toMatch(/보안|secure|스캔/i)
  })

  it('vhk --version', () => {
    const r = spawnSync(process.execPath, [bin, '--version'], { encoding: 'utf-8' })
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')) as { version: string }
    expect(r.stdout?.trim()).toBe(pkg.version)
  })
})
