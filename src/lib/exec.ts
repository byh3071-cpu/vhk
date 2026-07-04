import { execFileSync, execFile } from 'node:child_process'
import { promisify } from 'node:util'

// execFile(callback) → Promise. Node 가 exec/execFile 에 한해 custom promisify 를 제공해
// 실패(reject) 시에도 err.stdout/err.stderr 가 보존된다(아래 비동기 에러 파싱이 sync 와 동일하게 동작).
const execFileAsync = promisify(execFile)

// Windows에서 pnpm/npm/npx/yarn/vhk는 .cmd shim. execFileSync는 native 바이너리만 찾으므로 .cmd 확장자 부여.
// #150: 'vhk' 추가 — 전역 설치 시 vhk.cmd 만 노출돼 MCP 가 bare 'vhk' spawn 시 ENOENT 였음.
// #246: 배포 CLI(vercel/netlify/wrangler) 추가 — npm 전역 설치 시 .cmd shim 만 노출돼
//       deploy 의 isCLIAvailable 가 Windows 에서 설치돼 있어도 ENOENT 로 "미설치" 오판.
const SHIM_BINARIES = new Set(['pnpm', 'npm', 'npx', 'yarn', 'vhk', 'vercel', 'netlify', 'wrangler'])

export function platformCmd(cmd: string): string {
  if (process.platform === 'win32' && SHIM_BINARIES.has(cmd)) {
    return `${cmd}.cmd`
  }
  return cmd
}

// 실패 시 stderr 도 노출(Goal 46): git-repo 등이 throw 메시지에 실제 git 에러를 담을 수 있게.
export type ExecResult =
  | { ok: true; out: string }
  | { ok: false; err: string; out: string; stderr?: string }

// resolveCmd 의 Windows shim 경로(cmd.exe /c)는 오늘 기준 실제 호출부(전부 코드 내부 리터럴
// 인자)엔 안 걸리지만, safeExecFile 은 범용 함수라 미래 호출부가 cwd·파일명 등 오염된 값을
// shim 바이너리 인자로 넘기면 위험해질 수 있다 — 직접 프로브로 실증: 따옴표+&|<>^%  조합이
// cmd.exe 의 인용 경계를 탈출해 실제 명령 인젝션으로 이어짐(CVE-2024-27980 과 같은 근본원인
// 클래스). "제대로 이스케이프"는 이 클래스에서 반복적으로 CVE 를 낳아온 함정이라(cmd.exe 자체
// 파싱이 인용부호 안에서도 특별 취급하는 경우가 있음) — 위험 문자 있으면 아예 거부(fail-closed).
const CMD_SHELL_METACHARS = /[&|<>^%"\r\n]/

// resolveCmd 의 반환값: 정상 해석 또는 하드닝 거부. 예외 대신 값으로 표현해
// safeExecFile* 세 함수의 "절대 throw 안 함" 계약을 그대로 유지한다. ok 로 구분(ExecResult 와
// 동일 관례) — rejected?:undefined 같은 truthiness 기반 구분은 빈 문자열 케이스에서 TS 좁히기가
// 안 먹어서(string 이 falsy 일 수 있어 완전한 discriminant 가 아님) ok 불리언으로 통일.
type ResolvedCmd = { ok: true; bin: string; argv: string[] } | { ok: false; err: string }

// Windows .cmd shim 호출은 Node 20.12+ / 21.7+ CVE-2024-27980 보안 강화로 execFileSync 직접 호출 시
// spawnSync EINVAL. cmd.exe /d /s /c <shim>.cmd <args>로 래핑 — shell:false 유지하면서 동작.
// /d: AutoRun 무시, /s: 따옴표 처리 강화, /c: 명령 실행 후 종료.
function resolveCmd(cmd: string, args: string[]): ResolvedCmd {
  if (process.platform === 'win32' && SHIM_BINARIES.has(cmd)) {
    const bad = args.find((a) => CMD_SHELL_METACHARS.test(a))
    if (bad !== undefined) {
      return {
        ok: false,
        err: `안전하지 않은 인자 거부 — Windows shim(${cmd}) 호출에 cmd.exe 특수문자 포함 인자가 있습니다: ${JSON.stringify(bad)}`,
      }
    }
    return { ok: true, bin: 'cmd.exe', argv: ['/d', '/s', '/c', `${cmd}.cmd`, ...args] }
  }
  return { ok: true, bin: platformCmd(cmd), argv: args }
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
  // 작업 디렉터리(Goal 46). 미지정 시 process.cwd(). git-repo 등 cwd 의존 호출의 단일 통로화.
  cwd?: string
  // out.trim() 적용 여부(기본 true). false 면 raw 출력 보존 —
  // `git status --porcelain` 의 선행 공백(" M file") 등 의미있는 공백을 깎으면 안 되는 경우.
  trimOutput?: boolean
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
  const resolved = resolveCmd(cmd, args)
  if (!resolved.ok) return { ok: false, err: resolved.err, out: '' }
  const { bin, argv } = resolved
  const env = opts.env ? { ...process.env, ...opts.env } : undefined
  const timeout = resolveTimeout(opts.timeoutMs, DEFAULT_EXEC_TIMEOUT_MS)
  try {
    const out = execFileSync(bin, argv, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      ...(opts.cwd ? { cwd: opts.cwd } : {}),
      ...(timeout ? { timeout, killSignal: 'SIGTERM' as const } : {}),
    }).toString()
    // trimOutput !== false → trim(기본). false 면 raw 보존(porcelain 선행 공백 등).
    return { ok: true, out: opts.trimOutput === false ? out : out.trim() }
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
    const stderr = e.stderr ? e.stderr.toString().trim() : ''
    let msg = e.message ?? String(err)
    if (isTimeoutError(e, timeout)) {
      msg = `명령 시간 초과 (timeout ${timeout}ms): ${cmd} ${args.join(' ')}`.trim()
    }
    return { ok: false, err: msg, out: stdout.trim(), stderr: stderr || undefined }
  }
}

// safeExecFile 의 비동기(non-blocking) 쌍둥이. 동작 의미(ExecResult 모양·env 병합·timeout·
// cwd·trimOutput·Windows .cmd shim 해석·실패 시 stdout/stderr 보존)는 sync 와 동일하게 유지하되,
// execFileSync 가 이벤트루프를 막는 것을 promisified execFile 로 해소한다(장시간 build/test 가
// MCP stdio 서버의 다른 요청을 블로킹하지 않게 — server.ts ship 핸들러용).
// 외부 의존성(execa 등) 추가 없이 node:child_process 내장 API 만 사용 — 공개 CLI 의존성 표면 보존.
export async function safeExecFileAsync(
  cmd: string,
  args: string[],
  opts: SafeExecOptions = {}
): Promise<ExecResult> {
  const resolved = resolveCmd(cmd, args)
  if (!resolved.ok) return { ok: false, err: resolved.err, out: '' }
  const { bin, argv } = resolved
  const env = opts.env ? { ...process.env, ...opts.env } : undefined
  const timeout = resolveTimeout(opts.timeoutMs, DEFAULT_EXEC_TIMEOUT_MS)
  try {
    const { stdout } = await execFileAsync(bin, argv, {
      encoding: 'utf-8',
      env,
      ...(opts.cwd ? { cwd: opts.cwd } : {}),
      ...(timeout ? { timeout, killSignal: 'SIGTERM' as const } : {}),
    })
    const out = stdout.toString()
    // trimOutput !== false → trim(기본). false 면 raw 보존(porcelain 선행 공백 등).
    return { ok: true, out: opts.trimOutput === false ? out : out.trim() }
  } catch (err) {
    // non-zero exit / timeout kill: stdout/stderr 는 err.stdout/err.stderr 에 보존됨(sync 와 동일).
    const e = err as {
      stdout?: Buffer | string
      stderr?: Buffer | string
      message?: string
      killed?: boolean
      signal?: string
      code?: string
    }
    const stdout = e.stdout ? e.stdout.toString() : ''
    const stderr = e.stderr ? e.stderr.toString().trim() : ''
    let msg = e.message ?? String(err)
    // sync(spawnSync) 는 timeout 시 code='ETIMEDOUT' 를 주지만, async execFile 은 killSignal 로
    // 죽여 killed=true + signal 로 신호한다 → 둘 다 timeout 으로 라벨(메시지 파리티). ok=false 는 동일.
    if (timeout && (e.code === 'ETIMEDOUT' || (e.killed === true && (e.signal === 'SIGTERM' || e.signal === 'SIGKILL')))) {
      msg = `명령 시간 초과 (timeout ${timeout}ms): ${cmd} ${args.join(' ')}`.trim()
    }
    return { ok: false, err: msg, out: stdout.trim(), stderr: stderr || undefined }
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
  const resolved = resolveCmd(cmd, args)
  if (!resolved.ok) return { ok: false, err: resolved.err }
  const { bin, argv } = resolved
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
