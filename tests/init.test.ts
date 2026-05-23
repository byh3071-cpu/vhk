import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { generateFiles, enhancePackageScripts } from '../src/commands/init.js'
import { COMMANDS_MD_TEMPLATE } from '../src/templates/commands-md.js'
import { writeFile } from '../src/utils/file.js'

const EXPECTED_FILES = [
  'CLAUDE.md',
  '.cursorrules',
  'docs/PRD.md',
  'docs/ARCHITECTURE.md',
  'docs/adr/ADR-000-template.md',
  'docs/log/.gitkeep',
  'docs/troubleshooting/.gitkeep',
  'docs/til.md',
  'BACKLOG.md',
]

describe('vhk init', () => {
  it('템플릿 파일이 생성된다', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-test-'))
    const files = generateFiles('my-app', '테스트 프로젝트', ['Node.js', 'TypeScript'])

    for (const [filePath, content] of Object.entries(files)) {
      writeFile(path.join(tmpDir, filePath), content)
    }

    for (const filePath of EXPECTED_FILES) {
      expect(fs.existsSync(path.join(tmpDir, filePath))).toBe(true)
    }

    const claude = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8')
    expect(claude).toContain('my-app')

    const prd = fs.readFileSync(path.join(tmpDir, 'docs/PRD.md'), 'utf-8')
    expect(prd).toContain('## 화면 인벤토리')
    expect(prd).toContain('테스트 프로젝트')

    fs.rmSync(tmpDir, { recursive: true })
  })

  it('package.json에 vhk 편의 scripts를 병합한다', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-test-'))
    const pkgPath = path.join(tmpDir, 'package.json')
    fs.writeFileSync(pkgPath, JSON.stringify({ name: 'x', scripts: { build: 'tsup' } }), 'utf-8')

    expect(enhancePackageScripts(tmpDir)).toBe(true)

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    expect(pkg.scripts.build).toBe('tsup')
    expect(pkg.scripts.ship).toBe('vhk ship')
    expect(pkg.scripts.scan).toBe('vhk secure scan')

    fs.rmSync(tmpDir, { recursive: true })
  })

  it('동명 사용자 스크립트는 vhk 기본값보다 우선 (보존)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-test-'))
    const pkgPath = path.join(tmpDir, 'package.json')
    fs.writeFileSync(
      pkgPath,
      JSON.stringify({
        name: 'x',
        scripts: { check: 'eslint .', save: 'echo custom-save' },
      }),
      'utf-8'
    )

    expect(enhancePackageScripts(tmpDir)).toBe(true)

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    expect(pkg.scripts.check).toBe('eslint .')
    expect(pkg.scripts.save).toBe('echo custom-save')
    expect(pkg.scripts.ship).toBe('vhk ship')

    fs.rmSync(tmpDir, { recursive: true })
  })

  it('COMMANDS.md 템플릿에 필수 명령이 있다', () => {
    const md = COMMANDS_MD_TEMPLATE()
    expect(md).toContain('vhk doctor')
    expect(md).toContain('vhk 보안 scan')
  })
})
