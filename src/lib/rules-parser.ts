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
  let ruleIndex = 0

  for (const line of lines) {
    if (line.startsWith('## ')) {
      currentSection = line.replace('## ', '').trim()
      continue
    }

    const bulletMatch = line.match(/^[-*]\s+(.+)/)
    if (!bulletMatch) continue

    const ruleText = bulletMatch[1]
    ruleIndex++

    if (/kebab[- ]?case/i.test(ruleText)) {
      rules.push(createNamingRule(
        `naming-${ruleIndex}`,
        currentSection,
        ruleText,
        'kebab-case',
      ))
    } else if (/camel[- ]?case/i.test(ruleText)) {
      rules.push(createNamingRule(
        `naming-${ruleIndex}`,
        currentSection,
        ruleText,
        'camelCase',
      ))
    }

    const pathMatch = ruleText.match(/`([a-zA-Z0-9_/.-]+\/)`/)
    if (pathMatch) {
      rules.push(createStructureRule(
        `structure-${ruleIndex}`,
        currentSection,
        ruleText,
        pathMatch[1],
      ))
    }

    if (/금지|사용하지|쓰지 마|하지 않는다|never use|do not use/i.test(ruleText)) {
      const backtickContent = ruleText.match(/`([^`]+)`/)
      if (backtickContent) {
        rules.push(createContentRule(
          `ban-${ruleIndex}`,
          currentSection,
          ruleText,
          backtickContent[1],
          'banned',
        ))
      }
    }

    // 문서상 필수 규칙은 자동 검사 없음 — RULES.md 수동 확인
  }

  return rules
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
