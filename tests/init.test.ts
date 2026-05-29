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
  '.vhk/README.md',
  '.vhk/context.md',
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

describe('vhk init — .vhk/ 프리셋 씨앗', () => {
  it('.vhk/README.md 와 context.md 를 생성한다', () => {
    const files = generateFiles('my-app', '설명', ['Node.js'], {}, 'cli')
    expect(files['.vhk/README.md']).toBeDefined()
    expect(files['.vhk/context.md']).toBeDefined()
  })

  it('context.md 씨앗에 자동생성 안내와 프로젝트 유형이 들어간다', () => {
    const files = generateFiles('my-app', '설명', ['Next.js', 'Supabase'], {}, 'webapp')
    const ctx = files['.vhk/context.md']
    expect(ctx).toContain('vhk init 이 생성한 씨앗')
    expect(ctx).toContain('vhk context')
    expect(ctx).toContain('webapp')
    expect(ctx).toContain('Next.js')
  })

  it('유형별로 씨앗 내용이 다르다 (프리셋)', () => {
    const webapp = generateFiles('p', 'd', ['Next.js', 'Supabase'], {}, 'webapp')['.vhk/context.md']
    const cli = generateFiles('p', 'd', ['Node.js', 'commander'], {}, 'cli')['.vhk/context.md']
    expect(webapp).not.toBe(cli)
    expect(webapp).toContain('Supabase')
    expect(cli).toContain('commander')
  })

  it('README 씨앗에 memory/refs 로컬 전용 정책이 명시된다', () => {
    const readme = generateFiles('p', 'd', ['Node.js'])['.vhk/README.md']
    expect(readme).toContain('memory.json')
    expect(readme).toContain('로컬 전용')
    expect(readme).toContain('docs/spec.md')
  })
})

describe('docs/spec.md 규격', () => {
  it('spec_version 1.0 과 핵심 파일을 명시한다', () => {
    const spec = fs.readFileSync(path.join(process.cwd(), 'docs', 'spec.md'), 'utf-8')
    expect(spec).toContain('spec_version: "1.0"')
    expect(spec).toContain('context.md')
    expect(spec).toContain('memory.json')
    expect(spec).toContain('HARD_STOP')
  })
})
