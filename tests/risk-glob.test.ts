import { describe, it, expect, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolveGuard, isRiskyTarget, RISKY_TARGET_PATTERNS } from '../src/lib/risk-policy.js'
import { runGuarded } from '../src/lib/safety-guard.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

describe('risk-policy — 위험 대상 글롭 (isRiskyTarget)', () => {
  it('생성-SoT 파일(자동수정 위험)은 risky', () => {
    for (const t of ['AGENTS.md', 'RULES.md', '.cursorrules', '.windsurfrules', 'path/to/AGENTS.md']) {
      expect(isRiskyTarget(t).risky, t).toBe(true)
    }
  })

  it('.env 시작 시크릿 파일은 risky', () => {
    expect(isRiskyTarget('.env').risky).toBe(true)
    expect(isRiskyTarget('.env.local').risky).toBe(true)
    expect(isRiskyTarget('config/.env.production').risky).toBe(true)
  })

  it('rm -rf 경로성은 risky', () => {
    expect(isRiskyTarget('rm -rf build/').risky).toBe(true)
  })

  it('일반 소스/문서는 risky 아님', () => {
    for (const t of ['src/foo.ts', 'README.md', 'package.json', 'docs/x.md', '.environment']) {
      expect(isRiskyTarget(t).risky, t).toBe(false)
    }
  })

  it('.env.example/.sample/.template 템플릿은 risky 아님(커밋 권장 — 오탐 제외)', () => {
    for (const t of ['.env.example', '.env.sample', 'config/.env.template', 'path/.env.example']) {
      expect(isRiskyTarget(t).risky, t).toBe(false)
    }
    // 실제 시크릿 파일은 여전히 risky
    expect(isRiskyTarget('.env.production').risky).toBe(true)
  })

  it('risky 면 reason 노출', () => {
    expect(isRiskyTarget('AGENTS.md').reason).toBeTruthy()
  })

  it('RISKY_TARGET_PATTERNS export(비어있지 않음)', () => {
    expect(Array.isArray(RISKY_TARGET_PATTERNS)).toBe(true)
    expect(RISKY_TARGET_PATTERNS.length).toBeGreaterThan(0)
  })
})

describe('risk-policy — resolveGuard(target?) 4번째 인자', () => {
  it('위험 대상(AGENTS.md) + 저위험 액션 → 채널별 가드', () => {
    expect(resolveGuard('edit', 'standard', 'cli', 'AGENTS.md')).toBe('confirm')
    expect(resolveGuard('edit', 'standard', 'mcp', 'AGENTS.md')).toBe('preview')
    expect(resolveGuard('edit', 'standard', 'nl', 'AGENTS.md')).toBe('preview')
    expect(resolveGuard('edit', 'lite', 'cli', 'AGENTS.md')).toBe('warn')
  })

  it('일반 대상 + 저위험 액션 → allow', () => {
    expect(resolveGuard('edit', 'standard', 'cli', 'src/foo.ts')).toBe('allow')
  })

  it('하위호환 — target 없으면 기존 9종 동작 회귀 0', () => {
    expect(resolveGuard('publish', 'standard', 'cli')).toBe('confirm')
    expect(resolveGuard('publish', 'standard', 'mcp')).toBe('preview')
    expect(resolveGuard('publish', 'lite', 'cli')).toBe('warn')
    expect(resolveGuard('status', 'standard', 'cli')).toBe('allow')
    expect(resolveGuard('save', 'standard', 'cli')).toBe('allow') // strict-extra: standard 에선 allow
    expect(resolveGuard('save', 'strict', 'cli')).toBe('confirm')
  })
})

describe('risk-policy — runGuarded(target) 통합', () => {
  it('MCP + 위험 target(.env) 미승인 → 실행 안 함(preview-no-approve)', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-risk-glob-'))
    try {
      const run = vi.fn(async () => 'ran')
      const { outcome } = await runGuarded(
        'edit',
        { channel: 'mcp', mode: 'standard', target: '.env', approved: false, cwd: d, log: () => {} },
        run
      )
      expect(run).not.toHaveBeenCalled()
      expect(outcome.ran).toBe(false)
      expect(outcome.guard).toBe('preview')
    } finally {
      fs.rmSync(d, { recursive: true, force: true })
    }
  })
})

// part(2) 보수: 위험 글롭/액션 정책은 risk-policy 단일 소스. 분산 결정점이 정책을 재정의(shadow)하면
// 드리프트 → 단일성 위반. grep 중복 0 가정 — 억지 일원화 금지, 재정의 0 만 단언.
describe('risk-policy — 단일성 가드(글롭 정책 중복 0)', () => {
  it('isRiskyTarget/RISKY_TARGET_PATTERNS 정의는 risk-policy.ts 한 곳뿐', () => {
    const policy = readFileSync('src/lib/risk-policy.ts', 'utf-8')
    expect(/export function isRiskyTarget/.test(policy)).toBe(true)
    expect(/export const RISKY_TARGET_PATTERNS/.test(policy)).toBe(true)

    const distributed = [
      'src/lib/hard-stop-guard.ts',
      'src/lib/preflight.ts',
      'src/commands/preflight.ts',
      'src/commands/secure.ts',
      'src/commands/mission.ts',
    ]
    for (const f of distributed) {
      if (!existsSync(f)) continue
      const src = readFileSync(f, 'utf-8')
      expect(/RISKY_TARGET_PATTERNS\s*[=:]/.test(src), `${f} 가 위험대상 정책 재정의(드리프트)`).toBe(false)
      expect(/function isRiskyTarget\b/.test(src), `${f} 가 isRiskyTarget 재정의(드리프트)`).toBe(false)
    }
  })
})
