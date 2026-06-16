export type NlpCommand =
  | 'gate'
  | 'start'
  | 'init'
  | 'recap'
  | 'sync'
  | 'check'
  | 'secure'
  | 'ship'
  | 'doctor'
  | 'save'
  | 'undo'
  | 'restore'
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
  | 'loop-brief'
  | 'remind'
  | 'goal'
  | 'cloud-push'
  | 'cloud-pull'
  | 'help'
  | 'mode'
  | 'verify'
  | 'review'
  | 'mission'
  | 'pattern'
  | 'evolve'
  | 'work'

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
  pattern: ['패턴', '되풀이', '버릇', 'pattern'],
  evolve: ['진화', '룰후보', '진화후보'],
  undo: ['되돌려', '되돌리기', '취소', '원래대로', '롤백', '리셋', 'reset', 'rollback'],
  status: ['상태', '현황', '어떻게', '어때', '지금'],
  diff: ['변경', '바뀐', '뭐바뀜', '바뀌었', '차이', '달라진', '수정된'],
  work: ['이어서', '이어하기', 'work'],
}

function matchesKeywords(text: string, command: NlpCommand): boolean {
  const keywords = NLP_KEYWORDS[command]
  if (!keywords) return false
  return keywords.some(kw => text.includes(kw.toLowerCase()))
}

const RULES: NlpRule[] = [
  // restore 는 cloud-pull/undo 보다 먼저 평가 — "백업 복원/되돌려" 가 클라우드 복원이나
  // 커밋 되돌리기로 새지 않도록. "백업" 한정이라 bare "복원해"(=cloud-pull)·"되돌려"(=undo)는 안 가로챔.
  {
    command: 'restore',
    explanation: 'sync 백업 복원 (vhk restore)',
    confidence: 'high',
    test: t => /백업/.test(t) && /(복원|복구|되돌려|되살려|롤백|restore)/.test(t),
  },
  // 영문 `vhk cloud push|pull [id]` 은 commander 가 직접 처리(가로채기 금지) — 한국어 표현만 매칭.
  {
    command: 'cloud-pull',
    explanation: '클라우드에서 .vhk 복원 (vhk cloud pull)',
    confidence: 'high',
    test: t =>
      (/(클라우드|gist)\s*(에서)?\s*(복원|내려받?|내리|받아)/.test(t) ||
        /(\.?vhk\s*)?(복원해|복구해|복원\s*하|복구\s*하)/.test(t)) &&
      !/백업|올려|올리/.test(t),
  },
  {
    command: 'cloud-push',
    explanation: '.vhk 를 클라우드에 백업 (vhk cloud push)',
    confidence: 'high',
    test: t =>
      (/(클라우드|gist)\s*(에)?\s*(백업|올려|올리)/.test(t) ||
        /(\.?vhk\s*)?백업\s*해|(\.?vhk\s*)?백업하/.test(t)) &&
      !/복원|내려|내리|복구/.test(t),
  },
  {
    command: 'start',
    explanation: '노션에서 가져와 새 프로젝트 시작 마법사 (vhk start --from-notion)',
    confidence: 'low',
    args: ['--from-notion'],
    test: t => /노션|notion/.test(t) && /(시작|만들|import|가져)/.test(t),
  },
  {
    command: 'start',
    explanation: '새 프로젝트 시작 마법사 — git+문서+MCP+컨텍스트 (vhk start)',
    confidence: 'high',
    test: t =>
      (/프로젝트.*(만들|시작)|폴더.*만들|만들고\s*싶|새\s*프로젝트|^시작$|마법사|기획.*(끝|완료)|검증.*(스킵|건너)|gate.*(스킵|건너)|바로.*시작/.test(t)) &&
      !/디자인|design|팔레트|palette|테마|theme|레퍼런스|reference|다크\s*모드|라이트\s*모드|색상\s*모드|브리핑|brief|컨텍스트|context|맥락|기억|memory|^초기화$|하네스.*만/.test(t),
  },
  // 도움말 — 초보자가 "뭐부터/도움말/명령어" 라고 물으면 읽기전용 quick actions 를 출력.
  // (적대 리뷰 HIGH 수정: 이전엔 start 마법사로 라우팅돼 도움말이 scaffold 를 유발했음.
  //  도움말은 절대 상태를 바꾸지 않는다.) 실제 서브커맨드는 cli-args R1 가드가 먼저 commander 로 보냄.
  {
    command: 'help',
    explanation: '자연어로 vhk 쓰는 법 — quick actions 출력(상태변경 없음)',
    confidence: 'high',
    test: t =>
      /도움말|사용법|help|^명령어$|뭐\s*(할\s*수\s*있|하면\s*(돼|되|좋)|해야)|처음\s*(뭐|어떻게|시작|할)|어떻게\s*시작|뭐부터/.test(t),
  },
  // Safety Mode — 위험 작업 가드 강도 조회/변경.
  {
    command: 'mode',
    explanation: 'Safety Mode 조회/변경 (vhk mode)',
    confidence: 'high',
    test: t =>
      /안전\s*모드|safety\s*mode|모드\s*(바꿔|변경|설정|확인|보여|뭐)|위험\s*작업\s*(가드|모드)/.test(t),
  },
  {
    command: 'verify',
    explanation: '저장/위험 작업 전 검증 묶음 (vhk verify)',
    confidence: 'high',
    // '검증 실행/돌려'·bare '검증해줘' 는 verify 의도 — gate(아이디어 검증)가 가로채지 않게 먼저 흡수.
    test: t =>
      /검증\s*(묶음|실행|돌려|돌리)|사전\s*검증|저장\s*전\s*(검증|확인)|^verify$|^검증\s*(해줘|해)?$/.test(t),
  },
  {
    command: 'review',
    explanation: '적대적 자기검증 — 증거로 거짓완료 의심 (vhk review)',
    confidence: 'high',
    test: t => /적대\s*검증|자기\s*검증|거짓\s*완료|완료\s*심문|^review$|^검토$/.test(t),
  },
  {
    command: 'mission',
    explanation: '미션 계약 — 작업 범위·금지선 선언/검증 (vhk mission)',
    confidence: 'high',
    test: t => /미션\s*계약|작업\s*범위|범위\s*검증|^mission$|^미션$/.test(t),
  },
  {
    command: 'init',
    explanation: '문서/하네스 파일만 생성 (vhk init) — git/MCP/context는 제외',
    confidence: 'high',
    test: t =>
      /^init$|^초기화$|하네스\s*만|문서\s*만\s*만들|init\s*만/.test(t),
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
  // memory 마이그레이션은 패키지매니저 migrate 보다 **먼저** 평가 — "기억/메모리 마이그레이트" 가
  // pnpm 전환(vhk migrate)으로 새지 않도록. 기억/메모리/memory 한정이라 bare "마이그레이트"는 안 가로챔.
  {
    command: 'memory',
    args: ['migrate'],
    explanation: 'memory.json v1 → v2 마이그레이션 (vhk memory migrate)',
    confidence: 'high',
    test: t => /(기억|메모리|memory)\s*(을|를)?\s*(마이그레이|migrat)/.test(t),
  },
  {
    command: 'migrate',
    explanation: '패키지 매니저 전환 (vhk migrate)',
    confidence: 'high',
    test: t =>
      /전환|마이그레이(트|션)|migrate|패키지\s*매니저|npm.*pnpm|pnpm.*npm|yarn.*전환|npm.*전환|pnpm.*전환/.test(t)
      // memory 마이그레이션 **의도**만 제외(인접 매칭) — "메모리 누수 때문에 pnpm 전환" 같은 정상 전환은 통과.
      && !/(기억|메모리|memory)\s*(을|를)?\s*(마이그레이|migrat)/.test(t),
  },
  {
    command: 'update',
    explanation: 'VHK CLI 최신 버전 업데이트 (vhk update)',
    confidence: 'high',
    // '업데이트' 단독 키워드가 컨텍스트/기억/규칙 갱신 표현을 가로채 무확인 자가업데이트가 되지 않게:
    // 자가업데이트 의도(vhk/cli/셀프 동반 또는 단독 발화)일 때만 매칭.
    test: t =>
      (/^업데이트$|^update$|셀프\s*업데이트|self.?update/.test(t) ||
        (/업데이트|update|최신\s*버전|버전\s*업/.test(t) && /vhk|cli|셀프/.test(t))) &&
      !/컨텍스트|맥락|기억|메모리|memory|규칙|목표|문서|readme/.test(t),
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
    // 보관(archive)/해결(resolve)/마이그레이션은 list 가 아니다 → **제외 토큰 한 곳**에서 오라우팅 차단.
    // archive/resolve 는 <번호> 인자가 필요해 NL 미지원 → 매칭 안 되면 notMatched 가 정직(잘못된 list 실행 금지).
    test: t =>
      (/^기억$|기억\s*(목록|보|확인|뭐)|memory.*list|결정사항\s*(목록|확인|보여)/.test(t))
      && !/(추가|add|삭제|remove|저장|기록해|보관|아카이브|archive|마이그레이|migrat|해결|복구)/.test(t),
  },
  {
    command: 'loop-brief',
    explanation: '루프 1틱 앵커 생성 (vhk loop-brief)',
    confidence: 'high',
    test: t => /루프\s*브리핑|loop.?brief|1틱\s*앵커|매\s*틱\s*앵커/.test(t),
  },
  {
    command: 'remind',
    explanation: '치명 규칙 재주입 (vhk remind)',
    confidence: 'high',
    test: t => /리마인드|remind|치명\s*규칙|규칙\s*재주입|규칙\s*리마인/.test(t),
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
      // '지금/어떻게' 과민 매칭이 동사형 의도(저장·배포·출시)를 가리지 않게 제외.
      !/보안|시크릿|규칙|점검|린트|환경|진단|doctor|secure|check|스캔|설치|저장|커밋|푸시|push|배포|출시|올려|deploy|publish/.test(t),
  },
  {
    command: 'save',
    explanation: 'Git에 저장 (vhk 저장)',
    confidence: 'high',
    test: t =>
      (matchesKeywords(t, 'save') || /깃허브|github/.test(t)) &&
      // '올려/커밋' 키워드가 deploy('vercel에 올려줘')·publish('버전 올려줘')·memory('기억 저장해줘')를 선점하지 않게 제외.
      !/정리|recap|되돌|취소|rollback|reset|리셋|롤백|원래대로|클라우드|cloud|gist|vercel|netlify|cloudflare|배포|디플로이|deploy|npm|출시|퍼블리시|publish|버전|기억|메모리|memory/.test(t),
  },
  {
    command: 'recap',
    explanation: '오늘 한 일 정리 (vhk 정리)',
    confidence: 'high',
    // '정리해/세션' 이 work handoff(인수인계·중단 정리)를 가리지 않게 제외 — handoff 규칙으로 낙하.
    // bare '세션' 단독 매칭 금지(CodeRabbit) — "세션 시작해줘" 류 비-recap 의도를 가로채지 않게 동반어 요구.
    test: t =>
      /오늘.*(정리|기록)|한\s*일|세션\s*(정리|기록|요약|회고|마무리)|회고|recap|정리해/.test(t) &&
      !/인수인계|핸드오프|handoff|넘기|넘겨|전달|중단/.test(t),
  },
  {
    command: 'gate',
    explanation: '아이디어 검증 (vhk 검증)',
    confidence: 'high',
    // bare '검증' 매칭 제거 — verify('검증 실행')·goal check('목표 검증')를 가로채던 광범위 키워드.
    test: t => /아이디어|^gate$|\bgate\b|go\/refine|pain\s*point/.test(t),
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
      // '올려줘' 가 publish('버전 올려줘'·'npm에 올려줘')를 가로채지 않게 제외.
      !/체크|준비|점검|출하|회고|빌드\s*전|버전|npm|출시|퍼블리시|publish|릴리즈|release/.test(t),
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
  {
    command: 'pattern',
    explanation: '패턴 후보 목록 (vhk pattern list) — 감지는 vhk pattern detect 직접 실행',
    confidence: 'high',
    test: t => matchesKeywords(t, 'pattern') || /^pattern$/.test(t),
  },
  {
    command: 'evolve',
    explanation: '진화 후보 목록 (vhk evolve list) — apply/undo는 직접 실행',
    confidence: 'high',
    test: t => matchesKeywords(t, 'evolve') || /^evolve$/.test(t),
  },
  // NLP 규칙은 한국어 표현만 매칭. 영문 `goal <sub>` 은 commander 가 직접 처리하도록
  // 가로채기 금지 — vhk goal list / next / check / done 그대로 동작.
  {
    command: 'goal',
    explanation: '다음 goal 자동 선택 (vhk goal next)',
    confidence: 'high',
    args: ['next'],
    test: t => /다음\s*목표|목표\s*다음/.test(t),
  },
  {
    command: 'goal',
    explanation: '목표 게이트 검증 (vhk goal check)',
    confidence: 'high',
    args: ['check'],
    // '스크립트' 포함 시는 sync 의도(게이트 스크립트 생성) → check 가 가로채지 않게 제외.
    test: t => /목표\s*(점검|검증|체크)/.test(t) && !/스크립트/.test(t),
  },
  {
    command: 'goal',
    explanation: '목표 완료 처리 (vhk goal done)',
    confidence: 'high',
    args: ['done'],
    test: t => /목표\s*(완료|마감)/.test(t),
  },
  {
    command: 'goal',
    explanation: '목표 목록 (vhk goal list)',
    confidence: 'high',
    args: ['list'],
    test: t => /목표\s*(목록|리스트)/.test(t),
  },
  {
    command: 'goal',
    explanation: '게이트 스크립트 동기화 (vhk goal sync)',
    confidence: 'high',
    args: ['sync'],
    test: t => /(게이트|목표).*(스크립트|동기화)|체크\s*스크립트\s*(생성|만들)/.test(t),
  },
  // work — handoff(인수인계)를 먼저 평가(더 구체적), 그다음 작업 시작/이어하기.
  {
    command: 'work',
    explanation: '작업 중단 정리 프롬프트 (vhk work handoff)',
    confidence: 'high',
    args: ['handoff'],
    test: t => /인수인계|핸드오프|handoff|(작업|세션)\s*(넘기|넘겨|전달|마무리)|중단\s*정리/.test(t),
  },
  {
    command: 'work',
    explanation: '작업 시작/이어하기 프롬프트 (vhk work)',
    confidence: 'high',
    test: t => matchesKeywords(t, 'work') || /작업\s*(시작|이어|이어서|계속)|이어서\s*(작업|하자|할래)|^work$/.test(t),
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
