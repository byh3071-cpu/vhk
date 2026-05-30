import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runGuarded } from '../src/lib/safety-guard.js'

function tracker() {
  let ran = false
  const run = () => { ran = true; return 'DONE' }
  return { run, get ran() { return ran } }
}

describe('runGuarded — 단일 chokepoint', () => {
  it('저위험(allow) → 그대로 실행', async () => {
    const t = tracker()
    const { outcome, result } = await runGuarded('status', { channel: 'cli', mode: 'standard' }, t.run)
    expect(outcome.ran).toBe(true)
    expect(result).toBe('DONE')
    expect(t.ran).toBe(true)
  })

  it('lite + high-risk → 경고만 하고 실행', async () => {
    const t = tracker()
    const logs: string[] = []
    const { outcome } = await runGuarded('deploy', { channel: 'cli', mode: 'lite', log: (m) => logs.push(m) }, t.run)
    expect(outcome.ran).toBe(true)
    expect(t.ran).toBe(true)
    expect(logs.join(' ')).toMatch(/경고|warn|lite/i)
  })

  it('CLI standard + confirm 승인 → 실행', async () => {
    const t = tracker()
    const { outcome } = await runGuarded('deploy', {
      channel: 'cli', mode: 'standard', isTTY: true, confirm: async () => true,
    }, t.run)
    expect(outcome.ran).toBe(true)
    expect(t.ran).toBe(true)
  })

  it('CLI standard + confirm 거부 → 실행 안 함(abort)', async () => {
    const t = tracker()
    const { outcome } = await runGuarded('deploy', {
      channel: 'cli', mode: 'standard', isTTY: true, confirm: async () => false,
    }, t.run)
    expect(outcome.ran).toBe(false)
    expect(t.ran).toBe(false)
  })

  it('CLI 비대화형(TTY 아님) + 미승인 → 안전하게 중단', async () => {
    const t = tracker()
    const { outcome } = await runGuarded('deploy', {
      channel: 'cli', mode: 'standard', isTTY: false,
    }, t.run)
    expect(outcome.ran).toBe(false)
    expect(t.ran).toBe(false)
  })

  it('CLI 명시적 승인(approved=true) → 실행', async () => {
    const t = tracker()
    const { outcome } = await runGuarded('deploy', {
      channel: 'cli', mode: 'standard', isTTY: false, approved: true,
    }, t.run)
    expect(outcome.ran).toBe(true)
    expect(t.ran).toBe(true)
  })

  it('MCP/자연어 standard + 미승인 → preview 만, 기본 비실행', async () => {
    const t = tracker()
    const logs: string[] = []
    const { outcome } = await runGuarded('deploy', {
      channel: 'nl', mode: 'standard', approved: false, log: (m) => logs.push(m),
    }, t.run)
    expect(outcome.ran).toBe(false)
    expect(t.ran).toBe(false)
    expect(logs.join(' ')).toMatch(/미리보기|preview/i)
  })

  it('자연어 + 명시적 승인 → 실행', async () => {
    const t = tracker()
    const { outcome } = await runGuarded('deploy', {
      channel: 'nl', mode: 'standard', approved: true,
    }, t.run)
    expect(outcome.ran).toBe(true)
    expect(t.ran).toBe(true)
  })
})

describe('CLI 가드 e2e — standard 모드 high-risk 차단 (행동 검증)', () => {
  const bin = path.join(process.cwd(), 'dist', 'index.js')

  it('standard(기본) + 확인 없이 vhk deploy → 실행되지 않음', () => {
    // 빈 temp(설정 없음) = 기본 standard. 비대화형 spawn = 확인 불가 → 가드가 막아야 함.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-guard-'))
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'tp', version: '0.0.0' }), 'utf-8')
    const r = spawnSync(process.execPath, [bin, 'deploy'], {
      encoding: 'utf-8', cwd: tmp, env: { ...process.env, NO_COLOR: '1' },
    })
    const out = String(r.stdout ?? '') + String(r.stderr ?? '')
    // 가드 차단 메시지 존재
    expect(out).toMatch(/위험 작업\(deploy\)/)
    expect(out).toMatch(/실행하지 않/)
    // 실제 배포 흐름(플랫폼 선택)으로 진입하지 않음
    expect(out).not.toMatch(/어떤 플랫폼에 배포/)
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
