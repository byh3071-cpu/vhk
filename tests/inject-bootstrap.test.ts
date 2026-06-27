import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  ECOSYSTEM_MDC_REL,
  generateEcosystemMdcContent,
  injectBootstrap,
} from '../src/lib/inject-bootstrap.js'
import { ECOSYSTEM_MDC_VERSION } from '../src/templates/ecosystem-mdc.js'

describe('inject-bootstrap (E1-02)', () => {
  it('generateEcosystemMdcContent — contract v1.1 5줄 + 마커', () => {
    const content = generateEcosystemMdcContent()
    expect(content).toContain(`ECOSYSTEM-MDC:START v${ECOSYSTEM_MDC_VERSION}`)
    expect(content).toContain('alwaysApply: true')
    expect(content).toContain('AGENTS.md')
    expect(content).toContain('memory/core/ecosystem-contract.yaml')
    expect(content).toContain('memory/core/inheritance-registry.yaml')
    expect(content).toContain('vhk sync')
    expect(content).toContain('vhk worktree')
  })

  it('injectBootstrap — created → unchanged on second run', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-inject-'))
    try {
      expect(injectBootstrap(tmp, { yes: true })).toBe('created')
      const filePath = path.join(tmp, ECOSYSTEM_MDC_REL)
      expect(fs.existsSync(filePath)).toBe(true)
      expect(injectBootstrap(tmp, { yes: true })).toBe('unchanged')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('injectBootstrap — custom file skipped without force', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-inject-skip-'))
    try {
      const filePath = path.join(tmp, ECOSYSTEM_MDC_REL)
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, '# custom\n', 'utf-8')
      expect(injectBootstrap(tmp)).toBe('skipped')
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('# custom\n')
      expect(injectBootstrap(tmp, { force: true })).toBe('updated')
      expect(fs.readFileSync(filePath, 'utf-8')).toContain('ECOSYSTEM-MDC:START')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})
