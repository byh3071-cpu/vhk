import { routeNaturalLanguage } from './nlp-router.js'
import { CONTAINER_SUBCOMMANDS, CONTAINER_ALIASES } from './command-registry.js'

/** Commander에 등록된 서브커맨드·별칭 (첫 토큰) */
export const KNOWN_COMMAND_TOKENS = new Set([
  'gate', '검증', '아이디어',
  'start', '시작', '새프로젝트',
  'init', '초기화', '만들기',
  'recap', '정리', '오늘',
  'sync', '맞추기', '규칙',
  'check', '점검', '린트',
  'secure', '보안', 'scan', '스캔',
  'ship',
  'doctor', '환경', '진단',
  'save', '저장',
  'undo', '되돌리기',
  'restore', '복원',
  'status', '상태', '현황',
  'diff', '변경', '차이',
  'mcp',
  'mcp-init', 'mcp설정',
  'deploy', '배포',
  'env', '환경변수',
  'env-check', '환경변수점검',
  'publish', '출시',
  '출하',
  'design', '디자인',
  'design-palette', '팔레트',
  'theme', '테마',
  'ref', '레퍼런스',
  'harness', '하네스',
  'audit', '감사',
  'migrate', '전환',
  'update', '업데이트',
  'context', '맥락',
  'context-show', '맥락보기',
  'memory', '기억',
  'brief', '브리핑',
  'cloud', '클라우드',
  'goal', '목표',
  'blocker', '블로커',
  'learn', '교훈',
  'resume', '재개',
  'mode', '모드',
  'verify', '사전점검',
  'help',
])

function isOptionToken(token: string): boolean {
  return token.startsWith('-')
}

/**
 * 서브커맨드를 갖는 컨테이너 명령 → 실제 서브커맨드 이름 목록.
 * `goal check` · `ref add` · `memory list` 처럼 rest[1] 이 실제 서브커맨드면
 * commander 가 직접 처리한다(자연어 라우터가 가로채지 못하게 — R1: 명령어 매칭 우선).
 *
 * 단일 소스: `command-registry.ts` 에서 파생(영문) + 한글 별칭도 같은 집합을 공유.
 * (이전엔 여기 하드코딩 복제였다 → commander 정의와 드리프트 → R1 재발 위험. 레지스트리로 통일.)
 */
const COMMAND_SUBCOMMANDS: Record<string, readonly string[]> = (() => {
  const map: Record<string, readonly string[]> = { ...CONTAINER_SUBCOMMANDS }
  for (const [alias, canonical] of Object.entries(CONTAINER_ALIASES)) {
    const subs = CONTAINER_SUBCOMMANDS[canonical]
    if (subs) map[alias] = subs
  }
  return map
})()

/** rest[0]/rest[1] 이 실제 명령 경로(예: goal check)인가 — 맞으면 NL 가로채기 금지. */
function isRealSubcommandPath(first: string, second: string | undefined): boolean {
  if (second === undefined) return false
  const subs = COMMAND_SUBCOMMANDS[first]
  return subs !== undefined && subs.includes(second)
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

  // 옵션(-/--)이 하나라도 있으면 commander가 파싱. 자연어 가로채기 금지.
  // 예: vhk init --skip-gate --name vhk --type cli -y
  if (rest.some(isOptionToken)) return null

  const input = rest.join(' ').trim()
  if (!input) return null

  const firstIsKnown = KNOWN_COMMAND_TOKENS.has(first)

  // vhk save / vhk 검증
  if (firstIsKnown && rest.length === 1) return null

  if (firstIsKnown && rest.length > 1) {
    // R1 가드: 실제 서브커맨드 경로(goal check, ref add, memory list 등)는
    // 명령어 매칭을 우선해 commander 가 처리한다 — 자연어 라우터가 절대 가로채지 않는다.
    if (isRealSubcommandPath(first, rest[1])) return null
    // vhk 보안 확인 → secure 단독이 아니라 문장 전체를 NLP로 (자연어는 fallback)
    if (routeNaturalLanguage(input)) return input
    return null
  }

  // 첫 토큰이 알려진 명령이 아님 → 자연어
  return input
}
