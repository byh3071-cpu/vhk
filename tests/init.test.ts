import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { generateFiles } from '../src/commands/init.js'
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
})
