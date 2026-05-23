import { describe, it, expect } from 'vitest'
import { normalizePorcelain, parsePorcelainLines } from '../src/lib/git-porcelain.js'
import { countFileChanges } from '../src/commands/status.js'

describe('git-porcelain', () => {
  it('leading space 보존 (trimEnd만)', () => {
    const raw = ' M unstaged.ts\nM  staged.ts\n'
    const normalized = normalizePorcelain(raw)
    expect(normalized.startsWith(' M ')).toBe(true)
    const counts = countFileChanges(normalized)
    expect(counts.staged).toBe(1)
    expect(counts.unstaged).toBe(1)
  })

  it('parsePorcelainLines — 파일명 앞 공백 유지', () => {
    const lines = parsePorcelainLines(' M src/foo.ts\n')
    expect(lines[0].substring(3)).toBe('src/foo.ts')
  })
})
