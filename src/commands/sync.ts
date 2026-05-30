import chalk from 'chalk'
import fs from 'node:fs'
import path from 'node:path'
import { ko } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'

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
 * 코딩 규칙 문서 공통 빌더. 모든 도구별 규칙 파일(.cursorrules·.windsurfrules·
 * copilot·antigravity)이 동일 본문을 공유한다 — 헤더 제목만 다름.
 * 자동생성 경고 주석은 상단 헤더에 둬 직접 편집 시 덮어쓰기 신호를 준다.
 * (기존 .cursorrules/.windsurfrules 출력과 100% 동일 — GA 안정성 유지.)
 */
function buildCodingDoc(headerTitle: string, sections: RulesSection[], projectName: string): string {
  const codingSections = sections.filter(s =>
    CURSORRULES_KEYS.some(k => s.title.includes(k))
  )

  const lines = [
    `# ${projectName} — ${headerTitle}`,
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

/** RULES.md 섹션을 .cursorrules 포맷으로 변환 */
export function toCursorrules(sections: RulesSection[], projectName: string): string {
  return buildCodingDoc('Cursor Rules', sections, projectName)
}

/** RULES.md 섹션을 .windsurfrules 포맷으로 변환 (Windsurf/Cascade) */
export function toWindsurfrules(sections: RulesSection[], projectName: string): string {
  return buildCodingDoc('Windsurf Rules', sections, projectName)
}

/**
 * GitHub Copilot — 레포 전역 지침. 공식 경로 .github/copilot-instructions.md (Markdown).
 * 공식 문서상 하드 글자수 제한이 없어 절삭하지 않는다 (Antigravity 와 다른 점).
 */
export function toCopilotInstructions(sections: RulesSection[], projectName: string): string {
  return buildCodingDoc('GitHub Copilot Instructions', sections, projectName)
}

/**
 * Antigravity 규칙 파일 1개당 12,000 제한 (공식 docs는 "characters").
 * 측정 안전성: char/byte 어느 해석이든 안전하도록 **UTF-8 바이트 기준**으로 강제한다.
 * byteLength ≥ charCount 이므로 byteLength ≤ 12000 이면 char 수도 자동으로 ≤ 12000.
 * → 영어(1B/char)는 사실상 12,000자 그대로, 한글(3B/char)은 더 보수적으로 절삭(안전 방향).
 */
export const ANTIGRAVITY_CHAR_LIMIT = 12000
const ANTIGRAVITY_TRUNCATE_MARKER =
  '\n\n<!-- ⚠️ Antigravity 12,000자 제한으로 절삭됨 — 전체 규칙은 RULES.md 참조 -->\n'

/**
 * 12k 안전 절삭 — UTF-8 바이트 예산 안에서, 마크다운 구조 경계(## 헤딩, 없으면 직전 \n)에서 자른다.
 * 마커 바이트 + 안전마진을 예산에서 빼므로 결과는 항상 byteLength ≤ limit (테스트로 보장).
 */
export function truncateForAntigravity(
  content: string,
  limit = ANTIGRAVITY_CHAR_LIMIT
): string {
  if (Buffer.byteLength(content, 'utf8') <= limit) return content

  const SAFETY = 200 // 바이트 안전마진
  const budget = limit - Buffer.byteLength(ANTIGRAVITY_TRUNCATE_MARKER, 'utf8') - SAFETY

  // budget 바이트 이하인 최대 prefix 길이(char index)를 이진 탐색
  let lo = 0
  let hi = content.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (Buffer.byteLength(content.slice(0, mid), 'utf8') <= budget) lo = mid
    else hi = mid - 1
  }
  const charCut = lo

  // 구조 경계로 스냅 — 코드블록/헤딩/리스트 한가운데서 깨지지 않게
  let cut = content.lastIndexOf('\n## ', charCut)
  if (cut < charCut * 0.5) {
    const nl = content.lastIndexOf('\n', charCut)
    cut = nl > 0 ? nl : charCut
  }

  return content.slice(0, cut).trimEnd() + ANTIGRAVITY_TRUNCATE_MARKER
}

/** Antigravity — 워크스페이스 규칙. 공식 경로 .agents/rules/<name>.md (파일당 12,000자). */
export function toAntigravityRules(sections: RulesSection[], projectName: string): string {
  return truncateForAntigravity(buildCodingDoc('Antigravity Rules', sections, projectName))
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
  console.log(chalk.bold(`\n${ko.sync.title}\n`))

  const cwd = process.cwd()
  const rulesPath = path.join(cwd, 'RULES.md')

  if (!fs.existsSync(rulesPath)) {
    console.log(chalk.yellow(ko.sync.noRules))
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
  console.log(chalk.green(`  ${ko.sync.cursorrulesDone}`))

  const claudePath = path.join(cwd, 'CLAUDE.md')
  const existingClaude = fs.existsSync(claudePath)
    ? fs.readFileSync(claudePath, 'utf-8')
    : `# 기록 규칙 (${projectName})\n\n## 현재 상태\n- **Phase:** __FILL__\n- **블로커:** 없음\n- **다음 액션:** __FILL__\n- **마지막 업데이트:** ${new Date().toISOString().split('T')[0]}`
  fs.writeFileSync(claudePath, toClaudeMd(sections, existingClaude), 'utf-8')
  console.log(chalk.green(`  ${ko.sync.claudeDone}`))

  const windsurfPath = path.join(cwd, '.windsurfrules')
  fs.writeFileSync(windsurfPath, toWindsurfrules(sections, projectName), 'utf-8')
  console.log(chalk.green(`  ${ko.sync.windsurfDone}`))

  // GitHub Copilot — 중첩 경로라 디렉토리 보장 필요 (기존 3개는 루트라 불필요했음)
  const copilotPath = path.join(cwd, '.github', 'copilot-instructions.md')
  fs.mkdirSync(path.dirname(copilotPath), { recursive: true })
  fs.writeFileSync(copilotPath, toCopilotInstructions(sections, projectName), 'utf-8')
  console.log(chalk.green(`  ${ko.sync.copilotDone}`))

  // Antigravity — .agents/rules/ 중첩 경로 + 12k 절삭
  const antigravityPath = path.join(cwd, '.agents', 'rules', 'vhk-rules.md')
  fs.mkdirSync(path.dirname(antigravityPath), { recursive: true })
  const antigravityDoc = toAntigravityRules(sections, projectName)
  fs.writeFileSync(antigravityPath, antigravityDoc, 'utf-8')
  console.log(chalk.green(`  ${ko.sync.antigravityDone}`))
  if (antigravityDoc.includes('절삭됨')) {
    console.log(chalk.yellow(`    ⚠️  ${ko.sync.antigravityTruncated}`))
  }

  console.log(chalk.bold.green(`\n${ko.sync.done}`))
  console.log(chalk.dim('  RULES.md (원본) → .cursorrules + CLAUDE.md + .windsurfrules'))
  console.log(chalk.dim('             + .github/copilot-instructions.md + .agents/rules/vhk-rules.md (자동 생성)'))
  console.log(chalk.dim('  규칙 변경은 항상 RULES.md에서만 하세요.'))

  printNextStep({
    message: '규칙 동기화 완료! 이제 Cursor가 새 규칙을 따릅니다.',
    command: 'vhk 점검',
    cursorHint: '규칙 점검해줘',
  })
}
