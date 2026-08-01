import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CUSTOMIZATION_HOOK_TEMPLATE } from '../src/templates/customization-hook.js'
import { formatStackStatusNote } from '../src/lib/stack-state.js'

describe('customization-check.mjs — 서브프로세스 실행 (goal 89)', () => {
  let dir: string
  let scriptPath: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-chook-proc-'))
    fs.mkdirSync(path.join(dir, '.vhk', 'hooks'), { recursive: true })
    scriptPath = path.join(dir, '.vhk', 'hooks', 'customization-check.mjs')
    fs.writeFileSync(scriptPath, CUSTOMIZATION_HOOK_TEMPLATE(), 'utf-8')
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  function run(): string {
    return execFileSync('node', [scriptPath], { cwd: dir, encoding: 'utf-8' })
  }

  it('마커 둘 다 없으면 무출력', () => {
    expect(run().trim()).toBe('')
  })

  it('customization-done 만 있으면(NEEDS 없음 — vhk-init 아닌 프로젝트) 무출력', () => {
    fs.writeFileSync(path.join(dir, '.vhk', 'customization-done'), '')
    expect(run().trim()).toBe('')
  })

  it('둘 다 있으면(done 우선) 무출력', () => {
    fs.writeFileSync(path.join(dir, '.vhk', 'NEEDS_CUSTOMIZATION'), '')
    fs.writeFileSync(path.join(dir, '.vhk', 'customization-done'), '')
    expect(run().trim()).toBe('')
  })

  it('NEEDS_CUSTOMIZATION 만 있으면 SessionStart additionalContext JSON을 출력한다', () => {
    fs.writeFileSync(path.join(dir, '.vhk', 'NEEDS_CUSTOMIZATION'), '')
    const out = run().trim()
    const parsed = JSON.parse(out)
    expect(parsed.hookSpecificOutput.hookEventName).toBe('SessionStart')
    const ctx = parsed.hookSpecificOutput.additionalContext
    expect(ctx).toContain('도메인')
    expect(ctx).toContain('RULES.md')
    expect(ctx).toContain('vhk sync')
  })

  it('기술 스택이 후보면 첫 질문을 기술 스택 확정으로 앞세운다', () => {
    fs.writeFileSync(path.join(dir, '.vhk', 'NEEDS_CUSTOMIZATION'), '')
    fs.writeFileSync(
      path.join(dir, 'RULES.md'),
      `# Rules\n\n## 기술 스택\n${formatStackStatusNote('candidate')}\n\n- Vite\n`,
      'utf-8',
    )
    const parsed = JSON.parse(run().trim())
    const ctx = parsed.hookSpecificOutput.additionalContext as string
    expect(ctx).toContain('[0단계 — 기술 스택]')
    expect(ctx.indexOf('[0단계 — 기술 스택]')).toBeLessThan(ctx.indexOf('[1단계 — 도메인 규칙]'))
    expect(ctx).toContain('추측으로 확정하지 마라')
  })

  it('기술 스택이 확정이면 기술 스택 확인 단계를 반복하지 않는다', () => {
    fs.writeFileSync(path.join(dir, '.vhk', 'NEEDS_CUSTOMIZATION'), '')
    fs.writeFileSync(
      path.join(dir, 'RULES.md'),
      `# Rules\n\n## 기술 스택\n${formatStackStatusNote('confirmed')}\n\n- Vite\n`,
      'utf-8',
    )
    const parsed = JSON.parse(run().trim())
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain('[0단계 — 기술 스택]')
  })
})
