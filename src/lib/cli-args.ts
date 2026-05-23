import { routeNaturalLanguage } from './nlp-router.js'

/** Commander에 등록된 서브커맨드·별칭 (첫 토큰) */
export const KNOWN_COMMAND_TOKENS = new Set([
  'gate', '검증', '아이디어',
  'init', '시작', '만들기',
  'recap', '정리', '오늘',
  'sync', '맞추기', '규칙',
  'check', '점검', '린트',
  'secure', '보안', 'scan', '스캔',
  'ship', '배포', '릴리즈',
  'doctor', '환경', '진단',
  'save', '저장',
  'undo', '되돌리기',
  'status', '상태', '현황',
  'diff', '변경', '차이',
  'help',
])

function isOptionToken(token: string): boolean {
  return token.startsWith('-')
}

/**
 * `vhk "보안 확인"`, `vhk 보안 확인`, `vhk 프로젝트 현황` 등
 * 서브커맨드가 아닌 자연어 입력을 감지. 감지 시 전체 문장 반환.
 */
export function detectNaturalLanguageInput(argv: string[]): string | null {
  const rest = argv.slice(2)
  if (rest.length === 0) return null

  const first = rest[0]
  if (isOptionToken(first)) return null

  const input = rest.join(' ').trim()
  if (!input) return null

  const firstIsKnown = KNOWN_COMMAND_TOKENS.has(first)

  // vhk save / vhk 검증
  if (firstIsKnown && rest.length === 1) return null

  // vhk init --skip-gate / vhk secure scan
  if (firstIsKnown && rest.slice(1).every(isOptionToken)) return null

  if (firstIsKnown && rest.length > 1) {
    // vhk 보안 확인 → secure 단독이 아니라 문장 전체를 NLP로
    if (routeNaturalLanguage(input)) return input
    return null
  }

  // 첫 토큰이 알려진 명령이 아님 → 자연어
  return input
}
