import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import chalk from 'chalk'
import { printNextStep } from '../lib/next-step.js'
import { t } from '../i18n/ko.js'
import { compressRule, extractCriticalRules } from '../lib/rules-inherit.js'

// #456: 추출기(compressRule/extractCriticalRules)는 lib/rules-inherit 로 이동 —
// 뒷단 4명령(content/launch/sell/ops)과 단일 SoT 공유. 기존 import 경로 호환용 재수출.
export { compressRule, extractCriticalRules }

const REMIND_PATH = '.vhk/remind.md'
const RULES_PATH = 'RULES.md'

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
