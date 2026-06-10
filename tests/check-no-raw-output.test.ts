import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SCRIPT = path.join(process.cwd(), 'scripts', 'check-no-raw-output.mjs')

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
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-rawout-'))
  fs.writeFileSync(path.join(d, name), content, 'utf-8')
  return d
}

describe('check-no-raw-output 게이트', () => {
  it('console.log(chalk.red(...)) → --strict FAIL', () => {
    const d = fixture('bad.ts', "import chalk from 'chalk'\nconsole.log(chalk.red('x'))\n")
    expect(runGate(d)).toBe(1)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('console.log(\\n  chalk...) 다중라인도 FAIL', () => {
    const d = fixture('bad.ts', "console.log(\n  chalk.green('done')\n)\n")
    expect(runGate(d)).toBe(1)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('// vhk-allow-raw-output: 주석 인접 → PASS (의도된 raw 출력 허용)', () => {
    const d = fixture('ok.ts', "// vhk-allow-raw-output: 부트스트랩 로그\nconsole.log(chalk.red('x'))\n")
    expect(runGate(d)).toBe(0)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('log.info(...) (logger 경유) → PASS (오탐 0)', () => {
    const d = fixture('ok.ts', "import { log } from '../utils/logger.js'\nlog.info('hi')\n")
    expect(runGate(d)).toBe(0)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('console.error(chalk...) → PASS (console.log 만 대상)', () => {
    const d = fixture('ok.ts', "console.error(chalk.red('err'))\n")
    expect(runGate(d)).toBe(0)
    fs.rmSync(d, { recursive: true, force: true })
  })

  it('기본(비-strict) 모드는 위반 있어도 exit 0 (리포트 전용)', () => {
    const d = fixture('bad.ts', "console.log(chalk.red('x'))\n")
    expect(runGate(d, false)).toBe(0)
    fs.rmSync(d, { recursive: true, force: true })
  })
})
