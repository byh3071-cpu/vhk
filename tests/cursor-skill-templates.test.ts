import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { installCursorSkills, CURSOR_SKILL_TEMPLATES } from '../src/lib/cursor-skill-templates.js'

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-bootstrap-'))
}

describe('cursor-skill-templates', () => {
  it('5개 skill 템플릿 번들', () => {
    expect(Object.keys(CURSOR_SKILL_TEMPLATES).sort()).toEqual([
      'vhk-bootstrap-cursor',
      'vhk-dogfood-issue',
      'vhk-evolve-loop',
      'vhk-gate',
      'vhk-goal-health',
    ])
  })

  let dir = ''
  beforeEach(() => { dir = tmp() })
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  it('installCursorSkills — create-if-missing', () => {
    const r1 = installCursorSkills(dir)
    expect(r1.created).toHaveLength(5)
    expect(r1.skipped).toHaveLength(0)
    expect(fs.existsSync(path.join(dir, '.cursor', 'skills', 'vhk-gate', 'SKILL.md'))).toBe(true)

    const r2 = installCursorSkills(dir)
    expect(r2.created).toHaveLength(0)
    expect(r2.skipped).toHaveLength(5)
  })
})