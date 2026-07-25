import fs from 'node:fs'
import path from 'node:path'
import { SECRET_PATTERNS, maskSecret, type SecretFinding } from './secret-patterns.js'
import { walkProjectFiles, MAX_SCAN_FILE_BYTES } from './scan-files.js'

export const MAX_SECRET_FINDINGS = 200
const MAX_LINE_CHARS = 4_000
const PLACEHOLDER_MARKER =
  /(?:example|placeholder|your[_-]|fake[_-]|dummy|redacted|changeme|replace[_-]?me|x{4,}|<[^>]+>)/i
const STATUS_KEY_PREFIX = /^(?:missing|invalid|status|error|has|is|needs?)[_-]/i

function globalPattern(pattern: RegExp): RegExp {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
  return new RegExp(pattern.source, flags)
}

/** Stripe/Polar 등 벤더가 명시한 test 접두 — live 키가 아님(secret-patterns stripe-live-key 도 sk_test_ 제외). */
const VENDOR_TEST_KEY_PREFIX = /^(?:sk|pk|rk)_test_|^(?:whsk)_test/i

function isGenericApiKeyFalsePositive(matchText: string): boolean {
  const delimiterIndex = matchText.search(/[:=]/)
  if (delimiterIndex < 0) return false
  const key = matchText.slice(0, delimiterIndex).trim()
  const delimiter = matchText[delimiterIndex]
  if (delimiter === ':' && STATUS_KEY_PREFIX.test(key)) return true
  const value = matchText.slice(delimiterIndex + 1).trim().replace(/^['"]/, '')
  if (VENDOR_TEST_KEY_PREFIX.test(value)) return true
  return PLACEHOLDER_MARKER.test(value)
}

export type GitleaksIgnoreRule = {
  /** repo-relative path (posix) */
  path: string
  /** gitleaks rule id ≈ our patternId (optional) */
  rule?: string
  line?: number
}

/**
 * `.gitleaksignore` 파싱.
 * 지원 형식:
 * - `# comment`
 * - `commitHash:path:rule:line` (gitleaks fingerprint 줄 — path/rule/line 사용)
 * - `path` 단독
 */
export function parseGitleaksIgnore(content: string): GitleaksIgnoreRule[] {
  const rules: GitleaksIgnoreRule[] = []
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.split(':')
    // commit(40hex):path:rule:line
    if (parts.length >= 4 && /^[a-f0-9]{7,40}$/i.test(parts[0])) {
      const lineNo = Number(parts[parts.length - 1])
      const rule = parts[parts.length - 2]
      const pathParts = parts.slice(1, parts.length - 2)
      const filePath = pathParts.join(':').replace(/\\/g, '/')
      if (!filePath) continue
      rules.push({
        path: filePath,
        rule,
        line: Number.isFinite(lineNo) ? lineNo : undefined,
      })
      continue
    }
    // bare path
    rules.push({ path: line.replace(/\\/g, '/') })
  }
  return rules
}

export function loadGitleaksIgnoreRules(cwd: string): GitleaksIgnoreRule[] {
  const fp = path.join(cwd, '.gitleaksignore')
  if (!fs.existsSync(fp)) return []
  try {
    return parseGitleaksIgnore(fs.readFileSync(fp, 'utf-8'))
  } catch {
    return []
  }
}

export function isFindingIgnoredByGitleaks(
  finding: SecretFinding,
  rules: GitleaksIgnoreRule[],
): boolean {
  if (rules.length === 0) return false
  const file = finding.file.replace(/\\/g, '/')
  for (const r of rules) {
    if (r.path !== file) continue
    if (r.rule && r.rule !== finding.patternId) continue
    if (typeof r.line === 'number' && r.line !== finding.line) continue
    return true
  }
  return false
}

/** allowlist 적용 — 매칭 finding 제거(gitleaks 와 동일 의도: 사람 확인 픽스처). */
export function applyGitleaksIgnore(
  findings: SecretFinding[],
  rules: GitleaksIgnoreRule[],
): SecretFinding[] {
  if (rules.length === 0) return findings
  return findings.filter((f) => !isFindingIgnoredByGitleaks(f, rules))
}

// #316: .env.example/.sample/.template 은 '시크릿 값 없는 커밋용 템플릿'(risk-policy.ts 의
//   RISKY_TARGET_PATTERNS 예외·check-secure.ts 의 isSensitiveName(.example/.sample 제외)와 정합). 이 파일들의
//   비주석 KEY=value placeholder(ghp_xxxx· secret_xxxx 등)는 진짜 시크릿이 아니라 예시값이다.
//   → 값-기반 PLACEHOLDER_MARKER 검사를 주석 게이트 없이도 허용(아래 findSecretsInLine).
//   ⚠️ 완화 범위는 '명백한 placeholder 값'(marker 매칭)에 한정 — 진짜처럼 보이는 토큰은 여전히 CRITICAL.
const ENV_TEMPLATE_SUFFIX = /\.(?:example|sample|template)$/i

/** 파일이 env 템플릿(.env.example/.sample/.template)인가(Windows 역슬래시 정규화). */
export function isEnvTemplateFile(file: string): boolean {
  const norm = file.replace(/\\/g, '/')
  const base = norm.slice(norm.lastIndexOf('/') + 1)
  return base.startsWith('.env') && ENV_TEMPLATE_SUFFIX.test(base)
}

/** 한 줄에서 시크릿 패턴 검색 (global regex 중복 버그 방지) */
export function findSecretsInLine(
  line: string,
  relPath: string,
  lineNum: number,
): SecretFinding[] {
  const found: SecretFinding[] = []
  const trimmed = line.trim()
  if (line.length > MAX_LINE_CHARS) return found
  // #218: 주석줄이라고 줄 전체를 스킵하면('example' 포함 시) 주석에 섞인 진짜 시크릿을 놓친다
  //       (보안 false-negative). 매칭된 '값' 자체가 placeholder(…EXAMPLE 등)일 때만 그 매치를 무시한다.
  // #250: 블록주석(/** */·* 연속줄·/*)도 주석으로 인식 + placeholder 표식 확대(YOUR_·xxxx 등).
  //       단 isComment 게이트 안에서만 동작 → 진짜 토큰은 주석/코드 어디서든 여전히 탐지(false-negative 0).
  const isComment =
    trimmed.startsWith('//') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*')
  // #316: env 템플릿(.env.example/.sample/.template)은 placeholder 값-기반 무시를 주석 게이트
  //       없이도 허용 — 비주석 KEY=value 예시값(ghp_xxxx 등)이 진짜 시크릿으로 오탐되던 버그.
  //       isComment 게이트 자체는 #218/#250 보호라 유지 — 템플릿 파일에서만 추가로 푼다(보수적).
  const allowValuePlaceholder = isComment || isEnvTemplateFile(relPath)

  for (const pattern of SECRET_PATTERNS) {
    const regex = globalPattern(pattern.pattern)
    for (const match of line.matchAll(regex)) {
      // Generic 패턴은 실제 토큰 형식을 모르는 보조 탐지다. 예제 env 값과
      // missing_api_key 같은 상태 식별자는 값처럼 보여도 자격증명이 아니다.
      if (pattern.id === 'generic-api-key' && isGenericApiKeyFalsePositive(match[0])) continue
      // placeholder 표식이 매칭값에 있으면(주석 또는 env 템플릿 한정) 무시
      //   — your_·fake_·dummy·redacted·changeme·xxxx·<...>. 명백한 placeholder 값만, false-negative 0.
      if (allowValuePlaceholder && PLACEHOLDER_MARKER.test(match[0]))
        continue // placeholder 시크릿만 무시
      found.push({
        patternId: pattern.id,
        patternName: pattern.name,
        severity: pattern.severity,
        file: relPath,
        line: lineNum,
        match: maskSecret(match[0]),
      })
    }
  }

  return found
}

export type ProjectSecretScan = {
  findings: SecretFinding[]
  scannedFiles: number
  truncated: boolean
  /**
   * Goal 59: 스캔이 불완전해진 사유(중복 제거). 빈 배열 = 완전 스캔.
   * 'findings-cap'(발견 200건 한도) · 'line-length'(4000자 초과 줄 스킵) · 'file-size'(512KB 초과 파일 스킵).
   */
  truncationReasons: string[]
}

export function scanProjectForSecrets(cwd: string): ProjectSecretScan {
  const findings: SecretFinding[] = []
  let scannedFiles = 0
  // findings 한도 도달 → 더 모으지 않음(작업량 bound). 불완전 '사유'와는 분리한다 —
  // 사유로 조기 return 하면(예: 큰 파일 1개 만나고 truncated=true) 뒤 파일 스캔이 끊겨 severe 누락(false-negative).
  let cappedFindings = false
  const reasons = new Set<string>()

  walkProjectFiles(
    cwd,
    (filePath, relPath) => {
      scannedFiles++
      const content = fs.readFileSync(filePath, 'utf-8')
      const lines = content.split('\n')

      lines.forEach((line, idx) => {
        if (cappedFindings) return
        // Goal 59: 4000자 초과 줄은 findSecretsInLine 가 조용히 스킵하던 사각 → 사유로 노출(스캔은 계속).
        if (line.length > MAX_LINE_CHARS) {
          reasons.add('line-length')
          return
        }
        const lineFindings = findSecretsInLine(line, relPath, idx + 1)
        for (const f of lineFindings) {
          findings.push(f)
          if (findings.length >= MAX_SECRET_FINDINGS) {
            cappedFindings = true
            reasons.add('findings-cap')
            return
          }
        }
      })
    },
    undefined,
    // Goal 59: 512KB 초과로 walk 가 스킵한 파일 → 불완전 신호.
    () => {
      reasons.add('file-size')
    }
  )

  // dogfood: 레포 `.gitleaksignore` 존중(verify/secure/save 공통 경로)
  const allowed = applyGitleaksIgnore(findings, loadGitleaksIgnoreRules(cwd))
  return {
    findings: allowed,
    scannedFiles,
    truncated: reasons.size > 0,
    truncationReasons: [...reasons],
  }
}

export type DraftScanResult = {
  findings: SecretFinding[]
  scannedFiles: number
  /** 스캔 못 한 입력의 사유(없음·디렉터리·읽기 실패) — 조용한 통과 금지(#457 정직성). */
  errors: string[]
}

/**
 * #457 — 명시 경로(발행물 초안) 스캔. 전체 스캔과 달리 확장자 필터를 두지 않는다:
 * 초안은 대부분 .md 인데 SCAN_EXTENSIONS 가 md 를 제외해 발행물이 사각이었음.
 * v1 은 파일만 받는다(디렉터리는 errors 로 안내) — 발행 직전 초안 몇 개가 대상이라 walk 불필요.
 */
export function scanFilesForSecrets(paths: string[], cwd: string): DraftScanResult {
  const findings: SecretFinding[] = []
  const errors: string[] = []
  let scannedFiles = 0

  // 같은 파일 중복 지정 시 findings·계측이 2중으로 잡히는 것 방지(적대검증 경미-3).
  for (const p of [...new Set(paths)]) {
    const abs = path.isAbsolute(p) ? p : path.join(cwd, p)
    let stat: fs.Stats
    try {
      stat = fs.statSync(abs)
    } catch {
      errors.push(`${p}: 파일 없음`)
      continue
    }
    if (stat.isDirectory()) {
      errors.push(`${p}: 디렉터리는 아직 미지원 — 초안 파일을 직접 지정하세요`)
      continue
    }
    if (stat.size > MAX_SCAN_FILE_BYTES) {
      errors.push(`${p}: ${MAX_SCAN_FILE_BYTES / 1024}KB 초과 — 스캔 스킵`)
      continue
    }
    let content: string
    try {
      content = fs.readFileSync(abs, 'utf-8')
    } catch (e) {
      errors.push(`${p}: 읽기 실패 (${e instanceof Error ? e.message : String(e)})`)
      continue
    }
    scannedFiles++
    const rel = path.relative(cwd, abs) || p
    let skippedLongLines = 0
    for (const [idx, line] of content.split('\n').entries()) {
      // 게이트의 정직성(적대검증 치명-1): findSecretsInLine 은 4000자 초과 줄을 조용히 건너뛴다
      // — 전체 스캔은 truncationReasons 로 노출하는데 초안 스캔이 이를 빼먹으면
      // base64/설정 덤프 속 시크릿이 "깨끗" 판정되는 false-negative. errors 로 표면화한다.
      if (line.length > MAX_LINE_CHARS) {
        skippedLongLines++
        continue
      }
      findings.push(...findSecretsInLine(line, rel, idx + 1))
      if (findings.length >= MAX_SECRET_FINDINGS) {
        errors.push(`${p}: 발견 ${MAX_SECRET_FINDINGS}건 한도 도달 — 이후 미수집`)
        break
      }
    }
    if (skippedLongLines > 0) {
      errors.push(`${p}: 초장문 라인(${MAX_LINE_CHARS}자 초과) ${skippedLongLines}줄 미검사 — 통과 판정 불가`)
    }
    if (findings.length >= MAX_SECRET_FINDINGS) break
  }

  return { findings, scannedFiles, errors }
}

export function filterSevereFindings(findings: SecretFinding[]): SecretFinding[] {
  return findings.filter(f => f.severity === 'critical' || f.severity === 'high')
}

// Goal 83: 테스트 픽스처/예시 토큰이 정상적으로 들어가는 경로(가짜 토큰 = 유출 아님).
//   tests/·test/·__tests__/·__mocks__/·fixtures?/·__fixtures__/ 디렉터리 또는 *.test.*·*.spec.* 파일.
//   보수적으로 좁힌다 — 'latest.ts' 처럼 'test' 부분문자열만 있는 경로는 제외(경계 필수).
const TEST_FIXTURE_PATH =
  /(?:^|\/)(?:tests?|__tests__|__mocks__|fixtures?|__fixtures__)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/i

/** 경로가 테스트 픽스처 컨텍스트인가(Windows 역슬래시 정규화). */
export function isTestFixturePath(file: string): boolean {
  return TEST_FIXTURE_PATH.test(file.replace(/\\/g, '/'))
}

/**
 * Goal 83: 테스트 픽스처(가짜 토큰)의 MEDIUM 발견을 INFO 로 강등 — secure 리포트 false positive 노이즈↓.
 *   - 픽스처 경로 + severity 'medium' 만 강등(현재 medium 패턴은 JWT 단 하나 — generic-api-key 등은 high 라 미강등).
 *   - CRITICAL/HIGH 는 위치 무관 유지(약화 금지 — 실제 자격증명 포맷은 픽스처여도 두면 안 됨, Forbidden).
 *   - 강등은 제거가 아니다(INFO 로 여전히 노출) → 신호 보존, filterSevereFindings(critical/high)도 불변.
 */
export function downgradeTestFixtureFindings(findings: SecretFinding[]): SecretFinding[] {
  return findings.map((f) =>
    f.severity === 'medium' && isTestFixturePath(f.file) ? { ...f, severity: 'info' as const } : f
  )
}
