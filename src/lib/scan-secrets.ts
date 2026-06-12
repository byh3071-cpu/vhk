import fs from 'node:fs'
import { SECRET_PATTERNS, maskSecret, type SecretFinding } from './secret-patterns.js'
import { walkProjectFiles } from './scan-files.js'

export const MAX_SECRET_FINDINGS = 200
const MAX_LINE_CHARS = 4_000
const PLACEHOLDER_MARKER =
  /(?:example|placeholder|your[_-]|fake[_-]|dummy|redacted|changeme|replace[_-]?me|x{4,}|<[^>]+>)/i
const STATUS_KEY_PREFIX = /^(?:missing|invalid|status|error|has|is|needs?)[_-]/i

function globalPattern(pattern: RegExp): RegExp {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
  return new RegExp(pattern.source, flags)
}

function isGenericApiKeyFalsePositive(matchText: string): boolean {
  const delimiterIndex = matchText.search(/[:=]/)
  if (delimiterIndex < 0) return false
  const key = matchText.slice(0, delimiterIndex).trim()
  const delimiter = matchText[delimiterIndex]
  if (delimiter === ':' && STATUS_KEY_PREFIX.test(key)) return true
  const value = matchText.slice(delimiterIndex + 1).trim().replace(/^['"]/, '')
  return PLACEHOLDER_MARKER.test(value)
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

  for (const pattern of SECRET_PATTERNS) {
    const regex = globalPattern(pattern.pattern)
    for (const match of line.matchAll(regex)) {
      // Generic 패턴은 실제 토큰 형식을 모르는 보조 탐지다. 예제 env 값과
      // missing_api_key 같은 상태 식별자는 값처럼 보여도 자격증명이 아니다.
      if (pattern.id === 'generic-api-key' && isGenericApiKeyFalsePositive(match[0])) continue
      // placeholder 표식이 매칭값에 있으면(주석 한정) 무시 — your_·fake_·dummy·redacted·changeme·xxxx·<...>
      if (isComment && PLACEHOLDER_MARKER.test(match[0]))
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

  return { findings, scannedFiles, truncated: reasons.size > 0, truncationReasons: [...reasons] }
}

export function filterSevereFindings(findings: SecretFinding[]): SecretFinding[] {
  return findings.filter(f => f.severity === 'critical' || f.severity === 'high')
}
