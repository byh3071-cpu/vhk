import { describe, it, expect } from 'vitest'
import { program } from '../src/index.js'
import {
  detectNaturalLanguageInput,
  detectInvalidCommandUsage,
  KNOWN_COMMAND_TOKENS,
} from '../src/lib/cli-args.js'
import { routeNaturalLanguage } from '../src/lib/nlp-router.js'

// 세 이슈(#314·#344·#345) 공통 = 레지스트리/라우터 드리프트.
// raw commander 에러("too many arguments")·cross-misroute(엉뚱한 명령 조용히 실행)를 0으로.

describe('#345 유령 KNOWN 토큰 제거 — KNOWN ⊆ 실제 commander 명령/별칭', () => {
  // KNOWN_COMMAND_TOKENS 에 든 단어가 실제 최상위 명령/별칭이 아니면(유령 토큰),
  // 단일토큰일 때 detectNaturalLanguageInput 이 null 을 반환 → commander 가 raw 에러를 낸다.
  // (미지 단어보다 나쁜 역설). 모든 KNOWN 토큰은 실제 등록된 명령/별칭이어야 한다.
  it('모든 KNOWN_COMMAND_TOKENS 가 실제 commander 명령/별칭이다 (유령 토큰 0)', () => {
    const real = new Set<string>()
    for (const c of program.commands) {
      real.add(c.name())
      for (const a of c.aliases()) real.add(a)
    }
    const phantom = [...KNOWN_COMMAND_TOKENS].filter((t) => !real.has(t))
    expect(phantom, `유령 KNOWN 토큰(미등록 명령): ${phantom.join(', ')}`).toEqual([])
  })

  it('현황(미등록 단일토큰) → 자연어로 흘러 status 로 친절 라우팅', () => {
    const input = detectNaturalLanguageInput(['node', 'vhk', '현황'])
    expect(input).toBe('현황')
    expect(routeNaturalLanguage(input!)?.command).toBe('status')
  })

  it('help(정식 명령) → 자연어 라우터가 아닌 commander가 처리', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', 'help'])).toBeNull()
  })

  it('스캔/scan(미등록 단일토큰) → 자연어로 흘러 친절 폴백(미지 단어와 동급, raw 에러 아님)', () => {
    // 스캔/scan 은 secure 의 서브-별칭일 뿐 최상위 아님 → KNOWN 에서 빠져 NL 로 흐른다.
    // NL 라우터가 잡으면 라우팅, 못 잡으면 친절 ❓ 폴백 — 어느 쪽이든 raw commander 에러는 아니다.
    expect(detectNaturalLanguageInput(['node', 'vhk', '스캔'])).toBe('스캔')
    expect(detectNaturalLanguageInput(['node', 'vhk', 'scan'])).toBe('scan')
  })
})

describe('#344 유령 서브커맨드 제거 — env check·design palette 가 친절 처리', () => {
  // env·design 은 서브커맨드 없는 leaf 인데 registry 가 env:[check]·design:[palette] 를
  // 거짓 선언 → R1 가드가 "실제 경로"로 오판 → commander 가 raw 'too many arguments'.
  it('CONTAINER_SUBCOMMANDS 의 모든 컨테이너가 실제 commander 서브커맨드를 가진다 (유령 서브 0)', async () => {
    const { CONTAINER_SUBCOMMANDS } = await import('../src/lib/command-registry.js')
    for (const name of Object.keys(CONTAINER_SUBCOMMANDS)) {
      const cmd = program.commands.find((c) => c.name() === name)
      // 위치 인자형(mode/cost) 은 서브커맨드가 아니라 positional → 별도 허용
      if (!cmd) continue
      const positionalArity = cmd.registeredArguments.length
      const hasSubs = cmd.commands.length > 0
      expect(
        hasSubs || positionalArity > 0,
        `'${name}' 는 서브커맨드도 positional 인자도 없는 leaf 인데 registry 가 서브커맨드를 선언함 → 유령 서브`
      ).toBe(true)
    }
  })

  it('env check → leaf+추가인자: 친절 안내(env-check 유도), null 아님', () => {
    const msg = detectInvalidCommandUsage(['node', 'vhk', 'env', 'check'])
    expect(msg).not.toBeNull()
    expect(msg).toMatch(/env-check/)
  })

  it('design palette → leaf+추가인자: 친절 안내(design-palette 유도), null 아님', () => {
    const msg = detectInvalidCommandUsage(['node', 'vhk', 'design', 'palette'])
    expect(msg).not.toBeNull()
    expect(msg).toMatch(/design-palette/)
  })

  it('한글 별칭: 환경변수 check / 디자인 palette 도 동일 친절 안내', () => {
    expect(detectInvalidCommandUsage(['node', 'vhk', '환경변수', 'check'])).toMatch(/env-check/)
    expect(detectInvalidCommandUsage(['node', 'vhk', '디자인', 'palette'])).toMatch(/design-palette/)
  })

  it('회귀: 정답 형태 env-check / design-palette 는 친절안내 대상 아님(null)', () => {
    expect(detectInvalidCommandUsage(['node', 'vhk', 'env-check'])).toBeNull()
    expect(detectInvalidCommandUsage(['node', 'vhk', 'design-palette'])).toBeNull()
  })

  it('회귀: env / design 단독은 친절안내 대상 아님(null — leaf 정상 실행)', () => {
    expect(detectInvalidCommandUsage(['node', 'vhk', 'env'])).toBeNull()
    expect(detectInvalidCommandUsage(['node', 'vhk', 'design'])).toBeNull()
  })
})

describe('#314 컨테이너 무효 서브 + 트리거 단어 → cross-misroute 차단', () => {
  // memory/goal 컨테이너에 유효 서브가 아닌 첫 토큰('왜 안 되나' 등)을 주면
  // NL 라우터가 문장 전체를 가로채 doctor/help/status 로 조용히 오라우팅(exit 0).
  // → 컨테이너 자기 명령으로의 라우팅만 허용, 다른 명령으로의 cross-misroute 는 차단.
  it('memory "왜 안 되나" → NL 가로채기 차단 (doctor 로 오라우팅 안 됨)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', 'memory', '왜', '안', '되나'])).toBeNull()
  })

  it('goal "뭐 해야 하나" → NL 가로채기 차단 (help 로 오라우팅 안 됨)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', 'goal', '뭐', '해야', '하나'])).toBeNull()
  })

  it('goal "어떻게 진행" → NL 가로채기 차단 (status 로 오라우팅 안 됨)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', 'goal', '어떻게', '진행'])).toBeNull()
  })

  it('컨테이너 무효 서브는 친절한 invalid-subcommand 안내를 받는다', () => {
    const msg = detectInvalidCommandUsage(['node', 'vhk', 'memory', '왜', '안', '되나'])
    expect(msg).not.toBeNull()
    // 유효 서브커맨드 목록을 안내해야 함
    expect(msg).toMatch(/list/)
  })

  it('#613 무효 서브 + 옵션도 unknown option 이 아니라 같은 친절 안내', () => {
    const msg = detectInvalidCommandUsage(['node', 'vhk', 'memory', '없는서브', '--type', 'decision'])
    expect(msg).not.toBeNull()
    expect(msg).toMatch(/서브커맨드가 아니에요/)
    expect(msg).toMatch(/add/)
  })

  it('#613 회귀: 유효 서브 + 옵션은 친절안내 대상 아님(commander 파싱)', () => {
    expect(detectInvalidCommandUsage(['node', 'vhk', 'memory', 'add', '내용', '--type', 'decision'])).toBeNull()
    expect(detectInvalidCommandUsage(['node', 'vhk', '기억', '추가', '내용', '--type', 'decision'])).toBeNull()
  })

  it('회귀: 보안 확인 → 여전히 자연어 (secure 자기 명령으로의 라우팅은 허용)', () => {
    // 보안(secure) 컨테이너 + 확인 → NL 이 secure(=같은 명령)로 라우팅 → 가로채기 허용 유지.
    expect(detectNaturalLanguageInput(['node', 'vhk', '보안', '확인'])).toBe('보안 확인')
  })

  it('회귀: 기억 보여줘 → 여전히 자연어 (memory 자기 명령으로의 라우팅 허용)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', '기억', '보여줘'])).toBe('기억 보여줘')
  })

  it('회귀: 목표 점검 → 여전히 자연어 (goal 자기 명령으로 라우팅)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', '목표', '점검'])).toBe('목표 점검')
  })

  it('회귀: 실제 서브커맨드 경로(memory list / goal check)는 commander 로 (null)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', 'memory', 'list'])).toBeNull()
    expect(detectNaturalLanguageInput(['node', 'vhk', 'goal', 'check'])).toBeNull()
  })
})
