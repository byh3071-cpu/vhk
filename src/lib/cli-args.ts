import { routeNaturalLanguage } from './nlp-router.js'
import { CONTAINER_SUBCOMMANDS, CONTAINER_ALIASES, resolveSubcommandAlias } from './command-registry.js'

/** Commander에 등록된 서브커맨드·별칭 (첫 토큰) */
export const KNOWN_COMMAND_TOKENS = new Set([
  'gate', '검증', '아이디어',
  'start', '시작', '새프로젝트',
  'bootstrap',
  'init', '초기화', '만들기',
  'recap', '정리', '오늘',
  'sync', '맞추기', '규칙',
  'check', '점검', '린트',
  // #345: 'scan'·'스캔' 은 secure 의 서브-별칭일 뿐 최상위 명령/별칭이 아니다 → 유령 KNOWN 토큰.
  // KNOWN 에 두면 단일토큰일 때 detect 가 null 반환 → commander raw 'too many arguments'(미지 단어보다 나쁨).
  // 빼면 NL 라우터로 흘러 친절 처리된다. (KNOWN ⊆ 실제 명령/별칭 — registry-drift-usage 테스트가 강제)
  'policy', '정책',
  'secure', '보안',
  'ship',
  'doctor', '환경', '진단',
  'save', '저장',
  'undo', '되돌리기',
  'restore', '복원',
  // #345: '현황' 은 status 의 별칭이 아니다(status 는 '상태'만) → 유령 KNOWN 토큰. 빼면 NL→status 로 친절 라우팅.
  'status', '상태',
  'stats', '통계',
  'loop', '틱',
  'diff', '변경', '차이',
  'diff-cover', '커버리지',
  'mcp',
  'mcp-init', 'mcp설정',
  'inject-bootstrap', '생태계규칙',
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
  'recall', '회상',
  'brief', '브리핑',
  'loop-brief', '루프브리핑',
  'remind', '리마인드',
  'content', '콘텐츠',
  'launch', '런칭',
  'ops', '운영',
  'sell', '판매',
  'cloud', '클라우드',
  'goal', '목표',
  'blocker', '블로커',
  'learn', '교훈',
  'win', '성공',
  'autonomy-log', '자율기록',
  'watch', '감시',
  'resume', '재개',
  'mode', '모드',
  'verify', '사전점검',
  'cost', '비용',
  'preflight', '출고점검',
  'testmap', '테스트매핑',
  'worktree', '워크트리',
  'standup', '아침',
  'today', '자축',
  'review', '검토',
  'receipt', '증거영수증',
  'mission', '미션',
  'pattern', '패턴',
  'evolve', '진화',
  'work', '작업',
  'seo',
  'config', '설정',
  'help', '도움말',
])

function isOptionToken(token: string): boolean {
  return token.startsWith('-')
}

/**
 * 자유형식 본문을 인자로 받는 명령(#147). 본문에 'sync'·'상태' 등 NLP 키워드가 섞이면
 * 라우터가 문장 전체를 가로채 엉뚱한 명령(sync 등)이 실행되므로, 이 명령들은 NL 가로채기를
 * 건너뛰고 항상 commander 가 인자 그대로 처리한다. (영문 + 한글 별칭 모두 포함)
 */
const FREEFORM_ARG_COMMANDS = new Set([
  'learn', '교훈',
  'win', '성공',
  'blocker', '블로커',
  // #313: recall 은 자유형식 검색 쿼리라 '어떻게·보안·롤백' 등 트리거 단어가 본문에 와도
  // 항상 commander 로 위임돼야 한다(NL 라우터 가로채기 금지 — learn/blocker 와 동일).
  'recall', '회상',
])

/**
 * 위치인자(예약 서브명령 등)를 명령 스스로 처리하는 leaf 명령 → NL 가로채기 금지.
 * #405: `vhk check evals` 의 'evals' 가 NL 라우터의 bare 'check' 키워드(nlp-router 규칙)에 삼켜져
 * check() 가 인자 없이 실행되는 silent fallback 을 막는다 → commander 위치인자로 위임해
 * check() 가 직접 인식/안내(evals 미구현 안내·미인식 인자 에러)하게 한다.
 * (영문 + 한글 별칭 모두 — KNOWN_COMMAND_TOKENS ⊆ 실제 명령/별칭 을 registry-drift 가 강제하므로 실재 토큰만.)
 */
const POSITIONAL_ARG_COMMANDS = new Set([
  'check', '점검', '린트',
])

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
  if (subs === undefined) return false
  // #457 중대-1: `보안 스캔 <파일>` 처럼 서브커맨드 '한글 별칭'도 실경로 — 영문만 보면
  // NL 라우터가 가로채 파일 인자를 유실(유출 파일을 "깨끗"으로 오보고). 별칭을 정규화해 대조.
  const canonical = CONTAINER_ALIASES[first] ?? first
  return subs.includes(resolveSubcommandAlias(canonical, second))
}

/**
 * 컨테이너(서브커맨드 보유) 명령 → 그 명령 자신의 NLP 커맨드명.
 * #314: `vhk memory 왜 안 되나` 처럼 컨테이너+무효서브에 트리거 단어가 섞이면, NL 라우터가
 * 문장 전체를 가로채 **다른** 명령(doctor/help/status)으로 조용히 오라우팅된다(cross-misroute).
 * 반대로 `vhk 보안 확인`은 NL 이 secure(=컨테이너 자기 명령)로 라우팅되므로 가로채기가 안전하다.
 * → "NL 라우트가 컨테이너 자기 명령일 때만" 가로채기를 허용하는 판별에 쓴다.
 * (NlpCommand 와 1:1 인 컨테이너만 등재 — worktree/seo 등 NL 비대상은 의도적으로 제외해 무효서브 시 차단된다.)
 */
const CONTAINER_OWN_NLP_COMMAND: Record<string, string> = {
  secure: 'secure',
  memory: 'memory',
  goal: 'goal',
  work: 'work',
  ref: 'ref',
  pattern: 'pattern',
  evolve: 'evolve',
  mission: 'mission',
  cloud: 'cloud-push', // 클라우드 백업/복원 → cloud-push/cloud-pull (둘 다 cloud 컨테이너 소속)
}
function isContainerOwnRoute(first: string, routeCommand: string): boolean {
  const canonicalFirst = CONTAINER_ALIASES[first] ?? first
  const own = CONTAINER_OWN_NLP_COMMAND[canonicalFirst]
  if (own === undefined) return false
  if (canonicalFirst === 'cloud') return routeCommand === 'cloud-push' || routeCommand === 'cloud-pull'
  return routeCommand === own
}

/** 컨테이너(서브커맨드 보유) 명령인가 — 영문명 또는 한글 별칭. */
function isContainerCommand(first: string): boolean {
  const canonical = CONTAINER_ALIASES[first] ?? first
  return CONTAINER_SUBCOMMANDS[canonical] !== undefined
}

/**
 * 서브커맨드 없는 leaf 명령에 추가 토큰이 붙었을 때, 의도한 형제 명령으로 유도하기 위한 맵.
 * #344: `vhk env check`·`vhk design palette` 는 leaf 인데 정답이 별도 top-level 명령
 * (env-check·design-palette)이라, raw 'too many arguments' 대신 정확한 명령을 친절히 안내한다.
 * key 는 영문 leaf 명령 + 한글 별칭 모두. (영문 별칭 단어로만 매칭 — 첫 추가 토큰이 일치할 때 유도)
 */
const LEAF_ARG_SUGGEST: Record<string, { arg: string; suggest: string }> = {
  env: { arg: 'check', suggest: 'env-check' },
  환경변수: { arg: 'check', suggest: 'env-check' },
  design: { arg: 'palette', suggest: 'design-palette' },
  디자인: { arg: 'palette', suggest: 'design-palette' },
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

  // 옵션(-/--)은 원칙적으로 commander가 파싱한다. 유일한 예외는 실제 대상 argv 추출에 성공한
  // 읽기 전용 `policy check` 질문이다. 단, 등록 명령이 첫 토큰이면 옵션·자유 본문을 포함한
  // 명시 호출이므로 자연어가 절대 가로채지 않는다.
  if (rest.some(isOptionToken)) {
    if (firstIsKnown) return null
    const route = routeNaturalLanguage(input)
    const concretePolicyCheck =
      route?.command === 'policy' && route.args?.[0] === 'check' && route.args.length > 1
    return concretePolicyCheck ? input : null
  }

  // #147: 자유형식 본문 명령(learn/blocker)은 본문에 NLP 키워드가 있어도 가로채지 않는다.
  if (firstIsKnown && FREEFORM_ARG_COMMANDS.has(first)) return null

  // #405: 위치인자 처리 명령(check)은 NL 가로채기 금지 → commander 가 'evals' 등 위치인자를 받게.
  if (firstIsKnown && POSITIONAL_ARG_COMMANDS.has(first)) return null

  // vhk save / vhk 검증
  if (firstIsKnown && rest.length === 1) return null

  if (firstIsKnown && rest.length > 1) {
    const route = routeNaturalLanguage(input)
    // `정책 기준선 고정해줘`처럼 실제 서브경로 뒤에 자연어 동사가 붙은 경우다.
    // baseline은 자연어에서 실행되지 않고 사람용 --confirm 안내만 하므로 이 한 경로만 안전하게 허용한다.
    const naturalPolicyBaseline =
      (CONTAINER_ALIASES[first] ?? first) === 'policy' &&
      resolveSubcommandAlias('policy', rest[1]) === 'baseline' &&
      route?.command === 'policy' &&
      route.args?.[0] === 'baseline' &&
      rest.length > 2
    if (naturalPolicyBaseline) return input
    // R1 가드: 실제 서브커맨드 경로(goal check, ref add, memory list 등)는
    // 명령어 매칭을 우선해 commander 가 처리한다 — 자연어 라우터가 절대 가로채지 않는다.
    if (isRealSubcommandPath(first, rest[1])) return null
    // #314: 첫 토큰이 컨테이너 명령(memory/goal 등)이고 둘째가 무효 서브커맨드면, NL 라우트가
    // **다른** 명령으로 새는 cross-misroute 를 차단한다. (memory 왜안되나 → doctor, goal 어떻게 → status)
    // 컨테이너 자기 명령으로 라우팅될 때만(보안 확인 → secure) NL 가로채기를 허용해 회귀를 막는다.
    // 가로채기를 막은 케이스는 detectInvalidCommandUsage 가 친절 invalid-subcommand 안내를 낸다.
    if (isContainerCommand(first) && route && !isContainerOwnRoute(first, route.command)) return null
    // vhk 보안 확인 → secure 단독이 아니라 문장 전체를 NLP로 (자연어는 fallback)
    if (route) return input
    return null
  }

  // 첫 토큰이 알려진 명령이 아님 → 자연어
  return input
}

/**
 * 등록된 명령에 잘못된 인자 조합을 줬을 때, commander 의 raw 영어 에러('too many arguments')
 * 대신 한국어 친절 안내 메시지를 만든다. 감지 못 하면 null(평소 흐름 그대로).
 * index.ts 에서 detectNaturalLanguageInput 보다 **먼저** 호출해 raw 에러/cross-misroute 를 가로챈다.
 *
 * 잡는 케이스(드리프트 3종):
 *  - #344 leaf+추가인자: env check → "env-check 명령을 쓰세요" (정답 형제 명령 유도)
 *  - #314 컨테이너+무효서브: memory 왜안되나 → 유효 서브커맨드 목록 안내(엉뚱한 doctor 실행 금지)
 *  - #613 컨테이너+무효서브+옵션: memory 없는서브 --type … → unknown option 오진 대신 같은 안내
 */
export function detectInvalidCommandUsage(argv: string[]): string | null {
  const rest = argv.slice(2)
  if (rest.length < 2) return null

  const first = rest[0]
  if (isOptionToken(first)) return null
  // 둘째 토큰이 옵션이면 서브커맨드 시도가 아님 — commander 파싱에 맡긴다.
  // 예전엔 옵션이 하나라도 있으면 전부 건너뛰어, 무효 서브+옵션이 raw unknown option 으로 샜다(#613).
  if (isOptionToken(rest[1])) return null

  // #344: leaf 명령 + 정답이 형제 top-level 명령인 경우 → 형제 명령으로 유도.
  const leaf = LEAF_ARG_SUGGEST[first]
  if (leaf && rest[1] === leaf.arg) {
    return `'vhk ${first} ${leaf.arg}' 는 없는 명령이에요. 'vhk ${leaf.suggest}' 를 실행하세요.`
  }

  // #314: 컨테이너 명령 + 무효 서브커맨드 → 유효 서브커맨드 목록 안내(NL cross-misroute 차단).
  // 단, NL 이 컨테이너 자기 명령으로 라우팅되는 경우(보안 확인 → secure, 기억 보여줘 → memory)는
  // 자연어로 정상 처리되므로 친절안내 대상이 아니다 — detectNaturalLanguageInput 과 동일 판별.
  const canonical = CONTAINER_ALIASES[first] ?? first
  const subs = CONTAINER_SUBCOMMANDS[canonical]
  if (subs && !isRealSubcommandPath(first, rest[1])) {
    const input = rest.join(' ').trim()
    const route = routeNaturalLanguage(input)
    if (route && isContainerOwnRoute(first, route.command)) return null // 자연어로 정상 처리
    return `'${rest[1]}' 는 ${first} 의 서브커맨드가 아니에요. 사용 가능: ${subs.join(', ')} (예: vhk ${first} ${subs[0]})`
  }

  return null
}
