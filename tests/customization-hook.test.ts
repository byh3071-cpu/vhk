import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CUSTOMIZATION_HOOK_TEMPLATE } from '../src/templates/customization-hook.js'

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
})
