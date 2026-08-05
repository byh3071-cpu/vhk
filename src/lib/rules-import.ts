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

/** 첫 ## 이전 인트로(preamble)를 보존하는 섹션 제목. sync 의 미매칭 경고 제외 대상이기도 함. */
export const PREAMBLE_TITLE = '서문'

export interface DetectedRuleFile {
  /** cwd 기준 상대 경로 */
  path: string
  /** 파일 내용 */
  content: string
}

interface ManagedBlock {
  key: string
  start: number
  end: number
  normalized: string
}

const MANAGED_MARKER_RE = /<!--\s*([A-Za-z0-9][A-Za-z0-9._-]*):(BEGIN|END)\b[^>]*-->/g

function managedBlockError(source: string, detail: string): Error {
  return new Error(
    `${source} 관리형 블록 오류: ${detail} 원본 파일은 변경하지 않았습니다. ` +
    'BEGIN/END 마커를 한 쌍으로 맞춘 뒤 vhk init을 다시 실행하세요.'
  )
}

function inspectManagedBlocks(file: DetectedRuleFile): ManagedBlock[] {
  const blocks: ManagedBlock[] = []
  let open: { key: string; start: number; contentStart: number } | null = null
  MANAGED_MARKER_RE.lastIndex = 0
  for (const match of file.content.matchAll(MANAGED_MARKER_RE)) {
    const key = match[1]
    const kind = match[2]
    const markerStart = match.index
    const markerEnd = markerStart + match[0].length
    if (kind === 'BEGIN') {
      if (open) {
        throw managedBlockError(file.path, `${open.key} 블록 안에 ${key} BEGIN이 중첩됐습니다.`)
      }
      open = { key, start: markerStart, contentStart: markerEnd }
      continue
    }
    if (!open) throw managedBlockError(file.path, `${key} END에 대응하는 BEGIN이 없습니다.`)
    if (open.key !== key) {
      throw managedBlockError(file.path, `${open.key} BEGIN이 ${key} END로 닫혔습니다.`)
    }
    const innerContent = file.content.slice(open.contentStart, markerStart)
    blocks.push({
      key,
      start: open.start,
      end: markerEnd,
      normalized: innerContent.replace(/\r\n/g, '\n').trim(),
    })
    open = null
  }
  if (open) throw managedBlockError(file.path, `${open.key} BEGIN에 대응하는 END가 없습니다.`)
  return blocks
}

function validateAndDedupeManagedBlocks(files: DetectedRuleFile[]): DetectedRuleFile[] {
  const firstByKey = new Map<string, { normalized: string; source: string }>()
  return files.map((file) => {
    const duplicateRanges: Array<{ start: number; end: number }> = []
    for (const block of inspectManagedBlocks(file)) {
      const first = firstByKey.get(block.key)
      if (!first) {
        firstByKey.set(block.key, { normalized: block.normalized, source: file.path })
        continue
      }
      if (first.normalized !== block.normalized) {
        throw managedBlockError(
          file.path,
          `${block.key} 내용이 다릅니다(${first.source}와 비교). 어느 쪽이 맞는지 자동으로 선택하지 않습니다.`
        )
      }
      duplicateRanges.push({ start: block.start, end: block.end })
    }
    let content = file.content
    for (const range of duplicateRanges.sort((a, b) => b.start - a.start)) {
      content = content.slice(0, range.start) + content.slice(range.end)
    }
    return { ...file, content }
  })
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
  const preamble: string[] = []
  let sawHeading = false
  for (const line of content.split('\n')) {
    if (line.startsWith('## ')) {
      sawHeading = true
      if (title) sections.push({ title, content: buf.join('\n').trim() })
      title = line.replace('## ', '').trim()
      buf = []
    } else if (title) {
      buf.push(line)
    } else if (!sawHeading) {
      // ⑥ 첫 ## 이전 본문(인트로)은 버리지 않고 '서문'으로 보존.
      preamble.push(line)
    }
  }
  if (title) sections.push({ title, content: buf.join('\n').trim() })
  const pre = preamble.join('\n').trim()
  if (pre) sections.unshift({ title: PREAMBLE_TITLE, content: pre })
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

  for (const file of validateAndDedupeManagedBlocks(files)) {
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
    // ⑥ 빈 섹션 생성 금지 — 본문 있는 출처만. 전부 비면 제목 자체를 생략.
    const nonEmpty = merged.parts.filter((p) => p.content.trim())
    if (!nonEmpty.length) continue
    lines.push(`## ${title}`)
    for (const part of nonEmpty) {
      lines.push(`<!-- 출처: ${part.source} -->`)
      lines.push(part.content)
    }
    lines.push('')
  }

  return lines.join('\n')
}
