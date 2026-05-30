import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * init adopt 모드 — 브라운필드 프로젝트의 기존 도구별 규칙 파일을
 * RULES.md(SoT) 표준 섹션으로 가져온다(병합 + 출처 주석).
 * 순수 함수로 분리해 init.ts 의 대화형 분기와 무관하게 테스트 가능하게 한다.
 */

/** adopt 감지 대상 — 5개 도구 규칙 파일(cwd 기준 상대 경로, posix). */
export const ADOPT_SOURCES = [
  '.cursorrules',
  'CLAUDE.md',
  'AGENTS.md',
  '.windsurfrules',
  '.github/copilot-instructions.md',
] as const

export interface DetectedRuleFile {
  /** cwd 기준 상대 경로 */
  path: string
  /** 파일 내용 */
  content: string
}

/** cwd 에서 존재하는 규칙 파일만 골라 경로+내용을 반환. */
export function detectExistingRuleFiles(cwd: string): DetectedRuleFile[] {
  const found: DetectedRuleFile[] = []
  for (const rel of ADOPT_SOURCES) {
    const full = join(cwd, rel)
    if (existsSync(full)) {
      try {
        found.push({ path: rel, content: readFileSync(full, 'utf-8') })
      } catch {
        // 읽기 실패한 파일은 건너뜀(권한 등) — 나머지는 계속 처리
      }
    }
  }
  return found
}

interface ParsedSection {
  title: string
  content: string
}

/**
 * `## ` 헤딩 기준 섹션 분리(헤딩 이전 본문/헤더는 무시).
 * sync.parseRulesMd 와 동일 규칙을 lib 레이어에 로컬 구현해 commands→lib 역의존을 피한다.
 */
function splitSections(content: string): ParsedSection[] {
  const sections: ParsedSection[] = []
  let title = ''
  let buf: string[] = []
  for (const line of content.split('\n')) {
    if (line.startsWith('## ')) {
      if (title) sections.push({ title, content: buf.join('\n').trim() })
      title = line.replace('## ', '').trim()
      buf = []
    } else if (title) {
      buf.push(line)
    }
  }
  if (title) sections.push({ title, content: buf.join('\n').trim() })
  return sections
}

interface MergedSection {
  title: string
  parts: Array<{ source: string; content: string }>
}

/**
 * 감지된 규칙 파일들을 RULES.md 표준 섹션으로 병합.
 * - 같은 제목 섹션은 한 제목 아래로 합치고, 각 본문 앞에 `<!-- 출처: <파일> -->` 주석을 단다.
 * - 결과는 parseRulesMd 로 다시 파싱 가능한 `## ` 구조를 유지한다(init↔sync 연결).
 */
export function buildAdoptedRules(files: DetectedRuleFile[], projectName: string): string {
  const order: string[] = []
  const byTitle = new Map<string, MergedSection>()

  for (const file of files) {
    for (const sec of splitSections(file.content)) {
      let merged = byTitle.get(sec.title)
      if (!merged) {
        merged = { title: sec.title, parts: [] }
        byTitle.set(sec.title, merged)
        order.push(sec.title)
      }
      merged.parts.push({ source: file.path, content: sec.content })
    }
  }

  const lines = [
    `# ${projectName} — Rules`,
    '',
    '> 프로젝트 규칙의 단일 소스(SoT). 기존 규칙을 `vhk init` adopt 로 가져왔습니다.',
    '> 규칙 변경은 항상 이 파일에서만 — `vhk sync` 로 각 도구에 전파됩니다.',
    '',
  ]

  for (const title of order) {
    const merged = byTitle.get(title)!
    lines.push(`## ${title}`)
    for (const part of merged.parts) {
      lines.push(`<!-- 출처: ${part.source} -->`)
      if (part.content) lines.push(part.content)
    }
    lines.push('')
  }

  return lines.join('\n')
}
