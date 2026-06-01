import { describe, it, expect, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runGuarded } from '../src/lib/safety-guard.js'
import { resolveGuard } from '../src/lib/risk-policy.js'

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

  it('lite + high-risk + 대화형(isTTY) → 경고만 하고 실행', async () => {
    const t = tracker()
    const logs: string[] = []
    // R13: lite 의 "경고만 하고 실행" 은 대화형(경고 볼 사람 있음)에서만 유효.
    const { outcome } = await runGuarded('deploy', { channel: 'cli', mode: 'lite', isTTY: true, log: (m) => logs.push(m) }, t.run)
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

describe('runGuarded — lite 비대화형 destructive 중단 (R13)', () => {
  it('lite + 비대화형(isTTY:false) + 미승인 → 실행 안 함', async () => {
    const run = vi.fn(async () => 'ran')
    const { outcome } = await runGuarded('undo', { channel: 'cli', mode: 'lite', isTTY: false, approved: false }, run)
    expect(run).not.toHaveBeenCalled()
    expect(outcome.ran).toBe(false)
  })
  it('lite + 대화형(isTTY:true) → 경고 후 실행', async () => {
    const run = vi.fn(async () => 'ran')
    const { outcome } = await runGuarded('undo', { channel: 'cli', mode: 'lite', isTTY: true }, run)
    expect(outcome.ran).toBe(true)
    expect(run).toHaveBeenCalled()
  })
  it('lite + 비대화형 + --yes 승인 → 실행', async () => {
    const run = vi.fn(async () => 'ran')
    const { outcome } = await runGuarded('undo', { channel: 'cli', mode: 'lite', isTTY: false, approved: true }, run)
    expect(outcome.ran).toBe(true)
  })
})

// Goal 12 / S5: save push 정책 결정 = "strict-extra 유지"(high-risk 승격 안 함).
// 근거: commit 은 로컬·되돌리기 가능(undo 존재), push 는 사용자 자기 remote 대상이라
// deploy/publish(외부 배포=high-risk)와 등급이 다름. spec 의 ③ destructive 버킷도
// save 를 "strict 일 때만" 분류함. 가장 빈번한 명령을 standard 에서 막으면 UX 파괴.
// strict 모드 = push 를 막고 싶은 사용자용 탈출구(이미 동작). 이 테스트가 그 계약을 잠근다.
describe('Goal 12 / S5 — save push 정책 (strict-extra 유지)', () => {
  it('standard 모드: save 는 가드 없이 allow (push 자동진행 — 회귀 가드)', () => {
    expect(resolveGuard('save', 'standard', 'cli')).toBe('allow')
  })
  it('strict 모드: save 는 confirm 으로 승격(push 막을 사용자용 탈출구)', () => {
    expect(resolveGuard('save', 'strict', 'cli')).toBe('confirm')
  })
  it('strict + 비대화형(isTTY:false) + 미승인 → save 차단(commit/push 둘 다 미실행)', async () => {
    const run = vi.fn(async () => 'ran')
    const { outcome } = await runGuarded('save', { channel: 'cli', mode: 'strict', isTTY: false, approved: false }, run)
    expect(run).not.toHaveBeenCalled()
    expect(outcome.ran).toBe(false)
  })
  it('strict + --yes 승인 → save 실행 허용', async () => {
    const run = vi.fn(async () => 'ran')
    const { outcome } = await runGuarded('save', { channel: 'cli', mode: 'strict', isTTY: false, approved: true }, run)
    expect(outcome.ran).toBe(true)
  })
  it('save 는 HIGH_RISK 로 승격되지 않음 — lite 에선 가드 없이 allow', () => {
    // high-risk 였다면 lite 에서 warn(비대화형 차단)이 됐을 것. allow 여야 결정 유지.
    expect(resolveGuard('save', 'lite', 'cli')).toBe('allow')
  })
})
