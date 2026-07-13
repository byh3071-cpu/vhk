import { existsSync, readFileSync } from 'node:fs'

/**
 * #456 — 뒷단(content/launch/sell/ops) 산출물 프롬프트에 프로젝트 RULES.md 의
 * 치명 규칙(NON-NEGOTIABLE/절대 규칙/Forbidden/전역 금지)을 상속시키는 단일 SoT.
 * remind.ts 의 추출기를 lib 로 이동 — remind + 뒷단 4명령이 같은 추출기를 공유하고,
 * 프롬프트는 RULES.md 를 런타임에 직접 읽는다(정적 복붙 0 = 드리프트 구조적 불가).
 */

// 치명 규칙으로 간주할 RULES.md 섹션 헤더. 카드(goal68)는 NON-NEGOTIABLE·절대 규칙을 명시하지만
// 실제 vhk RULES.md 는 'VHK 운영 — Forbidden (전역 금지)' 를 쓴다 → 헤더 변형을 모두 흡수해야
// 빈 산출물(쓸모 0)을 피한다. 추가 변형은 OR 로 확장.
const CRITICAL_HEADER = /non-negotiable|절대\s*규칙|forbidden|전역\s*금지/i

/** 프롬프트에 주입할 규칙 수 하드리밋 — 무한정 늘리면 프롬프트 비대(Fable5 위생). */
export const MAX_INHERIT_RULES = 10

/** 규칙 1개당 길이 하드리밋(자) — 병적으로 긴 불릿이 프롬프트를 삼키는 것 방어. */
export const MAX_RULE_LEN = 120

interface ParsedSection {
  title: string
  content: string
}

// `## ` 기준 섹션 분리 — sync.parseRulesMd 와 동형. lib→commands 역의존을 피하려고
// 로컬 구현(rules-import.splitSections 선례). 동작 핀(### 하위 흡수·CRLF)은 remind.test 가 지킨다.
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

// 불릿 한 줄 → 치명 규칙 핵심. 선행 '-/*' 와 후행 괄호주석(가드#·이유 등 메타)을 떼어
// 1번째 턴과 100번째 턴이 같은 무게로 읽히는 최소 포맷으로 압축(원문 보존 아닌 핵심).
export function compressRule(line: string): string {
  return line
    .replace(/^\s*[-*]\s+/, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
}

export function extractCriticalRules(content: string): string[] {
  return splitSections(content)
    .filter((s) => CRITICAL_HEADER.test(s.title))
    .flatMap((s) => s.content.split('\n'))
    .filter((l) => /^\s*[-*]\s+/.test(l))
    .map(compressRule)
    .filter((r) => r.length > 0)
}

/**
 * RULES.md 를 읽어 치명 규칙을 추출한다.
 * undefined = 파일 없음/읽기 실패(정직 폴백 신호) · [] = 파일은 있으나 치명 섹션 없음.
 */
export function readCriticalRules(rulesPath = 'RULES.md'): string[] | undefined {
  try {
    if (!existsSync(rulesPath)) return undefined
    return extractCriticalRules(readFileSync(rulesPath, 'utf-8'))
  } catch {
    return undefined
  }
}

/**
 * 프롬프트 상속 블록 포매터(순수). 뒷단 4명령 공용 — RULES.md 없음/치명 섹션 없음도
 * 숨기지 않고 1줄로 정직하게 알린다(#456 완료기준: 없으면 정직한 안내, 현행 동작 유지).
 */
export function buildRulesInheritLines(rules: string[] | undefined): string[] {
  const lines = ['[프로젝트 규칙 — RULES.md 치명 규칙 상속(단일소스)]']
  if (rules === undefined) {
    lines.push('(RULES.md 없음 또는 읽기 실패 — 프로젝트 규칙 상속 생략. `vhk init` 으로 생성하면 여기 주입됩니다)')
    return lines
  }
  if (rules.length === 0) {
    lines.push('(RULES.md 에 치명 규칙 섹션 없음 — `## 절대 규칙` 또는 `## Forbidden` 을 추가하면 여기 상속됩니다)')
    return lines
  }
  for (const r of rules.slice(0, MAX_INHERIT_RULES)) {
    lines.push(`- ${r.length > MAX_RULE_LEN ? r.slice(0, MAX_RULE_LEN) + '…' : r}`)
  }
  if (rules.length > MAX_INHERIT_RULES) {
    lines.push(`- …외 ${rules.length - MAX_INHERIT_RULES}개는 RULES.md 원문 참조`)
  }
  return lines
}
