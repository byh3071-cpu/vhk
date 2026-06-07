import { describe, it, expect, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Goal 32 Phase 3 e2e — dist 빌드된 CLI 를 실제 실행. ~/.vhk 를 임시 HOME 으로 격리.
// (os.homedir() 는 posix=HOME, win=USERPROFILE → 둘 다 주입)

const bin = path.join(process.cwd(), 'dist', 'index.js')

const homes: string[] = []
function newHome(): string {
  const d = mkdtempSync(path.join(tmpdir(), 'vhk-home-'))
  homes.push(d)
  return d
}
afterEach(() => {
  for (const d of homes.splice(0)) rmSync(d, { recursive: true, force: true })
})

function run(args: string[], home: string) {
  return spawnSync(process.execPath, [bin, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, HOME: home, USERPROFILE: home, CI: '1' },
  })
}

describe('vhk standup --if-stale (e2e) — 하루 1회 자동 브리핑', () => {
  it('첫 실행(stale) → 브리핑을 출력한다', () => {
    const home = newHome()
    const r = run(['standup', '--if-stale'], home)
    expect(r.status).toBe(0)
    expect(String(r.stdout)).toMatch(/Standup|아침|어제|오늘 추천|미해결/)
  })

  it('같은 날 두 번째 실행(fresh) → 아무것도 출력하지 않는다', () => {
    const home = newHome()
    run(['standup', '--if-stale'], home) // 1회차 — 표시 + 기록
    const r2 = run(['standup', '--if-stale'], home)
    expect(r2.status).toBe(0)
    expect(String(r2.stdout).trim()).toBe('')
  })

  it('플래그 없는 vhk standup 은 항상 출력 (회귀 — 무조건 브리핑)', () => {
    const home = newHome()
    run(['standup', '--if-stale'], home) // 상태를 fresh 로 만들어도
    const r = run(['standup'], home) // 플래그 없으면 무시하고 항상 출력
    expect(String(r.stdout)).toMatch(/Standup|아침|어제|오늘 추천|미해결/)
  })
})

describe('vhk standup --install-anchor (e2e) — 앵커 안내 출력만, rc 미수정', () => {
  it('bash + PowerShell 앵커 줄을 안내 출력한다', () => {
    const home = newHome()
    const r = run(['standup', '--install-anchor'], home)
    expect(r.status).toBe(0)
    const out = String(r.stdout)
    expect(out).toContain('vhk standup --if-stale')
    expect(out).toMatch(/bashrc|zshrc/) // bash 대상 안내
    expect(out).toMatch(/PROFILE|PowerShell/i) // PowerShell 대상 안내
  })

  it('rc 파일을 자동 수정하지 않는다 (홈에 rc 파일 생성/변경 0)', () => {
    const home = newHome()
    run(['standup', '--install-anchor'], home)
    const entries = existsSync(home) ? readdirSync(home) : []
    expect(entries.filter((e) => /bashrc|zshrc|profile/i.test(e))).toEqual([])
  })
})
