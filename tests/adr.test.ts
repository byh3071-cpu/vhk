import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { detectAdrCandidates, createAdrFile } from '../src/lib/adr.js'
import type { SessionDiff } from '../src/lib/git.js'

describe('adr', () => {
  it('package.json 변경 시 의존성 ADR 후보 감지', () => {
    const diff: SessionDiff = {
      filesChanged: 1,
      insertions: 10,
      deletions: 0,
      files: [{ file: 'package.json', insertions: 10, deletions: 0, status: 'modified' }],
    }

    const candidates = detectAdrCandidates(diff)
    expect(candidates.some(c => c.title === '의존성 변경')).toBe(true)
  })

  it('createAdrFile — docs/adr에 파일 생성', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-adr-'))
    const adrPath = createAdrFile(tmp, '의존성 변경', 'context', 'pnpm 사용', '빌드 안정')

    expect(fs.existsSync(adrPath)).toBe(true)
    expect(adrPath).toMatch(/docs[/\\]adr[/\\]ADR-\d{3}-/)

    fs.rmSync(tmp, { recursive: true })
  })
})
