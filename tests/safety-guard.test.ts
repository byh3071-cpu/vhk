import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runGuarded } from '../src/lib/safety-guard.js'
import { resolveGuard } from '../src/lib/risk-policy.js'

// Goal 55: runGuarded 가 이제 .vhk/events/ai-actions.jsonl 에 행동을 기록한다(deps.cwd ?? process.cwd()).
// cwd 미지정 in-process 호출이 레포 루트를 오염시키지 않게 각 테스트를 임시 디렉터리로 격리한다.
let _origCwd: string
let _cwdSandbox: string
beforeEach(() => {
  _origCwd = process.cwd()
  _cwdSandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-guard-cwd-'))
  process.chdir(_cwdSandbox)
})
afterEach(() => {
  process.chdir(_origCwd)
  fs.rmSync(_cwdSandbox, { recursive: true, force: true })
})

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

  it('명령별 승인 플래그를 차단 안내에 그대로 쓴다', async () => {
    const t = tracker()
    const logs: string[] = []
    const { outcome } = await runGuarded('policy-baseline', {
      channel: 'cli',
      mode: 'standard',
      isTTY: false,
      approvalHint: '--confirm',
      log: (message) => logs.push(message),
    }, t.run)
    expect(outcome.ran).toBe(false)
    expect(logs.join('\n')).toContain('--confirm')
    expect(logs.join('\n')).not.toContain('--yes')
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

// ADR-021 / #611: Goal 12/S5(save=strict-extra 유지) 를 번복 — save 를 high-risk 로 승격.
// 번복 근거: ① MCP 채널은 goal 70 이 이미 고위험 옵트인(confirm:true 미리보기)으로 승격 —
//   같은 에이전트 채널인 NL/비-TTY CLI 만 allow 는 채널 자기모순 ② 실측(#611): 비-TTY 자연어
//   "저장해줘" 한 마디로 공개 remote 에 무확인 push 완주 ③ 당시 "빈번 명령 UX 파괴" 논거는
//   guardCli(y/N 이중 프롬프트) 전제 — index.ts 는 guardCliDefer 로 배선해 TTY 흐름 무변
//   (save 자체 메시지 프롬프트가 확인 역할). 이 테스트가 새 계약을 잠근다.
describe('ADR-021 / #611 — save high-risk 승격 (Goal 12/S5 supersede)', () => {
  it('standard CLI: confirm 등급 (TTY 는 defer 로 자체 프롬프트 위임)', () => {
    expect(resolveGuard('save', 'standard', 'cli')).toBe('confirm')
  })
  it('standard NL/MCP: preview — 자연어 "저장해줘" 는 기본 비실행', () => {
    expect(resolveGuard('save', 'standard', 'nl')).toBe('preview')
    expect(resolveGuard('save', 'standard', 'mcp')).toBe('preview')
  })
  it('비대화형(isTTY:false) + 미승인 → save 차단(commit/push 둘 다 미실행)', async () => {
    const run = vi.fn(async () => 'ran')
    const { outcome } = await runGuarded('save', { channel: 'cli', mode: 'standard', isTTY: false, approved: false }, run)
    expect(run).not.toHaveBeenCalled()
    expect(outcome.ran).toBe(false)
  })
  it('--yes 승인 → save 실행 허용 (에이전트 명시 스위치)', async () => {
    const run = vi.fn(async () => 'ran')
    const { outcome } = await runGuarded('save', { channel: 'cli', mode: 'standard', isTTY: false, approved: true }, run)
    expect(outcome.ran).toBe(true)
  })
  it('lite: warn 등급 — TTY 는 경고 후 진행, 비대화형 미승인은 차단(R13)', async () => {
    expect(resolveGuard('save', 'lite', 'cli')).toBe('warn')
    const run = vi.fn(async () => 'ran')
    const { outcome } = await runGuarded('save', { channel: 'cli', mode: 'lite', isTTY: false, approved: false }, run)
    expect(run).not.toHaveBeenCalled()
    expect(outcome.ran).toBe(false)
  })

  it('VHK_FORCE_INTERACTIVE=1 은 승인이 아니다 — 가드 게이트(warn·confirm 모두)에 미반영 (P1-NEW)', async () => {
    // 의도적으로 isTTY 미주입 — 이 테스트의 대상이 바로 "기본 축(stdin)이 env 를 무시한다"는
    // 계약이라, isTTY:false 를 주입하면 검증이 공회전한다. (러너 stdin 비-TTY 전제는 e2e 가 보강)
    const envBefore = process.env.VHK_FORCE_INTERACTIVE
    process.env.VHK_FORCE_INTERACTIVE = '1'
    try {
      // lite/warn: 탈출구가 켜져 있어도 stdin 비-TTY + 미승인이면 차단(R13) — env 는 "사람이 본다"의 증거가 아님
      const run1 = vi.fn(async () => 'ran')
      const r1 = await runGuarded('save', { channel: 'cli', mode: 'lite', approved: false }, run1)
      expect(run1).not.toHaveBeenCalled()
      expect(r1.outcome.ran).toBe(false)
      // standard/confirm: 탈출구는 confirm 게이트도 열지 못한다 — 콜백 호출조차 없이 차단
      // (env 가 y 응답을 대신하면 #611 이 환경변수 한 줄로 재발한다)
      const confirm = vi.fn(async () => true)
      const run2 = vi.fn(async () => 'ran')
      const r2 = await runGuarded('save', { channel: 'cli', mode: 'standard', approved: false, confirm }, run2)
      expect(confirm).not.toHaveBeenCalled()
      expect(run2).not.toHaveBeenCalled()
      expect(r2.outcome.ran).toBe(false)
    } finally {
      if (envBefore === undefined) delete process.env.VHK_FORCE_INTERACTIVE
      else process.env.VHK_FORCE_INTERACTIVE = envBefore
    }
  })
})
