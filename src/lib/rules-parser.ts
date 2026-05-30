import fs from 'node:fs'
import path from 'node:path'

export interface Rule {
  id: string
  section: string
  type: 'file-pattern' | 'naming' | 'structure' | 'content' | 'custom'
  description: string
  pattern?: RegExp
  check: (cwd: string) => RuleViolation[]
}

export interface RuleViolation {
  ruleId: string
  severity: 'error' | 'warning' | 'info'
  message: string
  file?: string
  line?: number
}

type NamingConvention = 'kebab-case' | 'camelCase'

/**
 * RULES.md에서 자동 검증 가능한 규칙을 추출한다.
 */
export function parseRules(rulesPath: string): Rule[] {
  if (!fs.existsSync(rulesPath)) return []

  const content = fs.readFileSync(rulesPath, 'utf-8')
  const lines = content.split('\n')
  const rules: Rule[] = []

  let currentSection = ''

  // VHK-013: rule id 에 전역 일련번호 대신 RULES.md 출처 행번호(L<n>)를 사용 — 사용자가 즉시 찾도록.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNo = i + 1
    if (line.startsWith('## ')) {
      currentSection = line.replace('## ', '').trim()
      continue
    }

    const bulletMatch = line.match(/^[-*]\s+(.+)/)
    if (!bulletMatch) continue

    // VHK-012: 지침/기록/메타 섹션 불릿은 코드 규칙이 아님 → 추출 제외(오탐 방지).
    if (isMetaSection(currentSection)) continue

    const ruleText = bulletMatch[1]

    if (/kebab[- ]?case/i.test(ruleText)) {
      rules.push(createNamingRule(`naming-L${lineNo}`, currentSection, ruleText, 'kebab-case'))
    } else if (/camel[- ]?case/i.test(ruleText)) {
      rules.push(createNamingRule(`naming-L${lineNo}`, currentSection, ruleText, 'camelCase'))
    }

    // VHK-012: 구조(필수 디렉터리) 규칙은 '아키텍처/구조' 선언 섹션에서만 — 행동지침 경로 오탐 방지.
    if (isStructureSection(currentSection)) {
      const pathMatch = ruleText.match(/`([a-zA-Z0-9_/.-]+\/)`/)
      if (pathMatch) {
        rules.push(createStructureRule(`structure-L${lineNo}`, currentSection, ruleText, pathMatch[1]))
      }
    }

    // VHK-012: '금지' 인접 백틱 토큰만 — `X` 금지 / 금지: `X`. URL·경로는 제외(금지 뒤 먼 URL 오탐 방지).
    const banToken = extractBanToken(ruleText)
    if (banToken) {
      rules.push(createContentRule(`ban-L${lineNo}`, currentSection, ruleText, banToken, 'banned'))
    }
  }

  return rules
}

/** 기록/지침/메타 섹션 — 코드 자동검사 대상 아님(문서/운영 규칙). */
function isMetaSection(section: string): boolean {
  const s = section.toLowerCase()
  return ['기록', '로그', 'adr', '트러블', 'til', '/done', '체크리스트', '지침', '이슈', '운영', '커밋'].some(
    (k) => s.includes(k)
  )
}

/** 구조(필수 디렉터리) 규칙을 뽑을 '구조 선언' 섹션인지. */
function isStructureSection(section: string): boolean {
  const s = section.toLowerCase()
  return ['아키텍처', '구조', '디렉터리', '폴더', 'architecture', 'structure'].some((k) => s.includes(k))
}

/** '금지' 인접 백틱 코드 토큰을 추출. URL/경로면 null(오탐 방지). 없으면 null. */
function extractBanToken(ruleText: string): string | null {
  const banKw = ruleText.search(/금지|사용하지|쓰지\s*마|하지\s*않는다|never use|do not use/i)
  if (banKw < 0) return null
  let token: string | null = null
  // A: 금지 '앞'의 마지막 백틱 (`execSync` 신규 사용 금지)
  const before = [...ruleText.slice(0, banKw).matchAll(/`([^`]+)`/g)].pop()
  if (before) token = before[1]
  else {
    // B: 금지 '바로 뒤' 인접 백틱 (금지: `X`) — 구분자만 허용(먼 URL 제외)
    const after = ruleText
      .slice(banKw)
      .match(/^(?:금지|사용하지|쓰지\s*마|do not use|never use)\s*[:：]?\s*`([^`]+)`/i)
    if (after) token = after[1]
  }
  if (!token) return null
  // URL/경로/넓은 토큰은 금지 패턴으로 부적절 → 제외
  if (/:\/\/|www\.|\.(com|io|dev|net|org|app)\b|\//.test(token)) return null
  return token
}

function createNamingRule(
  id: string,
  section: string,
  desc: string,
  convention: NamingConvention
): Rule {
  return {
    id,
    section,
    type: 'naming',
    description: desc,
    check: (cwd: string) => {
      const violations: RuleViolation[] = []
      const srcDir = path.join(cwd, 'src')
      if (!fs.existsSync(srcDir)) return violations

      walkFiles(srcDir, filePath => {
        const name = path.basename(filePath, path.extname(filePath))
        if (convention === 'kebab-case' && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
          if (!['index', 'vite.config', 'tsconfig'].includes(name)) {
            violations.push({
              ruleId: id,
              severity: 'warning',
              message: `파일명이 kebab-case가 아님: ${name}`,
              file: path.relative(cwd, filePath),
            })
          }
        }
      })

      return violations
    },
  }
}

function createStructureRule(
  id: string,
  section: string,
  desc: string,
  expectedPath: string
): Rule {
  return {
    id,
    section,
    type: 'structure',
    description: desc,
    check: (cwd: string) => {
      const fullPath = path.join(cwd, expectedPath)
      if (!fs.existsSync(fullPath)) {
        return [{
          ruleId: id,
          severity: 'error',
          message: `필수 디렉토리/파일 누락: ${expectedPath}`,
        }]
      }
      return []
    },
  }
}

function createContentRule(
  id: string,
  section: string,
  desc: string,
  pattern: string,
  type: 'banned' | 'required'
): Rule {
  return {
    id,
    section,
    type: 'content',
    description: desc,
    pattern: new RegExp(escapeRegex(pattern), 'i'),
    check: (cwd: string) => {
      const violations: RuleViolation[] = []
      const srcDir = path.join(cwd, 'src')
      if (!fs.existsSync(srcDir)) return violations

      const regex = new RegExp(escapeRegex(pattern), 'i')
      walkFiles(srcDir, filePath => {
        const fileContent = fs.readFileSync(filePath, 'utf-8')
        const fileLines = fileContent.split('\n')
        fileLines.forEach((line, idx) => {
          if (regex.test(line)) {
            violations.push({
              ruleId: id,
              severity: type === 'banned' ? 'error' : 'warning',
              message: type === 'banned'
                ? `금지 패턴 발견: \`${pattern}\``
                : `필수 패턴 누락: \`${pattern}\``,
              file: path.relative(cwd, filePath),
              line: idx + 1,
            })
          }
          regex.lastIndex = 0
        })
      })

      return violations
    },
  }
}

function walkFiles(dir: string, callback: (filePath: string) => void) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!['node_modules', '.git', 'dist', '.next'].includes(entry.name)) {
        walkFiles(fullPath, callback)
      }
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
      callback(fullPath)
    }
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
