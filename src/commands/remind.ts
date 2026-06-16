import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import chalk from 'chalk'
import { printNextStep } from '../lib/next-step.js'
import { t } from '../i18n/ko.js'
import { parseRulesMd } from './sync.js'

const REMIND_PATH = '.vhk/remind.md'
const RULES_PATH = 'RULES.md'

// 치명 규칙으로 간주할 RULES.md 섹션 헤더. 카드(goal68)는 NON-NEGOTIABLE·절대 규칙을 명시하지만
// 실제 vhk RULES.md 는 'VHK 운영 — Forbidden (전역 금지)' 를 쓴다 → 헤더 변형을 모두 흡수해야
// 빈 산출물(쓸모 0)을 피한다. 추가 변형은 OR 로 확장.
const CRITICAL_HEADER = /non-negotiable|절대\s*규칙|forbidden|전역\s*금지/i

// 불릿 한 줄 → 치명 규칙 핵심. 선행 '-/*' 와 후행 괄호주석(가드#·이유 등 메타)을 떼어
// 1번째 턴과 100번째 턴이 같은 무게로 읽히는 최소 포맷으로 압축(원문 보존 아닌 핵심).
function compressRule(line: string): string {
  return line
    .replace(/^\s*[-*]\s+/, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
}

function extractCriticalRules(content: string): string[] {
  return parseRulesMd(content)
    .filter((s) => CRITICAL_HEADER.test(s.title))
    .flatMap((s) => s.content.split('\n'))
    .filter((l) => /^\s*[-*]\s+/.test(l))
    .map(compressRule)
    .filter((r) => r.length > 0)
}

export function remind(): void {
  console.log(chalk.bold('\n🔔 ' + t('remind.title')))
  console.log(chalk.gray('─'.repeat(40)))

  const lines: string[] = []
  lines.push('# Remind — 치명 규칙 재주입')
  lines.push('')
  lines.push('> ⚠️ 긴 세션/루프에서 컴팩션으로 치명 규칙이 증발하는 것 방지 — 매 N 턴 이 파일을 컨텍스트에 재주입.')
  lines.push(`> 생성: ${new Date().toLocaleString('ko-KR')}`)
  lines.push('')
  lines.push('## 치명 규칙 (NON-NEGOTIABLE)')
  lines.push('')

  const rulesExist = existsSync(RULES_PATH)
  let rules: string[] = []
  if (rulesExist) {
    try {
      rules = extractCriticalRules(readFileSync(RULES_PATH, 'utf-8'))
    } catch {
      rules = []
    }
  }

  if (rules.length) {
    rules.forEach((r) => lines.push(`- 치명: ${r}`))
  } else if (!rulesExist) {
    lines.push('⚠️ RULES.md 없음 — `vhk init` 후 치명 규칙(절대 규칙/Forbidden) 섹션 작성')
  } else {
    lines.push('⚠️ 치명 규칙 섹션 없음 — RULES.md 에 `## 절대 규칙` 또는 `## Forbidden` 추가')
  }
  lines.push('')

  const content = lines.join('\n')

  try {
    if (!existsSync('.vhk')) mkdirSync('.vhk', { recursive: true })
    writeFileSync(REMIND_PATH, content, 'utf-8')
  } catch {
    /* 쓰기 실패 → stdout 만 */
  }

  console.log(content)
  console.log(chalk.gray(`\n📄 저장: ${REMIND_PATH}`))

  printNextStep({
    message: '긴 세션/루프 중 매 N 턴 .vhk/remind.md 를 컨텍스트에 재주입하세요. `/loop N/remind` 패턴.',
  })
}
