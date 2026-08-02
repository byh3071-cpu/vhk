import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
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

// #552 리뷰 대응 — RULES.md 읽기 실패를 조용히 삼키지 않는다(fail-open 은 유지).
describe('customization-check.mjs — RULES.md 읽기 실패 보고', () => {
  let dir: string
  let scriptPath: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-chook-fail-'))
    fs.mkdirSync(path.join(dir, '.vhk', 'hooks'), { recursive: true })
    scriptPath = path.join(dir, '.vhk', 'hooks', 'customization-check.mjs')
    fs.writeFileSync(scriptPath, CUSTOMIZATION_HOOK_TEMPLATE(), 'utf-8')
    fs.writeFileSync(path.join(dir, '.vhk', 'NEEDS_CUSTOMIZATION'), '', 'utf-8')
    // RULES.md 를 디렉터리로 만들면 existsSync 는 통과하고 readFileSync 만 실패한다.
    fs.mkdirSync(path.join(dir, 'RULES.md'), { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('실패해도 세션을 막지 않고(exit 0) 고정 문구만 stderr 로 알린다', () => {
    const result = spawnSync('node', [scriptPath], { cwd: dir, encoding: 'utf-8' })
    expect(result.status).toBe(0)
    expect(result.stderr).toContain('[vhk]')
    expect(result.stderr).toContain('커스터마이즈 안내를 건너뜁니다')
    // 훅이 읽는 파일은 프로젝트 루트의 RULES.md 다 — 문구도 그 파일을 가리켜야 한다.
    expect(result.stderr).toContain('RULES.md')
    expect(result.stderr).not.toContain('.vhk/RULES.md')
    // 경로·원문 오류는 싣지 않는다.
    expect(result.stderr).not.toContain(dir)
    expect(result.stderr).not.toContain('EISDIR')
    // 훅 계약: stdout 은 오염되지 않는다(넛지 없음).
    expect(result.stdout.trim()).toBe('')
  })
})
