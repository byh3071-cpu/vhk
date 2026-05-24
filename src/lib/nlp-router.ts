export type NlpCommand =
  | 'gate'
  | 'init'
  | 'recap'
  | 'sync'
  | 'check'
  | 'secure'
  | 'ship'
  | 'doctor'
  | 'save'
  | 'undo'
  | 'diff'
  | 'status'
  | 'mcp-init'
  | 'deploy'
  | 'env'
  | 'env-check'
  | 'publish'
  | 'design'
  | 'design-palette'
  | 'theme'
  | 'ref'
  | 'harness'
  | 'audit'
  | 'migrate'
  | 'update'
  | 'context'
  | 'context-show'
  | 'memory'
  | 'brief'

export type NlpConfidence = 'high' | 'low'

export type NlpRoute = {
  command: NlpCommand
  explanation: string
  confidence: NlpConfidence
  args?: string[]
}

type NlpRule = {
  command: NlpCommand
  explanation: string
  confidence: NlpConfidence
  args?: string[]
  test: (normalized: string) => boolean
}

function normalize(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** 자연어 → 명령 매칭용 키워드 (부분 문자열) */
export const NLP_KEYWORDS: Partial<Record<NlpCommand, readonly string[]>> = {
  save: ['저장', '세이브', '커밋', '올려', '올리기', '푸시', 'push', 'commit'],
  undo: ['되돌려', '되돌리기', '취소', '원래대로', '롤백', '리셋', 'reset', 'rollback'],
  status: ['상태', '현황', '어떻게', '어때', '지금'],
  diff: ['변경', '바뀐', '뭐바뀜', '바뀌었', '차이', '달라진', '수정된'],
}

function matchesKeywords(text: string, command: NlpCommand): boolean {
  const keywords = NLP_KEYWORDS[command]
  if (!keywords) return false
  return keywords.some(kw => text.includes(kw.toLowerCase()))
}

const RULES: NlpRule[] = [
  {
    command: 'init',
    explanation: '검증 스킵하고 바로 프로젝트 시작 (vhk 시작 --skip-gate)',
    confidence: 'high',
    args: ['--skip-gate'],
    test: t =>
      /기획.*(끝|완료)|노션.*(기획|완료)|검증.*(스킵|건너)|gate.*(스킵|건너)|바로.*시작/.test(t),
  },
  {
    command: 'init',
    explanation: 'Notion에서 가져와 프로젝트 시작 (vhk 시작 --from-notion)',
    confidence: 'low',
    args: ['--from-notion'],
    test: t => /노션|notion/.test(t) && /(시작|만들|import|가져)/.test(t),
  },
  {
    command: 'init',
    explanation: '프로젝트 시작 (vhk 시작)',
    confidence: 'high',
    test: t =>
      (/프로젝트.*(만들|시작)|폴더.*만들|만들고\s*싶|하네스|초기화/.test(t) || /^시작$/.test(t)) &&
      !/디자인|design|팔레트|palette|테마|theme|레퍼런스|reference|다크\s*모드|라이트\s*모드|색상\s*모드|브리핑|brief|컨텍스트|context|맥락|기억|memory/.test(t),
  },
  {
    command: 'mcp-init',
    explanation: 'Cursor MCP 연동 설정 (vhk mcp-init)',
    confidence: 'high',
    test: t => /mcp.*(설정|연동|초기|init)|커서.*(연동|설정|mcp)|cursor.*mcp/.test(t),
  },
  {
    command: 'design-palette',
    explanation: '컬러 팔레트 선택 (vhk design-palette)',
    confidence: 'high',
    test: t =>
      /팔레트|palette|컬러\s*(고|선택|바꿔|변경)|색상\s*(고|선택|변경)|색깔\s*선택/.test(t),
  },
  {
    command: 'design',
    explanation: '디자인 토큰 생성 (vhk design)',
    confidence: 'high',
    test: t =>
      (/디자인\s*(토큰|시스템|만들|생성|셋업|설정)|design\s*(token|system|setup)|토큰\s*만들|css\s*변수.*만들|tailwind\s*(컬러|설정)/.test(t)) &&
      !/배포|deploy|vercel|netlify|cloudflare|wrangler|출시|publish|npm/.test(t),
  },
  {
    command: 'theme',
    explanation: '다크/라이트 테마 적용 (vhk theme)',
    confidence: 'high',
    test: t =>
      (/테마(?!\s*(파일|이름))|theme|다크\s*모드|라이트\s*모드|dark\s*mode|light\s*mode|색상\s*모드|모드\s*전환/.test(t)) &&
      !/보안|시크릿|비밀|키\s*유출|secure|scan|스캔|배포|deploy/.test(t),
  },
  {
    command: 'ref',
    explanation: '레퍼런스 목록 (vhk ref list)',
    confidence: 'high',
    test: t =>
      (/^레퍼런스$|^ref$|레퍼런스.*(보|목록|확인|있|뭐)|참고\s*(사이트|목록|링크)|reference.*list/.test(t)) &&
      !/(add|추가|open|열|https?:\/\/)/.test(t),
  },
  {
    command: 'harness',
    explanation: '통합 품질 점검 (vhk harness)',
    confidence: 'high',
    test: t =>
      /하네스|harness|통합\s*점검|품질\s*점검|빌드\s*테스트|lint.*(test|build)|전체\s*점검|품질\s*확인/.test(t),
  },
  {
    command: 'audit',
    explanation: '보안 취약점 감사 (vhk audit)',
    confidence: 'high',
    test: t =>
      /감사|취약점|audit|vulnerability|보안\s*감사|보안\s*취약|의존성\s*취약/.test(t),
  },
  {
    command: 'migrate',
    explanation: '패키지 매니저 전환 (vhk migrate)',
    confidence: 'high',
    test: t =>
      /전환|마이그레이트|migrate|패키지\s*매니저|npm.*pnpm|pnpm.*npm|yarn.*전환|npm.*전환|pnpm.*전환/.test(t),
  },
  {
    command: 'update',
    explanation: 'VHK CLI 최신 버전 업데이트 (vhk update)',
    confidence: 'high',
    test: t =>
      /업데이트|update|버전\s*업|최신\s*버전|셀프\s*업데이트|vhk.*최신|vhk.*업데이트/.test(t),
  },
  {
    command: 'context-show',
    explanation: '컨텍스트 파일 보기 (vhk context-show)',
    confidence: 'high',
    test: t =>
      /맥락\s*(보|확인|보여)|컨텍스트\s*(보|확인|보여)|context\s*show/.test(t),
  },
  {
    command: 'context',
    explanation: '프로젝트 맥락 생성 (vhk context)',
    confidence: 'high',
    test: t =>
      /(^맥락$|^컨텍스트$|^context$|맥락\s*(만들|생성|갱신|업데이트)|컨텍스트\s*(만들|생성|갱신|업데이트)|프로젝트\s*맥락|프로젝트\s*정보\s*생성)/.test(t)
      && !/보|확인|보여|show/.test(t),
  },
  {
    command: 'memory',
    explanation: '기억 목록 조회 (vhk memory list)',
    confidence: 'high',
    test: t =>
      (/^기억$|기억\s*(목록|보|확인|뭐)|memory.*list|결정사항\s*(목록|확인|보여)/.test(t))
      && !/(추가|add|삭제|remove|저장|기록해)/.test(t),
  },
  {
    command: 'brief',
    explanation: '프로젝트 상태 요약 (vhk brief)',
    confidence: 'high',
    test: t =>
      /브리핑|brief|상태\s*요약|프로젝트\s*요약|요약\s*(보고|리포트|보여|만들)|보고서\s*(만들|생성|보여)/.test(t),
  },
  {
    command: 'secure',
    explanation: '보안 스캔 (vhk 보안)',
    confidence: 'high',
    test: t => /보안|시크릿|비밀|키\s*유출|secure|scan/.test(t),
  },
  {
    command: 'check',
    explanation: '규칙 점검 (vhk 점검)',
    confidence: 'high',
    test: t => /규칙.*(점검|위반)|린트|check|위반/.test(t),
  },
  {
    command: 'doctor',
    explanation: '환경 점검 (vhk doctor)',
    confidence: 'high',
    test: t =>
      /뭔가\s*안|안\s*돼|안돼|환경\s*(점검|진단|확인)|진단|doctor|설치.*확인|왜\s*안/.test(t),
  },
  {
    command: 'diff',
    explanation: '변경사항 요약 (vhk diff)',
    confidence: 'high',
    test: t =>
      (matchesKeywords(t, 'diff') || /^diff$/.test(t) || /변경사항|수정\s*내역|차이\s*보|뭐\s*바뀌/.test(t)) &&
      !/저장|커밋|push|푸시|상태|현황|세이브|commit/.test(t),
  },
  {
    command: 'undo',
    explanation: '최근 커밋 되돌리기 (vhk 되돌리기)',
    confidence: 'high',
    test: t => matchesKeywords(t, 'undo') || /undo|커밋\s*취/.test(t),
  },
  {
    command: 'status',
    explanation: '프로젝트 상태 확인 (vhk 상태)',
    confidence: 'high',
    test: t =>
      (matchesKeywords(t, 'status') ||
        /^status$/.test(t) ||
        /브랜치.*(뭐|어디)|git\s*상태|동기화\s*상태|프로젝트\s*상태/.test(t)) &&
      !/보안|시크릿|규칙|점검|린트|환경|진단|doctor|secure|check|스캔|설치/.test(t),
  },
  {
    command: 'save',
    explanation: 'Git에 저장 (vhk 저장)',
    confidence: 'high',
    test: t =>
      (matchesKeywords(t, 'save') || /깃허브|github/.test(t)) &&
      !/정리|recap|되돌|취소|rollback|reset|리셋|롤백|원래대로/.test(t),
  },
  {
    command: 'recap',
    explanation: '오늘 한 일 정리 (vhk 정리)',
    confidence: 'high',
    test: t => /오늘.*(정리|기록)|한\s*일|세션|회고|recap|정리해/.test(t),
  },
  {
    command: 'gate',
    explanation: '아이디어 검증 (vhk 검증)',
    confidence: 'high',
    test: t => /아이디어|검증|gate|go\/refine|pain\s*point/.test(t),
  },
  {
    command: 'sync',
    explanation: '규칙 파일 동기화 (vhk 규칙)',
    confidence: 'high',
    test: t => /규칙.*(맞|동기)|sync|cursorrules|claude\.md.*맞/.test(t),
  },
  {
    command: 'ship',
    explanation: '배포 체크리스트 + 회고 (vhk 출하)',
    confidence: 'high',
    test: t => /^출하$|^ship$|빌드\s*전|(배포|출하)\s*(체크|준비|점검)/.test(t),
  },
  {
    command: 'deploy',
    explanation: '프로덕션 배포 (vhk deploy)',
    confidence: 'high',
    test: t =>
      /^배포$|배포\s*해|배포하|배포해줘|^deploy$|디플로이|vercel|netlify|cloudflare|wrangler|프로덕션|올려줘/.test(t) &&
      !/체크|준비|점검|출하|회고|빌드\s*전/.test(t),
  },
  {
    command: 'env-check',
    explanation: '환경변수 누락 검사 (vhk env-check)',
    confidence: 'high',
    test: t => /환경변수\s*(점검|확인|누락)|env\s*(체크|확인|check)|키\s*(확인|누락)/.test(t),
  },
  {
    command: 'env',
    explanation: '환경변수 관리 (vhk env)',
    confidence: 'high',
    test: t =>
      /환경변수|\.env|env\s*example|env\s*동기화|시크릿\s*정리|키\s*설정/.test(t) &&
      !/점검|확인|누락|체크|check/.test(t),
  },
  {
    command: 'publish',
    explanation: 'npm 배포 (vhk publish)',
    confidence: 'high',
    test: t =>
      /^출시$|출시\s*해|^publish$|퍼블리시|npm\s*(배포|출시)|버전\s*올|^릴리즈$|^release$/.test(t) &&
      !/체크|준비|회고/.test(t),
  },
]

export function routeNaturalLanguage(input: string): NlpRoute | null {
  const normalized = normalize(input)
  if (!normalized) return null

  for (const rule of RULES) {
    if (rule.test(normalized)) {
      return {
        command: rule.command,
        explanation: rule.explanation,
        confidence: rule.confidence,
        args: rule.args,
      }
    }
  }

  return null
}

export function extractNotionUrl(input: string): string | undefined {
  const m = input.match(/https?:\/\/[^\s]+/i)
  return m?.[0]
}
