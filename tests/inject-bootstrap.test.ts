import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  CORE_RULES_REL,
  ECOSYSTEM_MDC_REL,
  MCP_JSON_EXAMPLE_REL,
  VHK_CONTEXT_REL,
  generateEcosystemMdcContent,
  injectBootstrap,
  injectBootstrapAll,
} from '../src/lib/inject-bootstrap.js'
import { ECOSYSTEM_MDC_VERSION } from '../src/templates/ecosystem-mdc.js'
import { CORE_RULES_END_TAG, CORE_RULES_START_TAG } from '../src/lib/core-rules.js'

describe('inject-bootstrap (E1-02 / E5-02 / E5-04)', () => {
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

  it('generateEcosystemMdcContent — 실행계층(에이전트 무관) vs 트리거계층(Claude 전용) 구분, "Claude-only" 정체성 모순 문구 제거 (RFC 0057 트랙①)', () => {
    const content = generateEcosystemMdcContent()
    expect(content).toContain('실행 계층(vhk 명령)은 에이전트 무관')
    expect(content).not.toContain('Claude-only')
  })

  it('injectBootstrapAll — tier S 4종 created → ecosystem unchanged on second run', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-inject-all-'))
    try {
      const first = injectBootstrapAll(tmp, { yes: true })
      expect(first.ecosystem).toBe('created')
      expect(first.coreRules).toBe('created')
      expect(first.context).toBe('created')
      expect(first.mcpExample).toBe('created')
      expect(fs.existsSync(path.join(tmp, ECOSYSTEM_MDC_REL))).toBe(true)
      expect(fs.existsSync(path.join(tmp, CORE_RULES_REL))).toBe(true)
      expect(fs.existsSync(path.join(tmp, VHK_CONTEXT_REL))).toBe(true)
      expect(fs.existsSync(path.join(tmp, MCP_JSON_EXAMPLE_REL))).toBe(true)
      expect(fs.readFileSync(path.join(tmp, CORE_RULES_REL), 'utf-8')).toContain(CORE_RULES_START_TAG)
      expect(fs.readFileSync(path.join(tmp, CORE_RULES_REL), 'utf-8')).toContain(CORE_RULES_END_TAG)

      const second = injectBootstrapAll(tmp, { yes: true })
      expect(second.ecosystem).toBe('unchanged')
      expect(second.coreRules).toBe('unchanged')
      expect(second.context).toBe('unchanged')
      expect(second.mcpExample).toBe('unchanged')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('injectBootstrap — backward compat alias (ecosystem only result)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-inject-'))
    try {
      expect(injectBootstrap(tmp, { yes: true })).toBe('created')
      expect(injectBootstrap(tmp, { yes: true })).toBe('unchanged')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('injectBootstrap — custom ecosystem skipped without force', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-inject-skip-'))
    try {
      const filePath = path.join(tmp, ECOSYSTEM_MDC_REL)
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, '# custom\n', 'utf-8')
      expect(injectBootstrapAll(tmp).ecosystem).toBe('skipped')
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('# custom\n')
      expect(injectBootstrapAll(tmp, { force: true }).ecosystem).toBe('updated')
      expect(fs.readFileSync(filePath, 'utf-8')).toContain('ECOSYSTEM-MDC:START')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})
