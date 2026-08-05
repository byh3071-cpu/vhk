import fs from 'node:fs'
import path from 'node:path'

export interface Rule {
  id: string
  section: string
  /** RULES.md 원본의 1-based 줄 번호. 선언 단위 검사 비율 계산에 사용한다. */
  sourceLine?: number
  type: 'file-pattern' | 'naming' | 'structure' | 'content' | 'custom'
  description: string
  pattern?: RegExp
  check: (cwd: string) => RuleViolation[]
}

export interface RuleDeclaration {
  id: string
  section: string
  description: string
  line: number
  checkId?: string
  bindingError?: 'invalid-id' | 'multiple-markers'
  invalidCheckId?: string
}

export interface RuleViolation {
  ruleId: string
  severity: 'error' | 'warning' | 'info'
  message: string
  file?: string
  line?: number
}

type NamingConvention = 'kebab-case' | 'camelCase'

const CHECK_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const CHECK_MARKER_PATTERN = /<!--\s*vhk:check=([^>]*)-->/gi

/** RULES.md의 최상위 글머리표를 선언 단위로 읽고 선택적 검사 연결 표시를 해석한다. */
export function parseRuleDeclarations(rulesPath: string): RuleDeclaration[] {
  if (!fs.existsSync(rulesPath)) return []

  const lines = fs.readFileSync(rulesPath, 'utf-8').split('\n')
  const declarations: RuleDeclaration[] = []
  let currentSection = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('## ')) {
      currentSection = line.slice(3).trim()
      continue
    }

    const bulletMatch = line.match(/^[-*]\s+(.+)/)
    if (!bulletMatch || !currentSection) continue

    const lineNo = i + 1
    const rawText = bulletMatch[1]
    const markers = [...rawText.matchAll(CHECK_MARKER_PATTERN)]
    const description = rawText.replace(CHECK_MARKER_PATTERN, '').trim()
    const declaration: RuleDeclaration = {
      id: `declaration-L${lineNo}`,
      section: currentSection,
      description,
      line: lineNo,
    }

    if (markers.length > 1) {
      declaration.bindingError = 'multiple-markers'
    } else if (markers.length === 1) {
      const checkId = markers[0][1].trim()
      if (CHECK_ID_PATTERN.test(checkId)) declaration.checkId = checkId
      else {
        declaration.bindingError = 'invalid-id'
        declaration.invalidCheckId = checkId
      }
    }

    declarations.push(declaration)
  }

  return declarations
}

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

    const ruleText = bulletMatch[1].replace(CHECK_MARKER_PATTERN, '').trim()

    if (/kebab[- ]?case/i.test(ruleText)) {
      rules.push(createNamingRule(`naming-L${lineNo}`, currentSection, ruleText, 'kebab-case', lineNo))
    } else if (/camel[- ]?case/i.test(ruleText)) {
      rules.push(createNamingRule(`naming-L${lineNo}`, currentSection, ruleText, 'camelCase', lineNo))
    }

    // VHK-012: 구조(필수 디렉터리) 규칙은 '아키텍처/구조' 선언 섹션에서만 — 행동지침 경로 오탐 방지.
    if (isStructureSection(currentSection)) {
      const pathMatch = ruleText.match(/`([a-zA-Z0-9_/.-]+\/)`/)
      if (pathMatch) {
        rules.push(createStructureRule(`structure-L${lineNo}`, currentSection, ruleText, pathMatch[1], lineNo))
      }
    }

    // VHK-012: '금지' 인접 백틱 토큰만 — `X` 금지 / 금지: `X`. URL·경로는 제외(금지 뒤 먼 URL 오탐 방지).
    const banToken = extractBanToken(ruleText)
    if (banToken) {
      rules.push(createContentRule(`ban-L${lineNo}`, currentSection, ruleText, banToken, lineNo))
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
  // `must never use`/`must not be used`는 must까지 금지 구에 포함해야 한다.
  // must를 별도 필수 표지로 먼저 떼면 실제 금지가 양성 의도로 뒤집힌다.
  const banPattern = /\bmust\s+(?:never\s+use|not\s+(?:be\s+)?used?)\b|금지|사용하지|쓰지\s*마|하지\s*않는다|never use|do not use/i
  // 토큰 뒤의 `반드시`는 "반드시 사용 금지"처럼 금지를 강조할 수도 있다.
  // 긍정 의도가 분명한 표지만 제외하고, 실제 금지 강조를 조용히 버리지 않는다.
  const positiveRequiredAfterTokenPattern = /필수|\bmust\b|\brequired\b/i
  const clauses = ruleText.split(/\s*[—·,;]\s*|\s+\/\s+/)

  for (const clause of clauses) {
    const banMatch = clause.match(banPattern)
    if (!banMatch || banMatch.index === undefined) continue

    const banStart = banMatch.index
    const banEnd = banStart + banMatch[0].length
    const before = [...clause.slice(0, banStart).matchAll(/`([^`]+)`/g)].pop()
    let token: string | null = null
    let tokenStart = -1
    let tokenEnd = -1

    if (before && before.index !== undefined) {
      token = before[1]
      tokenStart = before.index
      tokenEnd = tokenStart + before[0].length

      const beforeToken = clause.slice(0, tokenStart)
      const betweenTokenAndBan = clause.slice(tokenEnd, banStart)
      const requiredImmediatelyBefore = /(?:필수|반드시|\bmust\b|\brequired\b)\s*[:：]?\s*$/i.test(beforeToken)
      if (requiredImmediatelyBefore || positiveRequiredAfterTokenPattern.test(betweenTokenAndBan)) continue
    } else {
      // 금지 '바로 뒤' 인접 백틱 (금지: `X`) — 구분자만 허용(먼 URL 제외)
      const after = clause.slice(banEnd).match(/^\s*[:：]?\s*`([^`]+)`/)
      if (after) {
        token = after[1]
        tokenStart = banEnd + after[0].indexOf('`')
        tokenEnd = tokenStart + token.length + 2

        if (/^\s*(?:필수|반드시|\bmust\b|\brequired\b)/i.test(clause.slice(tokenEnd))) continue
      }
    }

    if (!token) continue
    // URL/경로/넓은 토큰은 금지 패턴으로 부적절 → 제외
    if (/:\/\/|www\.|\.(com|io|dev|net|org|app)\b|\//.test(token)) continue
    return token
  }

  return null
}

function createNamingRule(
  id: string,
  section: string,
  desc: string,
  convention: NamingConvention,
  sourceLine: number
): Rule {
  return {
    id,
    section,
    sourceLine,
    type: 'naming',
    description: desc,
    check: (cwd: string) => {
      const violations: RuleViolation[] = []
      const srcDir = path.join(cwd, 'src')
      if (!fs.existsSync(srcDir)) return violations

      walkFiles(srcDir, filePath => {
        const name = path.basename(filePath, path.extname(filePath))
        const exempt = ['index', 'vite.config', 'tsconfig']
        if (exempt.includes(name)) return
        if (convention === 'kebab-case' && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
          violations.push({
            ruleId: id,
            severity: 'warning',
            message: `파일명이 kebab-case가 아님: ${name}`,
            file: path.relative(cwd, filePath),
          })
        } else if (convention === 'camelCase' && !/^[a-z][a-zA-Z0-9]*$/.test(name)) {
          // 과거 camelCase 분기는 미구현(검사 없이 통과)이라 위반이 silent 무시됐다 → 실제 검사 추가.
          violations.push({
            ruleId: id,
            severity: 'warning',
            message: `파일명이 camelCase가 아님: ${name}`,
            file: path.relative(cwd, filePath),
          })
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
  expectedPath: string,
  sourceLine: number
): Rule {
  return {
    id,
    section,
    sourceLine,
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

// 한 줄에서 '코드 부분'만 추출 — 주석 줄/줄끝 주석/문자열·백틱 리터럴 내 토큰은 '실제 사용'이
// 아니다. 이 가드 없이 라인 전체를 매칭하면 금지패턴 추출기 자신의 설명 주석(예: `execSync` 예시)을
// 위반으로 오탐한다(자기 코드 도그푸딩 함정).
export function codePortionForScan(line: string): string {
  const t = line.trimStart()
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return ''
  const noStr = line.replace(/(['"`])(?:\\.|(?!\1).)*?\1/g, '')
  const ci = noStr.indexOf('//')
  return ci >= 0 ? noStr.slice(0, ci) : noStr
}

// 금지(banned) 패턴 규칙만 생성한다. 과거 'required'(필수 패턴) 타입이 있었으나 호출처가 0인
// dead path 였고 분기 로직도 역전(패턴 발견 시 '누락' 보고)이라 제거 — 필요해지면 별도 설계로 추가.
function createContentRule(
  id: string,
  section: string,
  desc: string,
  pattern: string,
  sourceLine: number
): Rule {
  return {
    id,
    section,
    sourceLine,
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
          if (regex.test(codePortionForScan(line))) {
            violations.push({
              ruleId: id,
              severity: 'error',
              message: `금지 패턴 발견: \`${pattern}\``,
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
