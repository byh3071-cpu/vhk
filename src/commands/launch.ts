import { existsSync, readFileSync } from 'node:fs'
import chalk from 'chalk'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { emitPrompt } from '../lib/emit-prompt.js'

/**
 * goal 75 — 풀사이클 뒷단 둘째 트랙(launch). RFC 0052 §4·§5.
 * "상태수집(VISION What) → 런칭 준비 체크리스트 + 게시물 초안 프롬프트 → emitPrompt" 자문형(work.ts/content.ts 복제).
 * 직접 게시·발송 0 — 초안 프롬프트만 만든다(실패비용 high 제외, 헌법).
 * content(74) 산출물을 소비: 콘텐츠 메시지를 런칭 게시물·채널별 변형으로 확장.
 */

export interface LaunchInput {
  what?: string // 제품 한 줄 (VISION.md What)
}

/**
 * 런칭 게시물 초안 생성 프롬프트(순수·결정적). Fable5 프롬프트 위생 상속(goal 68/69):
 * good/bad 예시쌍(✅/❌) + 수치 하드리밋(≤3 변형·X 280자) + 치명 규칙(사람 승인 전 게시·발송 금지).
 */
export function buildLaunchPrompt(input: LaunchInput): string {
  const what = input.what?.trim() || '(VISION.md 의 What 미정 — vhk init 후 채우기)'
  return [
    '당신은 VHK 프로젝트의 런칭 파트너입니다. 나는 비개발자입니다.',
    '',
    '[제품 한 줄]',
    what,
    '',
    '[먼저 — 런칭 준비 체크리스트를 점검해 빠진 항목만 표로 알려주세요]',
    '- 도메인 연결 (랜딩 URL 확정)',
    '- 랜딩 페이지 (설명 + 명확한 CTA)',
    '- 데모 (영상·GIF·라이브 링크 중 1)',
    '- OG 이미지 (공유 썸네일)',
    '- 런칭 채널 후보 3곳 (예: Product Hunt · X · 관련 커뮤니티)',
    '',
    '[그다음 — 초안만, 직접 게시·발송 금지]',
    '1. 런칭 게시물 본문 1편 (제목 + 3문단 이하)',
    '2. 채널별 변형 ≤3개 (X 짧은 버전 / 커뮤니티 정중한 버전 / 뉴스레터 버전)',
    '',
    '[규칙 — Fable5 위생]',
    '✅ 좋은 예: 제품 한 줄의 핵심 가치를 채널 톤에 맞춰 일관된 메시지로',
    '❌ 나쁜 예: 채널마다 메시지가 따로 놀거나 과장으로 분량만 늘리기',
    '- 결과물 ≤3종(게시물 1 + 변형 묶음), X 변형은 280자 이하',
    '- 사람 승인 전에는 어디에도 게시·발송하지 마세요 (이 명령은 초안만 만듭니다)',
    '',
    '모든 응답은 한국어로.',
  ].join('\n')
}

// VISION.md 의 What 한 줄 추출(CRLF 안전). content.readVisionWhat 와 동일 정규식 — 없으면 undefined.
function readVisionWhat(): string | undefined {
  try {
    if (!existsSync('VISION.md')) return undefined
    const m = /## What[^\r\n]*\r?\n([^\r\n]+)/.exec(readFileSync('VISION.md', 'utf-8'))
    return m?.[1]?.trim() || undefined
  } catch {
    return undefined
  }
}

export function launch(): void {
  console.log(chalk.bold('\n🚀 ' + t('launch.title')))
  console.log(chalk.gray('─'.repeat(40)))

  const prompt = buildLaunchPrompt({ what: readVisionWhat() })
  emitPrompt(prompt, 'launch-prompt.md', '런칭 게시물 프롬프트')

  // 후속 트랙 vhk sell(goal 77)은 미구현 — command 힌트는 구현된 ops(76)까지만(댕글링 전방참조 금지).
  // 런칭 직후 실제 다음 행동은 "초안을 Claude 에 받아 사람이 직접 게시 → 운영 회고(vhk ops)" 흐름.
  printNextStep({
    message: '클립보드의 프롬프트를 Claude/Cursor 에 붙여 런칭 게시물 초안을 받으세요. 게시는 사람이 직접.',
    command: 'vhk ops',
    cursorHint: '런칭 게시물 초안 만들어줘',
  })
}
