import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SCRIPT = path.join(process.cwd(), 'scripts', 'check-rule-no-exec-sync.mjs')

describe('check-rule-no-exec-sync', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-no-exec-sync-'))
    fs.mkdirSync(path.join(dir, 'src'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  function runGate(): number {
    return spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf-8' }).status ?? 1
  }

  it.each([
    ['named.mts', "import { execSync } from 'child_process'\nexecSync('echo unsafe')\n"],
    ['namespace.cts', "import * as cp from 'node:child_process'\nconst run = cp.execSync\nrun('echo unsafe')\n"],
    ['direct.js', "require('node:child_process').execSync('echo unsafe')\n"],
    ['destructure.cjs', "const { execSync: run } = require('child_process')\nrun('echo unsafe')\n"],
    ['require-alias.ts', "const cp = require('node:child_process')\ncp.execSync('echo unsafe')\n"],
  ])('%s 우회 형식을 차단한다', (file, content) => {
    fs.writeFileSync(path.join(dir, 'src', file), content, 'utf-8')
    expect(runGate()).toBe(1)
  })

  it('safeExecFile 사용은 통과한다', () => {
    fs.writeFileSync(
      path.join(dir, 'src', 'safe.ts'),
      "import { safeExecFile } from './exec.js'\nsafeExecFile('git', ['status'])\n",
      'utf-8',
    )
    expect(runGate()).toBe(0)
  })
})
