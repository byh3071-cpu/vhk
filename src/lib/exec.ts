import { execFileSync } from 'node:child_process'

// Windows에서 pnpm/npm/npx/yarn은 .cmd shim. execFileSync는 native 바이너리만 찾으므로 .cmd 확장자 부여.
const SHIM_BINARIES = new Set(['pnpm', 'npm', 'npx', 'yarn'])

export function platformCmd(cmd: string): string {
  if (process.platform === 'win32' && SHIM_BINARIES.has(cmd)) {
    return `${cmd}.cmd`
  }
  return cmd
}

export type ExecResult = { ok: true; out: string } | { ok: false; err: string; out: string }

// Windows .cmd shim 호출은 Node 20.12+ / 21.7+ CVE-2024-27980 보안 강화로 execFileSync 직접 호출 시
// spawnSync EINVAL. cmd.exe /d /s /c <shim>.cmd <args>로 래핑 — shell:false 유지하면서 동작.
// /d: AutoRun 무시, /s: 따옴표 처리 강화, /c: 명령 실행 후 종료.
// shim args는 publish/deploy 등 코드 내부 리터럴만 → cmd.exe argv parsing 안전.
function resolveCmd(cmd: string, args: string[]): { bin: string; argv: string[] } {
  if (process.platform === 'win32' && SHIM_BINARIES.has(cmd)) {
    return { bin: 'cmd.exe', argv: ['/d', '/s', '/c', `${cmd}.cmd`, ...args] }
  }
  return { bin: platformCmd(cmd), argv: args }
}

export interface SafeExecOptions {
  // process.env 위에 병합할 환경변수. MCP 모드 ANSI 차단 (FORCE_COLOR=0, NO_COLOR=1) 등에 사용.
  // 전체 교체 아닌 병합 — process.env 의 PATH/HOME 등을 잃지 않음.
  env?: Record<string, string>
}

export function safeExecFile(
  cmd: string,
  args: string[],
  opts: SafeExecOptions = {}
): ExecResult {
  const { bin, argv } = resolveCmd(cmd, args)
  const env = opts.env ? { ...process.env, ...opts.env } : undefined
  try {
    const out = execFileSync(bin, argv, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    }).toString()
    return { ok: true, out: out.trim() }
  } catch (err) {
    // non-zero exit: stdout/stderr는 err.stdout/err.stderr에 담겨 있다.
    // 예: `npm audit`은 취약점 있으면 exit !=0이지만 stdout에 JSON 출력.
    const e = err as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string }
    const stdout = e.stdout ? e.stdout.toString() : ''
    const msg = e.message ?? String(err)
    return { ok: false, err: msg, out: stdout.trim() }
  }
}

export type StreamResult = { ok: true } | { ok: false; err: string }

// 자식 프로세스의 stdin/stdout/stderr를 현재 터미널에 그대로 연결한다.
// 장시간 작업(vercel deploy, netlify deploy, pnpm build 등)의 실시간 로그가 사용자에게 보임.
// 반환값에 out 필드는 없음 — 출력은 이미 터미널에 흘러감.
export function safeExecFileStream(cmd: string, args: string[]): StreamResult {
  const { bin, argv } = resolveCmd(cmd, args)
  try {
    execFileSync(bin, argv, {
      encoding: 'utf-8',
      stdio: 'inherit',
    })
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, err: msg }
  }
}
