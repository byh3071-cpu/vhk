/**
 * scan-llm-guardrails.ts — PAT-001/002/004 LLM 가드레일 휴리스틱 검출 (goal72)
 *
 * 파일 단위 grep 기반 휴리스틱. false-positive 가능 → 결과는 "검토 필요" 수준.
 *   PAT-001: 닫힌어휘 LLM 필드 allowlist 누락
 *   PAT-002: LLM JSON 직접 파싱 (3단 게이트 없음)
 *   PAT-004: LLM 진입점 입력 클램프 누락
 */

import fs from 'node:fs'
import path from 'node:path'
import { walkProjectFiles } from './scan-files.js'

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

const LLM_INDICATOR = /openai|anthropic|gemini|generative.?ai|chat\.completions|completions\.create|messages\.create|generate_content|gpt-[34]|claude-|llm\.|LanguageModel/i

const CLOSED_VOCAB_WRITE =
  /multi_select.*["']\s*name["']|["']name["']\s*:\s*\w+.*multi_select|select.*["']name["']\s*:|\.select\s*=|enum\s*\(/i

const ALLOWLIST_GUARD =
  /ALLOWED_|VALID_|WHITELIST|allowlist|whitelist|in\s+ALLOWED|in\s+VALID|in\s+allowed|\.filter\s*\(.*in\s+|not in ALLOW/i

const DIRECT_JSON_PARSE =
  /JSON\.parse\s*\(\s*(?:raw|content|output|result|response|text|message|choices|completion)/i

const PY_DIRECT_PARSE =
  /json\.loads\s*\(\s*(?:raw|content|output|result|response|text|message)/i

const JSON_EXTRACT_GUARD =
  /extractJson|extractObject|parseJsonFrom|fenced|indexOf.*\{|slice.*indexOf|replace.*```/i

const LLM_CALL =
  /completions\.create|chat\.completions|messages\.create|generate_content|generateContent|create\s*\(\s*\{[^}]*model\s*:/i

const INPUT_CLAMP_GUARD =
  /Math\.min\s*\(|Math\.max.*Math\.min|_CAP\b|_LIMIT\b|_MAX\b|const MAX_|const CAP|const LIMIT/

const EXPOSED_PATH =
  /\/api\/|\/routes\/|\/actions\/|webhook|cron|server.action|export\s+async\s+function\s+(?:POST|GET|PUT|DELETE|action)/i

const MAX_LINES_CONTEXT = 30

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LlmGuardrailFinding = {
  pat: 'PAT-001' | 'PAT-002' | 'PAT-004'
  file: string
  line?: number
  message: string
  evidence?: string
}

export type LlmGuardrailScan = {
  findings: LlmGuardrailFinding[]
  scannedFiles: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function firstMatch(lines: string[], pattern: RegExp): { line: number; text: string } | null {
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) return { line: i + 1, text: lines[i].trim().slice(0, 120) }
  }
  return null
}

function anyMatch(lines: string[], pattern: RegExp): boolean {
  return lines.some((l) => pattern.test(l))
}

// ---------------------------------------------------------------------------
// Per-file checks
// ---------------------------------------------------------------------------

function checkFile(absPath: string, relPath: string, findings: LlmGuardrailFinding[]): void {
  const raw = fs.readFileSync(absPath, 'utf-8')
  const lines = raw.split('\n')

  const isLlmFile = anyMatch(lines, LLM_INDICATOR)
  if (!isLlmFile) return

  const isPython = relPath.endsWith('.py')

  // --- PAT-001: 닫힌어휘 select/multi_select 쓰기 + allowlist 누락 ---
  const closedWrite = firstMatch(lines, CLOSED_VOCAB_WRITE)
  if (closedWrite && !anyMatch(lines, ALLOWLIST_GUARD)) {
    findings.push({
      pat: 'PAT-001',
      file: relPath,
      line: closedWrite.line,
      message: 'LLM 출력이 select/multi_select 필드로 흘러가는데 allowlist 대조 없음',
      evidence: closedWrite.text,
    })
  }

  // --- PAT-002: JSON 직접 파싱 + 추출 게이트 없음 ---
  const parsePattern = isPython ? PY_DIRECT_PARSE : DIRECT_JSON_PARSE
  const directParse = firstMatch(lines, parsePattern)
  if (directParse && !anyMatch(lines, JSON_EXTRACT_GUARD)) {
    findings.push({
      pat: 'PAT-002',
      file: relPath,
      line: directParse.line,
      message: 'LLM 응답을 직접 JSON.parse/json.loads — extract→validate 3단 게이트 없음',
      evidence: directParse.text,
    })
  }

  // --- PAT-004: 노출 진입점 + LLM 호출 + 입력 클램프 없음 ---
  const isExposedPath =
    EXPOSED_PATH.test(relPath) || anyMatch(lines.slice(0, MAX_LINES_CONTEXT), EXPOSED_PATH)
  if (isExposedPath) {
    const llmCall = firstMatch(lines, LLM_CALL)
    if (llmCall && !anyMatch(lines, INPUT_CLAMP_GUARD)) {
      findings.push({
        pat: 'PAT-004',
        file: relPath,
        line: llmCall.line,
        message: '외부 진입점에서 LLM 호출 — 입력 클램프(Math.min/CAP) 없음',
        evidence: llmCall.text,
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function scanLlmGuardrails(cwd: string): LlmGuardrailScan {
  const findings: LlmGuardrailFinding[] = []
  let scannedFiles = 0

  walkProjectFiles(cwd, (absPath, relPath) => {
    const ext = path.extname(relPath).toLowerCase()
    if (!['.ts', '.tsx', '.js', '.jsx', '.mjs', '.py'].includes(ext)) return
    try {
      checkFile(absPath, relPath, findings)
      scannedFiles++
    } catch {
      // skip unreadable
    }
  })

  return { findings, scannedFiles }
}
