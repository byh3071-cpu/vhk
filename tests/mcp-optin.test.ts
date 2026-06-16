import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { callTool } from './helpers/mcp-introspect.js'

// goal 70: MCP high-risk 도구 옵트인 정책 — 상태변경·바깥행동(save=commit/push) 도구는
// confirm:true 명시 전 실제 실행 금지(기본 미리보기). PAT-003(되돌릴 수 없는 작업) 연동.
// 실 temp git repo 사용 — save 가 confirm 없이 커밋하지 않음을 직접 검증.

const text = (r: { content: Array<{ text: string }> }) => r.content.map((c) => c.text).join('\n')

function gitInit(dir: string): void {
  const opt = { cwd: dir, stdio: 'pipe' as const }
  execFileSync('git', ['init'], opt)
  execFileSync('git', ['config', 'user.email', 't@t.dev'], opt)
  execFileSync('git', ['config', 'user.name', 'tester'], opt)
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], opt)
  writeFileSync(join(dir, 'a.txt'), 'base\n', 'utf-8')
  execFileSync('git', ['add', '.'], opt)
  execFileSync('git', ['commit', '-m', 'init'], opt)
}
function commitCount(dir: string): number {
  return Number(execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: dir, encoding: 'utf-8' }).trim())
}

describe('MCP high-risk 옵트인 정책 (goal 70)', () => {
  it('HIGH_RISK_MCP_TOOLS 레지스트리에 save·undo 포함 (risk_level SoT)', async () => {
    const { HIGH_RISK_MCP_TOOLS } = await import('../src/mcp/server.js')
    expect(HIGH_RISK_MCP_TOOLS.has('save')).toBe(true)
    expect(HIGH_RISK_MCP_TOOLS.has('undo')).toBe(true)
  })

  describe('save 옵트인 — confirm 없으면 commit/push 안 함', () => {
    let origCwd: string
    let dir: string
    beforeEach(() => {
      origCwd = process.cwd()
      dir = mkdtempSync(join(tmpdir(), 'vhk-optin-'))
      gitInit(dir)
      writeFileSync(join(dir, 'a.txt'), 'changed\n', 'utf-8') // dirty change
      process.chdir(dir)
    })
    afterEach(() => {
      process.chdir(origCwd) // Windows: chdir 먼저 해야 rmSync EPERM 회피
      rmSync(dir, { recursive: true, force: true })
    })

    it('confirm 없이 save → 미리보기만, 커밋 0 (안전 기본값)', async () => {
      const before = commitCount(dir)
      const r = await callTool('save', { message: 'x' })
      expect(text(r)).toMatch(/미리보기|confirm/)
      expect(commitCount(dir)).toBe(before) // 커밋 안 늘어남 = commit 미실행
    })

    it('confirm:true → 실제 커밋 (+1)', async () => {
      const before = commitCount(dir)
      const r = await callTool('save', { message: 'real', confirm: true })
      expect(text(r)).toContain('저장 완료')
      expect(commitCount(dir)).toBe(before + 1)
    })
  })
})
