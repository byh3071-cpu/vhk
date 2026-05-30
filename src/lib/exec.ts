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

// 기본 timeout 정책 — 외부 명령 hang 방지 backstop.
// 10분: 정상적인 build/test/publish(2FA 제외) 는 절대 안 걸리고, 진짜 hang 만 끊는다.
// 기존 호출 호환성 유지 (어떤 정상 호출도 10분을 넘기지 않음).
export const DEFAULT_EXEC_TIMEOUT_MS = 600_000
// 네트워크 호출 (npm view 등) 전용 — 레지스트리 장애 시 빠르게 실패.
export const NETWORK_EXEC_TIMEOUT_MS = 30_000

export interface SafeExecOptions {
  // process.env 위에 병합할 환경변수. MCP 모드 ANSI 차단 (FORCE_COLOR=0, NO_COLOR=1) 등에 사용.
  // 전체 교체 아닌 병합 — process.env 의 PATH/HOME 등을 잃지 않음.
  env?: Record<string, string>
  // 외부 명령 hang 방지용 timeout(ms). 미지정 시 DEFAULT_EXEC_TIMEOUT_MS.
  // 0 이하면 timeout 비활성 (무한 대기 — 대화형 입력 대기 등 특수 경우).
  timeoutMs?: number
}

// 적용할 timeout(ms) 계산. undefined 반환 = timeout 미적용.
function resolveTimeout(timeoutMs: number | undefined, fallback: number): number | undefined {
  const v = timeoutMs === undefined ? fallback : timeoutMs
  return v > 0 ? v : undefined
}

// execFileSync(=spawnSync) 가 timeout 으로 죽인 경우 식별.
// spawnSync 는 timeout 발사 시 err.code='ETIMEDOUT' 를 크로스플랫폼으로 설정한다.
// killed/signal 로도 판별하면 외부 시그널(Ctrl+C 등)에 의한 종료를 timeout 으로 오라벨할 수
// 있으므로 ETIMEDOUT 만 신뢰한다.
function isTimeoutError(e: { code?: string }, timeout?: number): boolean {
  if (!timeout) return false
  return e.code === 'ETIMEDOUT'
}

export function safeExecFile(
  cmd: string,
  args: string[],
  opts: SafeExecOptions = {}
): ExecResult {
  const { bin, argv } = resolveCmd(cmd, args)
  const env = opts.env ? { ...process.env, ...opts.env } : undefined
  const timeout = resolveTimeout(opts.timeoutMs, DEFAULT_EXEC_TIMEOUT_MS)
  try {
    const out = execFileSync(bin, argv, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      ...(timeout ? { timeout, killSignal: 'SIGTERM' as const } : {}),
    }).toString()
    return { ok: true, out: out.trim() }
  } catch (err) {
    // non-zero exit: stdout/stderr는 err.stdout/err.stderr에 담겨 있다.
    // 예: `npm audit`은 취약점 있으면 exit !=0이지만 stdout에 JSON 출력.
    const e = err as {
      stdout?: Buffer | string
      stderr?: Buffer | string
      message?: string
      killed?: boolean
      signal?: string
      code?: string
    }
    const stdout = e.stdout ? e.stdout.toString() : ''
    let msg = e.message ?? String(err)
    if (isTimeoutError(e, timeout)) {
      msg = `명령 시간 초과 (timeout ${timeout}ms): ${cmd} ${args.join(' ')}`.trim()
    }
    return { ok: false, err: msg, out: stdout.trim() }
  }
}

export type StreamResult = { ok: true } | { ok: false; err: string }

export interface SafeExecStreamOptions {
  // 대화형 명령(npm publish 2FA OTP 입력 등) hang 방지용 opt-in timeout(ms).
  // 기본 미적용 — stream 호출은 사용자 입력 대기가 정상 동작이므로 호출부가 명시할 때만 건다.
  timeoutMs?: number
}

// 자식 프로세스의 stdin/stdout/stderr를 현재 터미널에 그대로 연결한다.
// 장시간 작업(vercel deploy, netlify deploy, pnpm build 등)의 실시간 로그가 사용자에게 보임.
// 반환값에 out 필드는 없음 — 출력은 이미 터미널에 흘러감.
export function safeExecFileStream(
  cmd: string,
  args: string[],
  opts: SafeExecStreamOptions = {}
): StreamResult {
  const { bin, argv } = resolveCmd(cmd, args)
  // stream 은 기본 timeout 없음 (2FA OTP 입력 등 사용자 대기가 정상). opts 로만 opt-in.
  const timeout = opts.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : undefined
  try {
    execFileSync(bin, argv, {
      encoding: 'utf-8',
      stdio: 'inherit',
      ...(timeout ? { timeout, killSignal: 'SIGTERM' as const } : {}),
    })
    return { ok: true }
  } catch (err) {
    const e = err as { killed?: boolean; signal?: string; message?: string; code?: string }
    let msg = err instanceof Error ? err.message : String(err)
    if (isTimeoutError(e, timeout)) {
      msg = `명령 시간 초과 (timeout ${timeout}ms): ${cmd} ${args.join(' ')}`.trim()
    }
    return { ok: false, err: msg }
  }
}
