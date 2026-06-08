import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SCRIPT = path.join(process.cwd(), 'scripts', 'check-no-silent-fallback.mjs')

/** 게이트 실행 → 종료코드. --strict 시 위반 있으면 1. */
function runGate(scanRoot: string, strict = true): number {
  try {
    const args = strict ? [SCRIPT, scanRoot, '--strict'] : [SCRIPT, scanRoot]
    execFileSync('node', args, { encoding: 'utf-8', stdio: 'pipe' })
    return 0
  } catch (e) {
    return (e as { status?: number }).status ?? -1
  }
}

function fixture(name: string, content: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-silentfb-'))
  fs.writeFileSync(path.join(d, name), content, 'utf-8')
  return d
}

describe('check-no-silent-fallback 게이트', () => {
  it('catch { return null } (로그·throw 없는 기본값 return) → --strict FAIL', () => {
    const d = fixture('bad.ts', 'function f(){ try { g() } catch { return null } }\n')
    expect(runGate(d)).toBe(1)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('catch (e) { return [] } 다중라인도 FAIL', () => {
    const d = fixture('bad.ts', 'function f(){\n  try { g() } catch (e) {\n    return []\n  }\n}\n')
    expect(runGate(d)).toBe(1)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('// vhk-allow-fallback: 주석 인접 → PASS (의도된 폴백 허용)', () => {
    const d = fixture('ok.ts', 'function f(){\n  // vhk-allow-fallback: 레포 아님은 정상\n  try { g() } catch { return false }\n}\n')
    expect(runGate(d)).toBe(0)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('정상 try-catch(로그/throw 동반) → PASS (오탐 0)', () => {
    const d = fixture('ok.ts', 'function f(){ try { g() } catch (e) { console.error(e); return null } }\n')
    expect(runGate(d)).toBe(0)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('catch { throw e } → PASS', () => {
    const d = fixture('ok.ts', 'function f(){ try { g() } catch (e) { throw e } }\n')
    expect(runGate(d)).toBe(0)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('기본(비-strict) 모드는 위반 있어도 exit 0 (리포트 전용)', () => {
    const d = fixture('bad.ts', 'function f(){ try { g() } catch { return null } }\n')
    expect(runGate(d, false)).toBe(0)
    fs.rmSync(d, { recursive: true, force: true })
  })
})
