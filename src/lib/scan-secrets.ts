import fs from 'node:fs'
import { SECRET_PATTERNS, maskSecret, type SecretFinding } from './secret-patterns.js'
import { walkProjectFiles } from './scan-files.js'

export const MAX_SECRET_FINDINGS = 200
const MAX_LINE_CHARS = 4_000

function globalPattern(pattern: RegExp): RegExp {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
  return new RegExp(pattern.source, flags)
}

/** 한 줄에서 시크릿 패턴 검색 (global regex 중복 버그 방지) */
export function findSecretsInLine(
  line: string,
  relPath: string,
  lineNum: number,
): SecretFinding[] {
  const found: SecretFinding[] = []
  const trimmed = line.trim()
  if (trimmed.startsWith('//') && trimmed.includes('example')) return found
  if (trimmed.startsWith('#') && trimmed.includes('example')) return found
  if (line.length > MAX_LINE_CHARS) return found

  for (const pattern of SECRET_PATTERNS) {
    const regex = globalPattern(pattern.pattern)
    for (const match of line.matchAll(regex)) {
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
}

export function scanProjectForSecrets(cwd: string): ProjectSecretScan {
  const findings: SecretFinding[] = []
  let scannedFiles = 0
  let truncated = false

  walkProjectFiles(cwd, (filePath, relPath) => {
    scannedFiles++
    const content = fs.readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')

    lines.forEach((line, idx) => {
      if (truncated) return
      const lineFindings = findSecretsInLine(line, relPath, idx + 1)
      for (const f of lineFindings) {
        findings.push(f)
        if (findings.length >= MAX_SECRET_FINDINGS) {
          truncated = true
          return
        }
      }
    })
  })

  return { findings, scannedFiles, truncated }
}

export function filterSevereFindings(findings: SecretFinding[]): SecretFinding[] {
  return findings.filter(f => f.severity === 'critical' || f.severity === 'high')
}
