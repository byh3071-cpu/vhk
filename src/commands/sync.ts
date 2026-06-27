import chalk from 'chalk'
import fs from 'node:fs'
import path from 'node:path'
import { prompt } from '../lib/prompt.js'
import { localDate } from '../lib/date.js'
import { ko } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { normalizeForCompare } from '../lib/drift.js'
import { saveBackup, pruneBackups, ensureVhkIgnored } from '../lib/backup.js'
import { atomicWriteFile } from '../lib/atomic-write.js'
import { PREAMBLE_TITLE } from '../lib/rules-import.js'
import { isInteractive, promptOrDefault } from '../lib/interactive.js'

interface RulesSection {
  title: string
  content: string
}

const CURSORRULES_KEYS = ['코딩 규칙', '기술 스택', '아키텍처', '디자인', 'Anti-patterns', '커밋']
// #149: 'VHK 운영'(이슈 정책 등 운영 규약)을 매핑 — CLAUDE.md/AGENTS.md record 그룹으로 전파.
// (코딩 타깃에는 안 들어감 — 운영 규약은 코딩 규칙이 아니므로 의도된 분리.)
// 키를 'VHK 운영'으로 한정 — '운영'만 쓰면 '## 자동 운영 스크립트' 등 무관 섹션까지 substring 오탐.
const CLAUDE_MD_KEYS = ['기록', '로그', 'ADR', '트러블슈팅', 'TIL', '/done', '체크리스트', 'VHK 운영']

// #133: CLAUDE.md 자동생성 블록이 다른 타깃(AGENTS.md 등)과 동일하게 코딩+기록 섹션을 모두
// 담도록 통합 키셋. toClaudeMd 출력과 마이그레이션(stripLegacyAutogen)의 옛 자동생성 판정이
// 같은 집합을 써야 재생성 섹션이 사용자 섹션으로 오인돼 중복되지 않는다.
const VHK_MANAGED_KEYS = [...CURSORRULES_KEYS, ...CLAUDE_MD_KEYS]

/**
 * RULES.md 섹션 중 어느 sync 타깃 키(CURSORRULES_KEYS ∪ CLAUDE_MD_KEYS)에도
 * 매핑되지 않는 섹션 제목. 이 섹션들은 모든 산출물에서 빠지므로(예: `## 프로젝트 정체성`)
 * sync 가 **조용히 버리지 않고 경고**하도록 sync() 가 이걸로 사용자에게 알린다.
 */
export function findUnmappedSections(sections: RulesSection[]): string[] {
  const allKeys = [...CURSORRULES_KEYS, ...CLAUDE_MD_KEYS]
  return sections
    // PREAMBLE_TITLE(서문)은 도구 산출물 대상이 아니라 RULES.md 보존용 → 미매칭 경고에서 제외(노이즈 0).
    .filter((s) => s.title !== PREAMBLE_TITLE && !allKeys.some((k) => s.title.includes(k)))
    .map((s) => s.title)
}

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
 * Gemini CLI — 루트 GEMINI.md 컨텍스트 파일(공식, Markdown). 하드 글자수 제한 없음 → 절삭 안 함.
 */
export function toGeminiMd(sections: RulesSection[], projectName: string): string {
  return buildCodingDoc('Gemini CLI Rules', sections, projectName)
}

/**
 * Cline — `.clinerules/vhk-rules.md` (공식 docs.cline.bot/features/cline-rules — `.clinerules/`
 * 디렉터리에 다중 .md 규칙 파일. Antigravity `.agents/rules/vhk-rules.md` 와 동형). Markdown 무제한.
 */
export function toClineRules(sections: RulesSection[], projectName: string): string {
  return buildCodingDoc('Cline Rules', sections, projectName)
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

/** CLAUDE.md 자동생성 규칙 섹션 경고 배너 — 출력과 멱등 dedup 이 공유하는 단일 출처. */
const CLAUDE_AUTOGEN_BANNER = '> ⚡ 아래 규칙 섹션은 RULES.md에서 자동 생성됨 (vhk sync). 직접 수정 금지.'

/**
 * CLAUDE.md 내 vhk 관리 영역 sentinel 마커(안 보이는 HTML 주석).
 * 마커 **안** = 매 sync 재생성(배너 + RULES 유래 record 섹션). 마커 **밖** = 사용자 영역(보존).
 * 이전엔 마커가 없어 header + '## 현재 상태' 외 모든 사용자 섹션을 조용히 드롭했음(배치1 결함).
 */
const VHK_BLOCK_START = '<!-- vhk:rules:start -->'
const VHK_BLOCK_END = '<!-- vhk:rules:end -->'

/** vhk 관리 블록(배너 + 관리 섹션=코딩+기록/운영)을 마커로 감싸 생성. toClaudeMd 가 매 sync 이 형태로 재생성. */
function buildVhkBlock(managedSections: RulesSection[]): string {
  const lines = [VHK_BLOCK_START, CLAUDE_AUTOGEN_BANNER, '']
  for (const section of managedSections) {
    lines.push(`## ${section.title}`)
    lines.push(section.content)
    lines.push('')
  }
  lines.push(VHK_BLOCK_END)
  return lines.join('\n')
}

/**
 * 문자열에서 완결된 vhk 마커블록(START…END)을 전부 제거. 마커쌍이 여러 개일 때(#325 병합/복붙
 * 사고) 첫 쌍 밖에 남은 다른 관리 블록들을 사용자영역에서 지워 중복을 수렴시킨다.
 * 각 블록 = START 위치부터 그 뒤 첫 END 끝까지(비중첩, non-greedy). 짝 없는 잔존 START/END 는
 * stripLegacyAutogen 처럼 폴백 경로에서 정리되므로 여기선 완결 쌍만 다룬다.
 */
function stripAllVhkBlocks(s: string): string {
  let out = s
  for (;;) {
    const start = out.indexOf(VHK_BLOCK_START)
    if (start === -1) break
    const end = out.indexOf(VHK_BLOCK_END, start + VHK_BLOCK_START.length)
    if (end === -1) break // 완결 쌍 없음 → 잔존 START 는 그대로 (폴백서 처리)
    out = out.slice(0, start) + out.slice(end + VHK_BLOCK_END.length)
  }
  return out
}

/**
 * 마커 쌍을 찾아 바깥(before/after = 사용자 영역)을 분리. 마커 없거나 훼손(start/end 누락·역전)이면
 * null → 호출부가 마이그레이션 경로(stripLegacyAutogen)로 폴백.
 * 첫 쌍 기준으로 분리하되, before/after 에 남은 **다른 완결 마커블록**은 stripAllVhkBlocks 로
 * 제거된다 — 마커쌍이 2개 이상이어도(병합/복붙 사고) 관리 블록은 항상 1개로 수렴 (#325 자기치유).
 */
function splitVhkBlock(existing: string): { before: string; after: string } | null {
  const start = existing.indexOf(VHK_BLOCK_START)
  const end = existing.indexOf(VHK_BLOCK_END)
  if (start === -1 || end === -1 || end < start) return null
  return {
    before: stripAllVhkBlocks(existing.slice(0, start)),
    after: stripAllVhkBlocks(existing.slice(end + VHK_BLOCK_END.length)),
  }
}

/**
 * 마이그레이션(마커 없는 기존 CLAUDE.md): 옛 자동생성(배너 줄 + CLAUDE_MD_KEYS 매칭 `## ` 섹션)만
 * 제거하고 사용자 콘텐츠(헤더 + 비-키 섹션 = '## 현재 상태'·'## 프로젝트 정보' 등)는 원래 순서로 보존.
 * - 배너는 **정확히 일치하는 줄**만 제거 → 사용자가 직접 쓴 '> ⚡' 인용줄은 보존(절단 회귀 방지).
 * - "사용자 섹션 vs RULES서 삭제된 스테일 vhk 섹션"을 구분 못 하므로, 키 매칭 섹션은 옛 자동생성으로
 *   간주해 제거하고 RULES 유래 record 로 재생성한다(스테일 규칙이 유령으로 남아 단일출처 깨지는 것 방지).
 * @returns cleaned 보존된 사용자 콘텐츠, removed 제거된 옛 자동생성 섹션 제목, preserved 보존된 사용자 섹션 제목
 */
function stripLegacyAutogen(existing: string): { cleaned: string; removed: string[]; preserved: string[] } {
  // 배너 줄 + 훼손돼 split 에 안 잡힌 잔존 마커 줄(start/end)도 청소 — 폴백 출력에 마커가 새지 않아 멱등 유지.
  // 사용자가 직접 쓴 '> ⚡' 인용줄은 배너 문구 전체와 불일치해 보존된다.
  const lines = existing
    .split('\n')
    .filter(line => {
      const t = line.trim()
      return t !== CLAUDE_AUTOGEN_BANNER && t !== VHK_BLOCK_START && t !== VHK_BLOCK_END
    })

  const headerLines: string[] = []
  const blocks: { title: string; body: string[] }[] = []
  let cur: { title: string; body: string[] } | null = null
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (cur) blocks.push(cur)
      cur = { title: line.slice(3).trim(), body: [line] }
    } else if (cur) {
      cur.body.push(line)
    } else {
      headerLines.push(line)
    }
  }
  if (cur) blocks.push(cur)

  const removed: string[] = []
  const preserved: string[] = []
  const keptBodies: string[] = []
  for (const b of blocks) {
    if (VHK_MANAGED_KEYS.some(k => b.title.includes(k))) {
      removed.push(b.title) // 옛 자동생성(코딩+기록) → vhk 블록으로 재생성 (#133 중복 방지)
    } else {
      preserved.push(b.title) // 사용자 섹션 → 보존
      keptBodies.push(b.body.join('\n').trimEnd())
    }
  }

  const header = headerLines.join('\n').trim()
  const cleaned = [header, ...keptBodies].filter(Boolean).join('\n\n')
  return { cleaned, removed, preserved }
}

/** 마이그레이션 시 보존/제거 섹션 집계 — syncCore 가 result 로 노출하고 호출부가 경고 출력. */
export interface ClaudeMdMigration {
  migrated: boolean
  removed: string[]
  preserved: string[]
}

/**
 * 기존 CLAUDE.md 가 마커 없는(=마이그레이션 대상) 상태인지와 보존/제거 섹션을 계산.
 * 마커가 이미 있으면 migrated=false(추가 작업 없음). toClaudeMd 와 동일 분기 로직을 공유한다.
 */
export function claudeMdMigration(existing: string): ClaudeMdMigration {
  if (splitVhkBlock(existing)) return { migrated: false, removed: [], preserved: [] }
  const { removed, preserved } = stripLegacyAutogen(existing)
  return { migrated: true, removed, preserved }
}

/**
 * RULES.md 섹션을 CLAUDE.md 포맷으로 변환. vhk 영역만 sentinel 마커로 감싸 재생성하고
 * 마커 밖(사용자 섹션)은 보존. 마커가 없으면 1회 마이그레이션(옛 자동생성만 제거 + 사용자 섹션 보존).
 * 멱등: 마이그레이션 출력에 마커가 박히므로 재호출 시 마커 경로로 동일 결과를 낸다.
 */
export function toClaudeMd(sections: RulesSection[], existing: string): string {
  // #133: CLAUDE.md 도 .cursorrules·AGENTS.md 수준으로 코딩 규칙/커밋/아키텍처까지 전파.
  // 코딩 섹션 먼저, 그 다음 기록/운영 섹션 (AGENTS.md 순서와 동일). 한 섹션이 양쪽 키에
  // 걸쳐도 1회만 — 중복 emit 방지(dedup).
  const codingSections = sections.filter(s => CURSORRULES_KEYS.some(k => s.title.includes(k)))
  const recordSections = sections.filter(s => CLAUDE_MD_KEYS.some(k => s.title.includes(k)))
  const seen = new Set<string>()
  const managedSections = [...codingSections, ...recordSections].filter(s => {
    if (seen.has(s.title)) return false
    seen.add(s.title)
    return true
  })
  const vhkBlock = buildVhkBlock(managedSections)

  const split = splitVhkBlock(existing)
  if (split) {
    // 마커 영역만 교체, 바깥(사용자 영역) 보존 → 멱등
    const before = split.before.replace(/\s+$/, '')
    const after = split.after.replace(/^\s+/, '').replace(/\s+$/, '')
    return [before, vhkBlock, after].filter(s => s.length > 0).join('\n\n') + '\n'
  }

  // 마이그레이션 — 마커 없는 기존 CLAUDE.md: 사용자 섹션 보존 + 마커블록 재조립
  const { cleaned } = stripLegacyAutogen(existing)
  return [cleaned, vhkBlock].filter(s => s.length > 0).join('\n\n') + '\n'
}

/** AGENTS.md compact 포인터 대상 — repo 에 실제 있을 때만 sync 가 안내 줄을 넣는다. */
export function resolveAgentCompactRel(rootDir: string): string | null {
  for (const rel of ['docs/context/agent-compact.md', 'AGENTS.compact.md']) {
    if (fs.existsSync(path.join(rootDir, rel))) return rel
  }
  return null
}

/** E6-01: tier S/A child AGENTS.md — ecosystem cross-repo block (Loop Protocol 직후 고정 삽입). */
export function agentsMdEcosystemBlock(): string[] {
  return [
    '## Ecosystem (cross-repo)',
    '',
    '> Contract SoT: yohan-brain `memory/core/ecosystem-contract.yaml` (obey when status=active).',
    '',
    '- **Tier:** yohan-brain `memory/core/inheritance-registry.yaml`',
    '- **Cursor:** `.cursor/rules/ecosystem.mdc` (vhk inject-bootstrap)',
    '- **금지:** AGENTS.md 손수 편집 → `RULES.md` + `vhk sync`',
    '',
  ]
}

/**
 * RULES.md 섹션을 AGENTS.md 포맷으로 변환 (sync 6번째 타겟).
 * Loop Protocol 보일러플레이트를 생성기에 내장해 — sync 가 AGENTS.md 를 재생성해도
 * 운영 규약(Loop Protocol)·compact 안내가 보존된다(수기 AGENTS.md 하드코딩 회피).
 */
export function toAgentsMd(
  sections: RulesSection[],
  projectName: string,
  /** null = compact 안내 생략. undefined = 레거시 테스트 기본(경로 문자열 포함). */
  compactRel: string | null | undefined = 'docs/context/agent-compact.md',
): string {
  const codingSections = sections.filter(s => CURSORRULES_KEYS.some(k => s.title.includes(k)))
  const recordSections = sections.filter(s => CLAUDE_MD_KEYS.some(k => s.title.includes(k)))
  // #131: 한 섹션이 양쪽 키에 걸리면(예: '기술 스택 (변경 시 ADR 필수)' = '기술 스택'+'ADR')
  // 두 번 출력되던 버그 → 제목 기준 dedup(코딩 먼저).
  const seenMapped = new Set<string>()
  const orderedMapped = [...codingSections, ...recordSections].filter(s => {
    if (seenMapped.has(s.title)) return false
    seenMapped.add(s.title)
    return true
  })
  // #130: 표준 키에 안 맞는 커스텀 H2(서문 제외 — 예: '작업 3원칙'·'DoD')를 「기타 규칙」 버킷으로
  // 전파 → 사용자 핵심 가드가 조용히 누락되지 않게.
  const extraSections = sections.filter(s =>
    s.title !== PREAMBLE_TITLE &&
    !CURSORRULES_KEYS.some(k => s.title.includes(k)) &&
    !CLAUDE_MD_KEYS.some(k => s.title.includes(k))
  )

  const lines = [
    `# ${projectName} — AGENTS.md (에이전트 작동 규약)`,
    '',
    '> ⚡ 이 파일은 RULES.md에서 자동 생성됨 (vhk sync). 직접 수정 금지.',
  ]
  if (compactRel !== null) {
    lines.push(`> 빠른 시작(토큰 절감): \`${compactRel ?? 'docs/context/agent-compact.md'}\` 를 먼저 읽으세요.`)
  }
  lines.push(
    '',
    '## Loop Protocol',
    '- 루프: `context → goal next → 작업 → goal check → goal done`',
    '- 작업 시작 시 `.vhk/HARD_STOP` 확인 — 있으면 모든 자동화 즉시 중단.',
    '- active goal 만 작업. `docs/state`(next-task/blockers)는 append-only.',
    '- 교훈·결정·실패·성공은 `vhk memory`(memory v2 4버킷, 단일 출처).',
    '- 게이트(tsc / test:run / build) 통과해야만 `vhk goal done`.',
    '',
    ...agentsMdEcosystemBlock(),
  )

  for (const section of orderedMapped) {
    lines.push(`## ${section.title}`)
    lines.push(section.content)
    lines.push('')
  }

  // #130: 비표준 커스텀 섹션을 하나의 「기타 규칙」 H2 아래 ### 로 모아 전파(H2 네임스페이스 비오염).
  if (extraSections.length) {
    lines.push('## 기타 규칙')
    lines.push('> RULES.md 의 비표준 H2 섹션 — 표준 매핑 외이지만 보존 위해 전파(직접 수정은 RULES.md 에서).')
    lines.push('')
    for (const section of extraSections) {
      lines.push(`### ${section.title}`)
      lines.push(section.content)
      lines.push('')
    }
  }

  return lines.join('\n')
}

/**
 * RULES.md 첫 줄에서 프로젝트명 도출. sync() 와 드리프트 점검이 **같은 로직**을
 * 쓰도록 단일 출처로 분리 (둘이 다르게 도출하면 거짓 드리프트 발생).
 */
export function deriveProjectName(rulesContent: string): string {
  const firstLine = rulesContent.split('\n')[0]
  return firstLine.replace(/^#\s*/, '').replace(/\s*—.*/, '').trim() || 'Project'
}

export interface SyncTarget {
  /** cwd 기준 상대 경로 (posix) */
  path: string
  /** RULES.md 섹션 → 파일 내용 (순수 함수) */
  generate: (sections: RulesSection[], projectName: string) => string
  /** 완료 메시지 (ko.sync.*) */
  doneMessage: string
}

/**
 * sync 출력 대상 단일 레지스트리 — sync() 가 쓰고, 드리프트 점검(`lib/drift.ts`)이 읽는다.
 * 도구 추가 = 여기 항목 1개 추가 → sync·drift 자동 반영 (목록 중복/하드코딩 방지).
 * CLAUDE.md 는 하이브리드(현재 상태 보존 + 기존 내용 병합)라 이 레지스트리에서 제외.
 */
export const SYNC_TARGETS: SyncTarget[] = [
  { path: '.cursorrules', generate: toCursorrules, doneMessage: ko.sync.cursorrulesDone },
  { path: '.windsurfrules', generate: toWindsurfrules, doneMessage: ko.sync.windsurfDone },
  { path: '.github/copilot-instructions.md', generate: toCopilotInstructions, doneMessage: ko.sync.copilotDone },
  { path: '.agents/rules/vhk-rules.md', generate: toAntigravityRules, doneMessage: ko.sync.antigravityDone },
  // AGENTS.md — 6번째 타겟. 항목 1개 추가로 sync·드리프트·백업 가드가 자동 반영된다.
  { path: 'AGENTS.md', generate: toAgentsMd, doneMessage: ko.sync.agentsDone },
  // Goal 16 — Gemini CLI / Cline (공식 경로 검증). 레지스트리 추가만으로 drift·백업 자동 반영.
  { path: 'GEMINI.md', generate: toGeminiMd, doneMessage: ko.sync.geminiDone },
  { path: '.clinerules/vhk-rules.md', generate: toClineRules, doneMessage: ko.sync.clineDone },
]

/** 보존할 백업 개수 — 무한 증식 방지(스케일/팀 고려). */
const BACKUP_KEEP = 10
/** 로컬 전용 sync 마커 — 존재 여부로 첫 sync 판정. 추적/클라우드 제외. */
const SYNCED_MARKER_REL = path.join('.vhk', '.synced')

export interface SyncOptions {
  /** 미리보기만 — 디스크 변경 없음 */
  dryRun?: boolean
  /** drift 확인 프롬프트 생략(덮어쓰기 동의 간주) */
  yes?: boolean
  /** 검사만 — 쓰기 0, drift 있으면 exitCode 1 (Goal 63) */
  check?: boolean
}

export interface SyncCheckResult {
  /** 디스크 내용이 생성본과 다른 타겟 (직접 수정 또는 RULES.md 변경 후 sync 미실행) */
  drifted: string[]
  /** 디스크에 없는 타겟 (sync 가 만들 파일) */
  missing: string[]
  ok: boolean
}

/**
 * Goal 63 — 8개 sync 타겟(SYNC_TARGETS 7 + CLAUDE.md 블록) 전체 drift 검사. 쓰기 0.
 * 생성 로직(buildSyncPlan)을 그대로 재사용 — 별도 검사기가 sync 와 어긋나는
 * "검사기의 drift"(governance 배치에서 check-rules-sync 의 알려진 한계) 원천 차단.
 */
export function syncCheck(rootDir: string): SyncCheckResult {
  const rulesContent = fs.readFileSync(path.join(rootDir, 'RULES.md'), 'utf-8')
  const sections = parseRulesMd(rulesContent)
  const plan = buildSyncPlan(rootDir, sections, deriveProjectName(rulesContent))
  const drifted = plan.filter((p) => p.exists && p.drift).map((p) => p.path)
  const missing = plan.filter((p) => !p.exists).map((p) => p.path)
  return { drifted, missing, ok: drifted.length === 0 && missing.length === 0 }
}

export interface SyncPlanItem {
  path: string
  newContent: string
  doneMessage: string
  /** 디스크에 이미 존재? */
  exists: boolean
  /** 기존 파일이 RULES.md 생성본과 다름(=수작업 수정 가능성). 정규화 비교(거짓 드리프트 방지). */
  drift: boolean
  /** CLAUDE.md 전용 — 마커 없는 기존 파일을 마이그레이션할 때 보존/제거 섹션 집계(조용한 드롭 방지 경고용). */
  migration?: ClaudeMdMigration
}

export interface SyncResult {
  dryRun: boolean
  firstSync: boolean
  backupId: string | null
  backedUp: string[]
  written: string[]
  skipped: string[]
  truncated: string[]
  plan: SyncPlanItem[]
  /** ③ 어느 타깃에도 매핑 안 돼 산출물에서 빠지는 섹션 제목 — 조용히 버리지 않게 호출자에 노출. */
  unmapped: string[]
  /** CLAUDE.md 마커 마이그레이션 집계 — migrated=true 면 호출자가 보존/제거 섹션 경고를 출력. */
  claudeMigration?: ClaudeMdMigration
}

/**
 * SYNC_TARGETS(순수 미러) + CLAUDE.md(하이브리드) 를 균일한 계획으로.
 * drift 판정은 `normalizeForCompare`(lib/drift) 재활용 — CRLF/끝공백 거짓경보 방지.
 */
export function buildSyncPlan(
  rootDir: string,
  sections: RulesSection[],
  projectName: string
): SyncPlanItem[] {
  const plan: SyncPlanItem[] = []
  for (const target of SYNC_TARGETS) {
    const fullPath = path.join(rootDir, target.path)
    const exists = fs.existsSync(fullPath)
    const newContent =
      target.path === 'AGENTS.md'
        ? toAgentsMd(sections, projectName, resolveAgentCompactRel(rootDir))
        : target.generate(sections, projectName)
    // drift = 정규화 후 비교. 공백/EOL(CRLF)-only 차이는 의도적으로 drift 아님(거짓경보·백업 churn 방지)
    // → 그 차이는 백업 없이 덮어써질 수 있으나 규칙 본문은 절대 손실 안 됨(범위 한정).
    const drift = exists
      ? normalizeForCompare(fs.readFileSync(fullPath, 'utf-8')) !== normalizeForCompare(newContent)
      : false
    plan.push({ path: target.path, newContent, doneMessage: target.doneMessage, exists, drift })
  }
  // CLAUDE.md — 하이브리드(현재 상태 보존 + 병합). 레지스트리 밖이지만 같은 가드 적용.
  const claudePath = path.join(rootDir, 'CLAUDE.md')
  const claudeExists = fs.existsSync(claudePath)
  const existingClaude = claudeExists
    ? fs.readFileSync(claudePath, 'utf-8')
    : `# 기록 규칙 (${projectName})\n\n## 현재 상태\n- **Phase:** **FILL**\n- **블로커:** 없음\n- **다음 액션:** **FILL**\n- **마지막 업데이트:** ${localDate()}`
  const claudeNew = toClaudeMd(sections, existingClaude)
  const claudeDrift = claudeExists
    ? normalizeForCompare(existingClaude) !== normalizeForCompare(claudeNew)
    : false
  plan.push({
    path: 'CLAUDE.md',
    newContent: claudeNew,
    doneMessage: ko.sync.claudeDone,
    exists: claudeExists,
    drift: claudeDrift,
    // 기존 CLAUDE.md 가 있을 때만 마이그레이션 집계(첫 생성은 마이그레이션 아님). 추가 I/O 0 — 이미 읽은 existingClaude 재사용.
    migration: claudeExists ? claudeMdMigration(existingClaude) : undefined,
  })
  return plan
}

/**
 * sync 핵심 — fs 작업 + 안전 가드. **콘솔 출력 없이 결과만 반환**(테스트 가능 seam).
 * 절대 손실 금지: 덮어쓰기 전 (drift || 첫 sync) 파일을 무조건 백업.
 * confirmOverwrite: drift 파일을 덮어쓸지 결정 — TTY면 inquirer, 비대화형/--yes면 자동 true 를 호출부가 주입.
 * 백업이 먼저라 confirm 결과와 무관하게 원본은 항상 복구 가능.
 */
export async function syncCore(
  rootDir: string,
  opts: SyncOptions,
  confirmOverwrite: (drifted: SyncPlanItem[]) => Promise<boolean>
): Promise<SyncResult> {
  const rulesContent = fs.readFileSync(path.join(rootDir, 'RULES.md'), 'utf-8')
  const sections = parseRulesMd(rulesContent)
  const projectName = deriveProjectName(rulesContent)
  const plan = buildSyncPlan(rootDir, sections, projectName)
  const firstSync = !fs.existsSync(path.join(rootDir, SYNCED_MARKER_REL))
  // ③ 실제 누락 발생 지점(섹션 → 타깃 매핑)에서 미매칭 섹션을 집계해 결과에 노출.
  // 콘솔 출력은 호출자(sync()/MCP)가 result.unmapped 로 한다(syncCore 는 순수 seam 유지).
  const unmapped = findUnmappedSections(sections)
  // CLAUDE.md 마커 마이그레이션 집계(있으면) — 호출자가 보존/제거 섹션 경고에 사용. 추가 I/O 없음(plan 재사용).
  const claudeMigration = plan.find((p) => p.path === 'CLAUDE.md')?.migration

  // --dry-run — 어떤 디스크 변경도 하지 않는다(백업·쓰기·마커 전부 생략)
  if (opts.dryRun) {
    return {
      dryRun: true,
      firstSync,
      backupId: null,
      backedUp: [],
      written: [],
      skipped: [],
      truncated: [],
      plan,
      unmapped,
      claudeMigration,
    }
  }

  // 덮어쓰기 전 백업 — 존재 && (drift || 첫 sync)
  const toBackup = plan.filter((p) => p.exists && (p.drift || firstSync)).map((p) => p.path)
  let backupId: string | null = null
  let backedUp: string[] = []
  if (toBackup.length) {
    const info = saveBackup(toBackup, rootDir)
    pruneBackups(BACKUP_KEEP, rootDir)
    backupId = info.id
    backedUp = info.files
  }

  // drift 동의 — drift 있을 때만 묻는다(백업은 이미 저장됨)
  const drifted = plan.filter((p) => p.drift)
  const overwriteDrift = drifted.length ? await confirmOverwrite(drifted) : true

  const written: string[] = []
  const skipped: string[] = []
  const truncated: string[] = []
  for (const item of plan) {
    // drift 인데 덮어쓰기 거부 → 사용자 수정 보존(쓰기 스킵). 신규·무드리프트는 항상 쓴다.
    if (item.drift && !overwriteDrift) {
      skipped.push(item.path)
      continue
    }
    const fullPath = path.join(rootDir, item.path)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true }) // 중첩 경로(.github/·.agents/rules/) 보장
    // 미러 파일(.cursorrules 등)은 RULES.md 에서 언제든 재생성 가능(vhk sync 재실행) → 원자성 불필요.
    // 영속 상태(refs.json·latest.json·.synced)만 atomicWriteFile(Goal 37) — 손상 시 복구 불가라.
    fs.writeFileSync(fullPath, item.newContent, 'utf-8')
    written.push(item.path)
    // 절삭 마커는 antigravity 만 생성 — 전체 마커 문구로 한정(오탐 방지)
    if (item.newContent.includes('Antigravity 12,000자 제한으로 절삭됨')) {
      truncated.push(item.path)
    }
  }

  // 동기화 마커(로컬 전용) — 다음 실행 firstSync 판정용
  fs.mkdirSync(path.join(rootDir, '.vhk'), { recursive: true })
  atomicWriteFile(path.join(rootDir, SYNCED_MARKER_REL), new Date().toISOString() + '\n')
  ensureVhkIgnored(rootDir, '.synced')

  return { dryRun: false, firstSync, backupId, backedUp, written, skipped, truncated, plan, unmapped, claudeMigration }
}

export async function sync(opts: SyncOptions = {}): Promise<void> {
  const cwd = process.cwd()
  const rulesPath = path.join(cwd, 'RULES.md')

  // --check: 검사 전용(쓰기 0). drift 시 process.exitCode=1 — MCP 규칙(process.exit 금지)
  // 준수하며 CLI/CI 에 비정상 종료코드 전달.
  if (opts.check) {
    if (!fs.existsSync(rulesPath)) {
      console.log(chalk.yellow(ko.sync.checkNoRules))
      return
    }
    const r = syncCheck(cwd)
    if (r.ok) {
      console.log(chalk.green(ko.sync.checkPass))
      return
    }
    for (const p of r.drifted) console.log(chalk.yellow(`  ${ko.sync.checkDrift(p)}`))
    for (const p of r.missing) console.log(chalk.yellow(`  ${ko.sync.checkMissing(p)}`))
    console.log(chalk.red(ko.sync.checkFail(r.drifted.length + r.missing.length)))
    process.exitCode = 1
    return
  }

  console.log(chalk.bold(`\n${ko.sync.title}\n`))

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

  const sections = parseRulesMd(fs.readFileSync(rulesPath, 'utf-8'))
  console.log(chalk.dim(`  📄 RULES.md 파싱 완료 — ${sections.length}개 섹션`))

  // 비대화형(CI/MCP subprocess)·--yes → 자동 덮어쓰기(멈춤 금지).
  // TTY → drift 시 inquirer 확인(기본 거부). 어느 쪽이든 백업이 먼저라 손실 0.
  // 감지 축 = stdin(SoT isInteractive) — stdout 아님(E8/R1). 비-TTY 면 stdin 미접근(MCP 안전).
  const confirmOverwrite = async (drifted: SyncPlanItem[]): Promise<boolean> =>
    promptOrDefault(
      async () => {
        for (const d of drifted) console.log(chalk.yellow(`  ${ko.sync.driftWarn(d.path)}`))
        const { confirm } = await prompt<{ confirm: boolean }>([
          {
            type: 'confirm',
            name: 'confirm',
            message: ko.sync.driftConfirm(drifted.length),
            default: false,
          },
        ])
        return confirm
      },
      true, // 비대화형/--yes → 자동 덮어쓰기(백업이 먼저라 손실 0, 멱등)
      { yes: opts.yes },
    )

  const result = await syncCore(cwd, opts, confirmOverwrite)

  // ③ 누락 발생 지점(syncCore)이 집계한 미매칭 섹션을 호출자가 경고 — 조용히 사라지지 않게.
  if (result.unmapped.length) {
    // #249: 비표준 섹션은 AGENTS.md 「기타 규칙」에 전파됨(#130) — 손실 아님.
    //       단 .cursorrules 등 코딩 규칙 파일은 표준 제목만(설계상 코딩/디자인 전용).
    console.error(
      chalk.yellow(
        `  ⚠️  ${result.unmapped.length}개 비표준 섹션은 .cursorrules 등 코딩 규칙 파일엔 미포함(표준 제목만): ${result.unmapped.join(', ')}` +
          `\n     (단 AGENTS.md 「기타 규칙」에는 전파됨 — 손실 아님. 코딩 파일에도 넣으려면 표준 제목 사용, 수정은 RULES.md 에서.)`
      )
    )
  }

  // 배치1 — 마커 없는 기존 CLAUDE.md 를 마커 형식으로 1회 정리. 보존/교체 섹션을 안내(조용한 드롭 방지).
  if (result.claudeMigration?.migrated) {
    console.log(
      chalk.cyan(
        `  ${ko.sync.claudeMigrated(result.claudeMigration.preserved, result.claudeMigration.removed)}`
      )
    )
  }

  if (result.dryRun) {
    console.log(chalk.cyan(`\n${ko.sync.dryRunHeader}`))
    for (const item of result.plan) {
      console.log(ko.sync.dryRunWouldWrite(item.path, item.exists && item.drift))
    }
    const wouldBackup = result.plan
      .filter((p) => p.exists && (p.drift || result.firstSync))
      .map((p) => p.path)
    if (wouldBackup.length) {
      console.log(chalk.dim(`\n  백업 예정(${wouldBackup.length}): ${wouldBackup.join(', ')}`))
    }
    return
  }

  if (result.backupId) {
    if (result.firstSync) console.log(chalk.cyan(`  ${ko.sync.firstSync}`))
    if (!isInteractive(opts)) {
      console.log(chalk.yellow(`  ${ko.sync.nonTtyAuto(result.backedUp.length, result.backupId)}`))
    } else {
      console.log(chalk.cyan(`  ${ko.sync.backupSaved(result.backedUp.length, result.backupId)}`))
    }
  }
  for (const p of result.written) {
    const item = result.plan.find((i) => i.path === p)
    if (item) console.log(chalk.green(`  ${item.doneMessage}`))
  }
  for (const _ of result.truncated) {
    console.log(chalk.yellow(`    ⚠️  ${ko.sync.antigravityTruncated}`))
  }
  for (const p of result.skipped) {
    console.log(chalk.gray(`  ${ko.sync.skipped(p)}`))
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
