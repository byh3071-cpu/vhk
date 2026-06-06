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

// `KEY=value` 줄에서 KEY 만 추출. 주석(#)·빈 줄·'=' 없는 줄은 무시.
// `export KEY=` 접두사 허용(.env.example 관례). nested/multiline 미지원(flat 만).
export function parseEnvKeys(content: string): string[] {
  const keys: string[] = []
  for (const raw of content.split(/\r?\n/)) {
    let line = raw.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('export ')) line = line.slice('export '.length).trim()
    const idx = line.indexOf('=')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    if (key) keys.push(key)
  }
  return keys
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
  const required = parseEnvKeys(input.exampleContent)
  if (required.length === 0) {
    return { name, status: 'skip', detail: '.env.example 에 필수 키 없음', severity }
  }
  const present = input.envContent === null ? [] : parseEnvKeys(input.envContent)
  const missing = missingEnvKeys(required, present)
  if (missing.length === 0) {
    return { name, status: 'pass', detail: `${required.length}/${required.length} keys present`, severity }
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
