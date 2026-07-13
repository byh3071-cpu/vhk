import { existsSync, readFileSync } from 'node:fs'
import chalk from 'chalk'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { emitPrompt } from '../lib/emit-prompt.js'
import { buildRulesInheritLines, readCriticalRules } from '../lib/rules-inherit.js'

/**
 * goal 74 — 풀사이클 뒷단 첫 트랙(content). RFC 0052 §4.
 * "상태수집(VISION What) → 프롬프트 생성 → emitPrompt" 자문형 패턴(work.ts 복제).
 * 직접 게시·발송 0 — 초안 프롬프트만 만든다(실패비용 high 제외, 헌법).
 */

export interface ContentInput {
  what?: string // 제품 한 줄 (VISION.md What)
  rules?: string[] // RULES.md 치명 규칙(#456) — undefined = RULES.md 없음(정직 안내로 표기)
}

/**
 * 콘텐츠 초안 생성 프롬프트(순수·결정적). Fable5 프롬프트 위생 상속(goal 68/69):
 * good/bad 예시쌍(✅/❌) + 수치 하드리밋(≤3종·글자수) + 치명 규칙(사람 승인 전 게시·발송 금지)
 * + 프로젝트 RULES.md 치명 규칙 상속(#456 — 런타임 주입, 복붙 0).
 */
export function buildContentPrompt(input: ContentInput): string {
  const what = input.what?.trim() || '(VISION.md 의 What 미정 — vhk init 후 채우기)'
  return [
    '당신은 VHK 프로젝트의 콘텐츠 파트너입니다. 나는 비개발자입니다.',
    '',
    '[제품 한 줄]',
    what,
    '',
    '[해주세요 — 초안만, 직접 게시·발송 금지]',
    '1. 블로그 글 1편 개요 (제목 + 소제목 3개 이하)',
    '2. X(트위터) 스레드 초안 (3트윗 이하)',
    '3. SEO 메타 — title(60자 이하) + description(155자 이하)',
    '',
    '[규칙 — Fable5 위생]',
    '✅ 좋은 예: 제품 한 줄의 핵심 가치를 뽑아 일관된 메시지로',
    '❌ 나쁜 예: 과장·미사여구로 분량만 늘리기',
    '- 결과물 ≤3종, 각 간결하게',
    '- 사람 승인 전에는 어디에도 게시·발송하지 마세요 (이 명령은 초안만 만듭니다)',
    '- 게시 전 보안 게이트(#457): 초안을 파일로 저장하고 `vhk secure scan <파일>` 을 실행 — CRITICAL/HIGH 0 확인 후에만 게시하세요',
    '',
    ...buildRulesInheritLines(input.rules),
    '',
    '모든 응답은 한국어로.',
  ].join('\n')
}

// VISION.md 의 What 한 줄 추출(CRLF 안전). loop-brief.readVisionWhat 와 동일 정규식 — 없으면 undefined.
function readVisionWhat(): string | undefined {
  try {
    if (!existsSync('VISION.md')) return undefined
    const m = /## What[^\r\n]*\r?\n([^\r\n]+)/.exec(readFileSync('VISION.md', 'utf-8'))
    return m?.[1]?.trim() || undefined
  } catch {
    return undefined
  }
}

export function content(): void {
  console.log(chalk.bold('\n📝 ' + t('content.title')))
  console.log(chalk.gray('─'.repeat(40)))

  const prompt = buildContentPrompt({ what: readVisionWhat(), rules: readCriticalRules() })
  emitPrompt(prompt, 'content-prompt.md', '콘텐츠 초안 프롬프트')

  printNextStep({
    message: '클립보드의 프롬프트를 Claude/Cursor 에 붙여 콘텐츠 초안을 받으세요. 게시는 사람이 직접.',
    command: 'vhk launch',
    cursorHint: '콘텐츠 초안 만들어줘',
  })
}
