import chalk from 'chalk'
import fs from 'node:fs'
import path from 'node:path'

interface RulesSection {
  title: string
  content: string
}

const CURSORRULES_KEYS = ['코딩 규칙', '기술 스택', '아키텍처', '디자인', 'Anti-patterns', '커밋']
const CLAUDE_MD_KEYS = ['기록', '로그', 'ADR', '트러블슈팅', 'TIL', '/done', '체크리스트']

/**
 * RULES.md를 ## 기준으로 섹션 파싱
 */
export function parseRulesMd(content: string): RulesSection[] {
  const sections: RulesSection[] = []
  const lines = content.split('\n')
  let currentTitle = ''
  let currentContent: string[] = []

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentTitle) {
        sections.push({ title: currentTitle, content: currentContent.join('\n').trim() })
      }
      currentTitle = line.replace('## ', '').trim()
      currentContent = []
    } else {
      currentContent.push(line)
    }
  }

  if (currentTitle) {
    sections.push({ title: currentTitle, content: currentContent.join('\n').trim() })
  }

  return sections
}

/**
 * RULES.md 섹션을 .cursorrules 포맷으로 변환
 */
export function toCursorrules(sections: RulesSection[], projectName: string): string {
  const codingSections = sections.filter(s =>
    CURSORRULES_KEYS.some(k => s.title.includes(k))
  )

  const lines = [
    `# ${projectName} — Cursor Rules`,
    '',
    '> 코딩/디자인 전용. 기록/운영 → CLAUDE.md 참조.',
    '> ⚡ 이 파일은 RULES.md에서 자동 생성됨 (vhk sync). 직접 수정 금지.',
    '',
    '## 필수 참조',
    '- docs/PRD.md · docs/ARCHITECTURE.md · CLAUDE.md · RULES.md',
    '',
  ]

  for (const section of codingSections) {
    lines.push(`## ${section.title}`)
    lines.push(section.content)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * RULES.md 섹션을 CLAUDE.md 포맷으로 변환
 */
export function toClaudeMd(sections: RulesSection[], existing: string): string {
  const recordSections = sections.filter(s =>
    CLAUDE_MD_KEYS.some(k => s.title.includes(k))
  )

  const statusMatch = existing.match(/## 현재 상태[\s\S]*?(?=\n## |$)/)
  const statusSection = statusMatch ? statusMatch[0] : ''
  const header = existing.split('## ')[0].trim()

  const lines = [
    header,
    '',
    statusSection,
    '',
    '> ⚡ 아래 규칙 섹션은 RULES.md에서 자동 생성됨 (vhk sync). 직접 수정 금지.',
    '',
  ]

  for (const section of recordSections) {
    lines.push(`## ${section.title}`)
    lines.push(section.content)
    lines.push('')
  }

  return lines.join('\n')
}

export async function sync() {
  console.log(chalk.bold('\n🔄 VHK SYNC — RULES.md → 규칙 파일 동기화\n'))

  const cwd = process.cwd()
  const rulesPath = path.join(cwd, 'RULES.md')

  if (!fs.existsSync(rulesPath)) {
    console.log(chalk.yellow('⚠️ RULES.md가 없습니다.'))
    console.log(chalk.dim('  RULES.md는 프로젝트 규칙의 Single Source of Truth입니다.'))
    console.log(chalk.dim('  생성하려면: vhk init 실행 후 RULES.md를 작성하세요.'))
    console.log('')
    console.log(chalk.dim('  RULES.md 기본 구조:'))
    console.log(chalk.dim('  ## 프로젝트 정체성'))
    console.log(chalk.dim('  ## 기술 스택'))
    console.log(chalk.dim('  ## 코딩 규칙'))
    console.log(chalk.dim('  ## 기록 규칙'))
    console.log(chalk.dim('  ## 커밋 컨벤션'))
    return
  }

  const rulesContent = fs.readFileSync(rulesPath, 'utf-8')
  const sections = parseRulesMd(rulesContent)
  console.log(chalk.dim(`  📄 RULES.md 파싱 완료 — ${sections.length}개 섹션`))

  const firstLine = rulesContent.split('\n')[0]
  const projectName = firstLine.replace(/^#\s*/, '').replace(/\s*—.*/, '').trim() || 'Project'

  const cursorrulesPath = path.join(cwd, '.cursorrules')
  fs.writeFileSync(cursorrulesPath, toCursorrules(sections, projectName), 'utf-8')
  console.log(chalk.green('  ✅ .cursorrules 동기화 완료'))

  const claudePath = path.join(cwd, 'CLAUDE.md')
  const existingClaude = fs.existsSync(claudePath)
    ? fs.readFileSync(claudePath, 'utf-8')
    : `# 기록 규칙 (${projectName})\n\n## 현재 상태\n- **Phase:** __FILL__\n- **블로커:** 없음\n- **다음 액션:** __FILL__\n- **마지막 업데이트:** ${new Date().toISOString().split('T')[0]}`
  fs.writeFileSync(claudePath, toClaudeMd(sections, existingClaude), 'utf-8')
  console.log(chalk.green('  ✅ CLAUDE.md 동기화 완료'))

  console.log(chalk.bold.green('\n🔄 동기화 완료!'))
  console.log(chalk.dim('  RULES.md (원본) → .cursorrules + CLAUDE.md (자동 생성)'))
  console.log(chalk.dim('  규칙 변경은 항상 RULES.md에서만 하세요.\n'))
}
