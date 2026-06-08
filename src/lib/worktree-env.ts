import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Goal 29 preflight ↔ Goal 30 worktree 공유 모듈.
// worktree 의 필수 env 키가 채워졌는지 점검한다. SoT = .env.example 의 키 목록.
// 순수 함수(parse/missing) + 얇은 IO 래퍼(checkWorktreeEnv) 로 분리 — 테스트·재사용 용이.

export type Severity = 'critical' | 'high' | 'normal'
export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip'

export interface EnvCheckResult {
  name: string
  status: CheckStatus
  detail: string
  severity: Severity
}

export interface EnvKeySpec {
  key: string
  /** #172: 트레일링 `# ... optional ...` 주석이 붙은 키 → 누락해도 preflight 차단 안 함. */
  optional: boolean
}

// `KEY=value [# optional]` 줄을 파싱 — 키 + 선택 여부(#172). 주석(#)·빈 줄·'=' 없는 줄은 무시.
// `export KEY=` 접두사 허용(.env.example 관례). nested/multiline 미지원(flat 만).
// 선택 판정: '=' 뒤(값 영역)에 시작하는 주석(#)에 'optional' 단어가 있으면 선택 키.
// (값 중간의 # — 예: PASS=ab#cd — 도 주석으로 보지만 'optional' 없으면 필수 유지 → 오탐 0.)
export function parseEnvSpec(content: string): EnvKeySpec[] {
  const specs: EnvKeySpec[] = []
  for (const raw of content.split(/\r?\n/)) {
    let line = raw.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('export ')) line = line.slice('export '.length).trim()
    const idx = line.indexOf('=')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    if (!key) continue
    const afterEq = line.slice(idx + 1)
    // #220: .env 관례상 값 뒤 주석은 '공백 다음의 #'. 값에 붙은 #(예: key#optional)은 데이터 →
    //        주석으로 보지 않는다(필수 키를 optional 로 오탐하지 않게).
    const commentMatch = afterEq.match(/\s#(.*)$/)
    const comment = commentMatch ? commentMatch[1] : ''
    specs.push({ key, optional: /\boptional\b/i.test(comment) })
  }
  return specs
}

// `KEY=value` 줄에서 KEY 만 추출(선택 여부 무시 — present 비교용). parseEnvSpec 의 키 투영.
export function parseEnvKeys(content: string): string[] {
  return parseEnvSpec(content).map((s) => s.key)
}

// required 중 present 에 없는 키만 반환(순서 보존).
export function missingEnvKeys(required: string[], present: string[]): string[] {
  const have = new Set(present)
  return required.filter((k) => !have.has(k))
}

// .env.example(필수 SoT) ↔ 실제 env 파일 비교. 비밀값은 절대 읽지/로그하지 않고 키 존재만 본다.
// exampleContent === null → 필수 명세 없음 → skip(강제 안 함).
export function checkWorktreeEnv(input: {
  exampleContent: string | null
  envContent: string | null
}): EnvCheckResult {
  const name = 'worktree env'
  const severity: Severity = 'critical'
  if (input.exampleContent === null) {
    return { name, status: 'skip', detail: '.env.example 없음 — 필수 키 명세 없음', severity }
  }
  // #172: `# optional` 마커가 붙은 키는 필수에서 제외 — 문서화된 선택 설정이 출고를 막지 않게.
  const spec = parseEnvSpec(input.exampleContent)
  const required = spec.filter((s) => !s.optional).map((s) => s.key)
  const optionalCount = spec.length - required.length
  const optSuffix = optionalCount ? ` (+${optionalCount} optional)` : ''
  if (required.length === 0) {
    return { name, status: 'skip', detail: '.env.example 에 필수 키 없음' + optSuffix, severity }
  }
  const present = input.envContent === null ? [] : parseEnvKeys(input.envContent)
  const missing = missingEnvKeys(required, present)
  if (missing.length === 0) {
    return { name, status: 'pass', detail: `${required.length}/${required.length} required keys present${optSuffix}`, severity }
  }
  return {
    name,
    status: 'fail',
    detail: `누락 ${missing.length}개: ${missing.join(', ')}`,
    severity,
  }
}

// 실제 디렉터리에서 .env.example + env 파일을 읽어 점검(IO 래퍼).
// env 후보: .env.local 우선(Vite 관례), 없으면 .env. 비밀값은 읽되 키 추출 외 사용/로그 금지.
export function checkWorktreeEnvDir(cwd: string): EnvCheckResult {
  const read = (p: string): string | null => {
    const fp = join(cwd, p)
    return existsSync(fp) ? readFileSync(fp, 'utf-8') : null
  }
  const exampleContent = read('.env.example')
  const envContent = read('.env.local') ?? read('.env')
  return checkWorktreeEnv({ exampleContent, envContent })
}
