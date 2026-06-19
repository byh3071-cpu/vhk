import { existsSync, readFileSync } from 'node:fs'
import chalk from 'chalk'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { emitPrompt } from '../lib/emit-prompt.js'

/**
 * goal 76 — 풀사이클 뒷단 셋째 트랙(ops). RFC 0052 §4·§5.
 * "상태수집(VISION What) → 운영 현황 체크리스트 + 운영 회고·다음 결정 프롬프트 → emitPrompt" 자문형(launch.ts 복제).
 * 직접 중단·삭제·피벗 실행 0 — 회고·결정 초안 프롬프트만(실패비용 high 제외, 헌법).
 * launch(75) 다음 순서: 런칭 후 30일 운영 데이터로 유지/피벗/아카이브 회고. today/standup 회고 정신 재사용.
 */

export interface OpsInput {
  what?: string // 제품 한 줄 (VISION.md What)
}

/**
 * 운영 회고·다음 결정 생성 프롬프트(순수·결정적). Fable5 프롬프트 위생 상속(goal 68/69):
 * good/bad 예시쌍(✅/❌) + 수치 하드리밋(액션 ≤3개) + 치명 규칙(사람 승인 전 제품 중단·삭제 금지).
 */
export function buildOpsPrompt(input: OpsInput): string {
  const what = input.what?.trim() || '(VISION.md 의 What 미정 — vhk init 후 채우기)'
  return [
    '당신은 VHK 프로젝트의 운영 파트너입니다. 나는 비개발자입니다.',
    '',
    '[제품 한 줄]',
    what,
    '',
    '[먼저 — 운영 현황 체크리스트를 점검해 빠진 항목만 표로 알려주세요]',
    '- 피드백 채널 (수집 경로: 이메일·폼·커뮤니티 중 1곳 이상)',
    '- 최근 30일 사용자 수 (신규·활성, 모르면 "측정 안 됨"으로)',
    '- 탈출조건 (유지 / 피벗 / 아카이브를 가르는 기준선)',
    '',
    '[그다음 — 초안만, 직접 실행 금지]',
    '1. 운영 회고 1편 (지난 30일: 잘된 것·문제·배운 것 각 1~2줄)',
    '2. 다음 결정 제안 — 유지 / 피벗 / 아카이브 중 1개 + 근거 + 다음 30일 액션 ≤3개',
    '',
    '[규칙 — Fable5 위생]',
    '✅ 좋은 예: 사용자 수·피드백 같은 실제 신호에 근거한 결정',
    '❌ 나쁜 예: 데이터 없이 감으로 피벗·중단을 단정',
    '- 결과물은 회고 1편 + 다음 결정 1개로 압축, 액션은 ≤3개',
    '- 사람 승인 전에는 제품 중단·삭제·대량 변경을 실행하지 마세요 (이 명령은 회고·제안 초안만 만듭니다)',
    '',
    '모든 응답은 한국어로.',
  ].join('\n')
}

// VISION.md 의 What 한 줄 추출(CRLF 안전). launch.readVisionWhat 와 동일 정규식 — 없으면 undefined.
function readVisionWhat(): string | undefined {
  try {
    if (!existsSync('VISION.md')) return undefined
    const m = /## What[^\r\n]*\r?\n([^\r\n]+)/.exec(readFileSync('VISION.md', 'utf-8'))
    return m?.[1]?.trim() || undefined
  } catch {
    return undefined
  }
}

export function ops(): void {
  console.log(chalk.bold('\n🛠️ ' + t('ops.title')))
  console.log(chalk.gray('─'.repeat(40)))

  const prompt = buildOpsPrompt({ what: readVisionWhat() })
  emitPrompt(prompt, 'ops-prompt.md', '운영 회고 프롬프트')

  // sell(goal 77)로 체인 — content→launch→ops→sell 흐름 완성. 제품 중단·피벗·결제는 사람이 직접(헌법).
  printNextStep({
    message:
      '클립보드의 프롬프트를 Claude/Cursor 에 붙여 운영 회고·다음 결정 초안을 받으세요. 제품 중단·피벗은 사람이 직접 결정.',
    command: 'vhk sell',
    cursorHint: '운영 회고 만들어줘',
  })
}
