import { execFileSync } from 'node:child_process'

// Windows에서 pnpm/npm/npx/yarn은 .cmd shim. execFileSync는 native 바이너리만 찾으므로 .cmd 확장자 부여.
const SHIM_BINARIES = new Set(['pnpm', 'npm', 'npx', 'yarn'])

export function platformCmd(cmd: string): string {
  if (process.platform === 'win32' && SHIM_BINARIES.has(cmd)) {
    return `${cmd}.cmd`
  }
  return cmd
}

export type ExecResult = { ok: true; out: string } | { ok: false; err: string }

export function safeExecFile(cmd: string, args: string[]): ExecResult {
  try {
    const out = execFileSync(platformCmd(cmd), args, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString()
    return { ok: true, out: out.trim() }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, err: msg }
  }
}
