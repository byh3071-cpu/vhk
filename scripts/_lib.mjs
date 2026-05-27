// 게이트 스크립트(.mjs) 공통 헬퍼. Windows / macOS / Linux 모두에서 동작.
// src/lib/exec.ts 의 safeExecFile 패턴과 동일하지만 ts-build 없이 Node 직실행 가능.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const SHIM_BINS = new Set(['pnpm', 'npm', 'npx', 'yarn'])

function resolveCmd(cmd, args) {
  if (process.platform === 'win32' && SHIM_BINS.has(cmd)) {
    // Windows: .cmd shim 직접 호출은 Node 20.12+ CVE-2024-27980 으로 spawnSync EINVAL.
    // cmd.exe /d /s /c 래핑해서 shell:false 유지하면서 동작.
    return { bin: 'cmd.exe', argv: ['/d', '/s', '/c', `${cmd}.cmd`, ...args] }
  }
  return { bin: cmd, argv: args }
}

export function safeExec(cmd, args) {
  const { bin, argv } = resolveCmd(cmd, args)
  try {
    const out = execFileSync(bin, argv, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString()
    return { ok: true, out: out.trim() }
  } catch (err) {
    const stdout = err?.stdout ? err.stdout.toString() : ''
    const msg = err?.message ?? String(err)
    return { ok: false, err: msg, out: stdout.trim() }
  }
}

export function hardStopActive() {
  return existsSync('.vhk/HARD_STOP')
}

export function ensureNoHardStop(goalLabel) {
  if (hardStopActive()) {
    console.log(`🛑 .vhk/HARD_STOP detected — refusing to run ${goalLabel} gate.`)
    process.exit(1)
  }
}
