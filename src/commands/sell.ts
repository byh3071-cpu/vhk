import { existsSync, readFileSync } from 'node:fs'
import chalk from 'chalk'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { emitPrompt } from '../lib/emit-prompt.js'
import { lessonsSectionLines, recallLessonLines } from '../lib/prompt-recall.js'

/**
 * goal 77 — 풀사이클 뒷단 넷째(마지막) 트랙(sell). RFC 0052 §4·§5.
 * "상태수집(VISION What) → 판매 준비 체크리스트 + 가격 페이지·FAQ 초안 프롬프트 → emitPrompt" 자문형(launch/ops 복제).
 * 결제 연동·실제 과금 0 — 카피 초안만(실패비용 최상위라 트랙 마지막·가장 보수적, 헌법).
 */

export interface SellInput {
  what?: string // 제품 한 줄 (VISION.md What)
  lessons?: string[] // #458: 과거 교훈 회상 라인(≤3·각 1줄) — 없으면 섹션 생략
}

// #458: 판매/가격 관련 기억을 끌어올 고정 회상 쿼리(결정적 — LLM 0).
const SELL_RECALL_QUERY = '판매 가격 결제 환불 과금'

/**
 * 가격 페이지 카피·FAQ 생성 프롬프트(순수·결정적). Fable5 프롬프트 위생 상속(goal 68/69):
 * good/bad 예시쌍(✅/❌) + 수치 하드리밋(FAQ ≤3개) + 치명 규칙(사람 승인 전 결제·과금 연동 금지).
 */
export function buildSellPrompt(input: SellInput): string {
  const what = input.what?.trim() || '(VISION.md 의 What 미정 — vhk init 후 채우기)'
  return [
    '당신은 VHK 프로젝트의 판매 파트너입니다. 나는 비개발자입니다.',
    '',
    '[제품 한 줄]',
    what,
    '',
    ...lessonsSectionLines(input.lessons ?? []),
    '[먼저 — 판매 준비 체크리스트를 점검해 빠진 항목만 표로 알려주세요]',
    '- 가격 (금액 + 과금 주기: 월/연/일회성)',
    '- 결제수단 (예: Stripe·Lemon Squeezy·계좌이체 중 후보 — 연동은 사람이 직접)',
    '- 환불정책 (기간·조건 한 줄)',
    '- 가치제안 (왜 이 가격을 낼 만한지 한 줄)',
    '',
    '[그다음 — 초안만, 직접 결제·과금 금지]',
    '1. 가격 페이지 카피 1편 (헤드라인 + 플랜 설명 3줄 이하 + CTA 문구)',
    '2. 자주 묻는 질문(FAQ) ≤3개 (가격·환불·해지 관련)',
    '',
    '[규칙 — Fable5 위생]',
    '✅ 좋은 예: 가치제안과 가격을 정직하게 연결, 숨은 비용 없이',
    '❌ 나쁜 예: 과장된 할인 압박·다크패턴·근거 없는 "한정"',
    '- 결과물은 가격 페이지 카피 1편 + FAQ ≤3개로 압축',
    '- 사람 승인 전에는 결제·과금·구독을 연동·실행하지 마세요 (이 명령은 카피 초안만 만듭니다)',
    '- 게시 전 보안 게이트(#457): 카피 초안을 파일로 저장하고 `vhk secure scan <파일>` 을 실행 — CRITICAL/HIGH 0 확인 후에만 게시하세요',
    '',
    '모든 응답은 한국어로.',
  ].join('\n')
}

// VISION.md 의 What 한 줄 추출(CRLF 안전). ops.readVisionWhat 와 동일 정규식 — 없으면 undefined.
function readVisionWhat(): string | undefined {
  try {
    if (!existsSync('VISION.md')) return undefined
    const m = /## What[^\r\n]*\r?\n([^\r\n]+)/.exec(readFileSync('VISION.md', 'utf-8'))
    return m?.[1]?.trim() || undefined
  } catch {
    return undefined
  }
}

export function sell(): void {
  console.log(chalk.bold('\n💰 ' + t('sell.title')))
  console.log(chalk.gray('─'.repeat(40)))

  const prompt = buildSellPrompt({ what: readVisionWhat(), lessons: recallLessonLines(process.cwd(), SELL_RECALL_QUERY) })
  emitPrompt(prompt, 'sell-prompt.md', '판매 카피 프롬프트')

  // sell = 뒷단 4트랙 마지막 — 다음 터미널 명령 없음(content→launch→ops→sell 체인 끝).
  // 결제·과금 연동은 실패비용 최상위라 사람이 직접(헌법). 이 명령은 카피 초안까지만.
  printNextStep({
    message:
      '클립보드의 프롬프트를 Claude/Cursor 에 붙여 가격 페이지·FAQ 초안을 받으세요. 결제 연동·과금은 사람이 직접.',
    cursorHint: '가격 페이지 카피 만들어줘',
  })
}
