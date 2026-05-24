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

export type StreamResult = { ok: true } | { ok: false; err: string }

// 자식 프로세스의 stdin/stdout/stderr를 현재 터미널에 그대로 연결한다.
// 장시간 작업(vercel deploy, netlify deploy, pnpm build 등)의 실시간 로그가 사용자에게 보임.
// 반환값에 out 필드는 없음 — 출력은 이미 터미널에 흘러감.
export function safeExecFileStream(cmd: string, args: string[]): StreamResult {
  try {
    execFileSync(platformCmd(cmd), args, {
      encoding: 'utf-8',
      stdio: 'inherit',
    })
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, err: msg }
  }
}
