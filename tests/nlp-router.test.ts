import { describe, it, expect } from 'vitest'
import { routeNaturalLanguage, NLP_KEYWORDS } from '../src/lib/nlp-router.js'

describe('자연어 라우팅', () => {
  it('NLP_KEYWORDS — save·undo·status·diff·doctor 키워드 맵', () => {
    expect(NLP_KEYWORDS.save).toContain('저장')
    expect(NLP_KEYWORDS.save).toContain('push')
    expect(NLP_KEYWORDS.undo).toContain('롤백')
    expect(NLP_KEYWORDS.status).toContain('현황')
    expect(NLP_KEYWORDS.diff).toContain('뭐바뀜')
    expect(NLP_KEYWORDS.doctor).toContain('drift')
    expect(NLP_KEYWORDS.doctor).toContain('설정불일치')
  })

  it.each(['설정 불일치 보여줘', 'drift 확인해줘', '규칙 불일치 전체 보여줘'])(
    '"%s" → doctor (일반 git diff 아님)',
    phrase => {
      expect(routeNaturalLanguage(phrase)?.command).toBe('doctor')
    },
  )

  it('"규칙 불일치 전체 보여줘" → doctor --diff 의미까지 전달', () => {
    expect(routeNaturalLanguage('규칙 불일치 전체 보여줘')?.args).toEqual(['--diff'])
  })

  it('설정 불일치 점검은 doctor, 기존 규칙 위반·린트 진단은 check로 보존', () => {
    expect(routeNaturalLanguage('설정 불일치 점검')?.command).toBe('doctor')
    expect(routeNaturalLanguage('환경 확인해줘')?.command).toBe('doctor')
    expect(routeNaturalLanguage('규칙 위반 진단해줘')?.command).toBe('check')
    expect(routeNaturalLanguage('린트 진단해줘')?.command).toBe('check')
  })

  describe('policy check 자연어 라우팅', () => {
    it.each([
      '이 명령 허용돼?',
      '명령 한도 확인해줘',
    ])('대상이 없는 한국어 "%s" → policy check 사용법', (phrase) => {
      const route = routeNaturalLanguage(phrase)
      expect(route?.command).toBe('policy')
      expect(route?.args).toEqual(['check'])
    })

    it.each([
      'is this command allowed?',
      'check the command limit',
    ])('대상이 없는 영문 "%s" → policy check 사용법', (phrase) => {
      const route = routeNaturalLanguage(phrase)
      expect(route?.command).toBe('policy')
      expect(route?.args).toEqual(['check'])
    })

    it.each([
      ['pnpm test:run 실행 가능해?', ['check', 'pnpm', 'test:run']],
      ['pnpm test:run --coverage 허용돼?', ['check', 'pnpm', 'test:run', '--coverage']],
      ['can PNPM Test:Run execute?', ['check', 'PNPM', 'Test:Run']],
      ['is pnpm test:run allowed?', ['check', 'pnpm', 'test:run']],
      ['pnpm secure:test 실행 가능해?', ['check', 'pnpm', 'secure:test']],
      ['pnpm scan 실행 가능해?', ['check', 'pnpm', 'scan']],
      ['can npm run secure execute?', ['check', 'npm', 'run', 'secure']],
    ])('구체 명령 "%s" → 원본 argv 보존', (phrase, expected) => {
      expect(routeNaturalLanguage(phrase)?.args).toEqual(expected)
    })

    it.each([
      'pnpm typecheck && npm publish 실행 가능해?',
      'pnpm "test:run --coverage" 실행 가능해?',
      'pnpm test:run 실행 가능해? 그리고 돌려줘',
    ])('복잡하거나 뒤 문장이 붙은 "%s" → 일부 argv를 낙관 판정하지 않음', (phrase) => {
      const route = routeNaturalLanguage(phrase)
      expect(route?.command).toBe('policy')
      expect(route?.args).toEqual(['check'])
    })

    it('일반 권한 정책 조회는 policy show 의미를 보존한다', () => {
      const route = routeNaturalLanguage('현재 권한 정책 보여줘')
      expect(route?.command).toBe('policy')
      expect(route?.args).toBeUndefined()
    })
  })

  it.each([
    '정책 기준선 고정해줘',
    'policy baseline refresh',
  ])('"%s" → policy baseline (승인 플래그는 자동 주입하지 않음)', (phrase) => {
    const route = routeNaturalLanguage(phrase)
    expect(route?.command).toBe('policy')
    expect(route?.args).toEqual(['baseline'])
    expect(route?.args).not.toContain('--confirm')
  })

  it('"프로젝트 만들고 싶어" → start (마법사)', () => {
    const result = routeNaturalLanguage('프로젝트 만들고 싶어')
    expect(result?.command).toBe('start')
  })

  // Goal 86 (RFC 0056 T1): vhk receipt — 자연어 라우팅(증거영수증/영수증).
  describe('receipt 라우팅 — 증거 영수증 (Goal 86)', () => {
    for (const phrase of ['증거 영수증', '영수증 만들어줘', 'receipt', '거짓완료 영수증']) {
      it(`"${phrase}" → receipt`, () => {
        expect(routeNaturalLanguage(phrase)?.command).toBe('receipt')
      })
    }
    it('"적대 검증" 은 여전히 review (receipt 가 가로채지 않음)', () => {
      expect(routeNaturalLanguage('적대 검증')?.command).toBe('review')
    })
  })

  it('"기획 끝났고 바로 시작" → start (마법사 한 방에 git+문서+MCP+context)', () => {
    const result = routeNaturalLanguage('기획 끝났고 바로 시작')
    expect(result?.command).toBe('start')
  })

  describe('도움말 라우팅 — 읽기전용(스캐폴딩 금지) (배치3 §1 + 적대리뷰 HIGH 수정)', () => {
    for (const phrase of ['도움말', '사용법', '명령어', '뭐 할 수 있어', '처음 뭐 해', 'help']) {
      it(`"${phrase}" → help (start/scaffold 아님)`, () => {
        const cmd = routeNaturalLanguage(phrase)?.command
        expect(cmd).toBe('help')
        // 회귀 가드: 도움말 요청이 절대 스캐폴딩(start)로 새지 않는다.
        expect(cmd).not.toBe('start')
      })
    }
  })

  describe('오라우팅 회귀 가드 (2026-06-11 전수 리뷰 F2-01~05·08, 실측 13케이스)', () => {
    it('"컨텍스트 업데이트해줘" → context (자가업데이트로 새지 않음)', () => {
      expect(routeNaturalLanguage('컨텍스트 업데이트해줘')?.command).toBe('context')
    })
    it('"메모리 업데이트해줘" → null (무확인 npm update -g 차단)', () => {
      expect(routeNaturalLanguage('메모리 업데이트해줘')).toBeNull()
    })
    it('"vhk 업데이트 해줘" → update (자가업데이트 의도는 유지)', () => {
      expect(routeNaturalLanguage('vhk 업데이트 해줘')?.command).toBe('update')
    })
    it('"vercel에 올려줘" → deploy (git 커밋 아님)', () => {
      expect(routeNaturalLanguage('vercel에 올려줘')?.command).toBe('deploy')
    })
    it('"버전 올려줘" → publish (git 커밋 아님)', () => {
      expect(routeNaturalLanguage('버전 올려줘')?.command).toBe('publish')
    })
    it('"기억 저장해줘" → null (git save 누수 차단 — memory add는 직접 실행)', () => {
      expect(routeNaturalLanguage('기억 저장해줘')).toBeNull()
    })
    it('"지금 저장해줘" → save (status 과민 매칭 제거)', () => {
      expect(routeNaturalLanguage('지금 저장해줘')?.command).toBe('save')
    })
    it('"검증 실행해줘" → verify (아이디어 검증 마법사 아님)', () => {
      expect(routeNaturalLanguage('검증 실행해줘')?.command).toBe('verify')
    })
    it('"목표 검증해줘" → goal check (gate가 가로채지 않음)', () => {
      const r = routeNaturalLanguage('목표 검증해줘')
      expect(r?.command).toBe('goal')
      expect(r?.args).toEqual(['check'])
    })
    it('"아이디어 검증해줘" → gate (본래 의도는 유지)', () => {
      expect(routeNaturalLanguage('아이디어 검증해줘')?.command).toBe('gate')
    })
    it('"중단 정리해줘" → work handoff (recap이 가로채지 않음)', () => {
      const r = routeNaturalLanguage('중단 정리해줘')
      expect(r?.command).toBe('work')
      expect(r?.args).toEqual(['handoff'])
    })
    it('"세션 넘겨줘" → work handoff', () => {
      const r = routeNaturalLanguage('세션 넘겨줘')
      expect(r?.command).toBe('work')
      expect(r?.args).toEqual(['handoff'])
    })
    it('"세션 시작해줘" → recap 아님 (bare 세션 과민 매칭 제거 — CodeRabbit)', () => {
      expect(routeNaturalLanguage('세션 시작해줘')?.command).not.toBe('recap')
    })
    it('"세션 정리해줘" → recap (동반어 의도는 유지)', () => {
      expect(routeNaturalLanguage('세션 정리해줘')?.command).toBe('recap')
    })
    it('"루프 브리핑 만들어줘" → loop-brief (brief 로 누수 안 됨 — goal67 카드 명시 리스크)', () => {
      expect(routeNaturalLanguage('루프 브리핑 만들어줘')?.command).toBe('loop-brief')
    })
    it('"브리핑 보여줘" → brief (loop-brief 가 가로채지 않음)', () => {
      expect(routeNaturalLanguage('브리핑 보여줘')?.command).toBe('brief')
    })
    it('"규칙 재주입해줘" → remind (sync 로 누수 안 됨 — goal68 순서의존 회귀 가드)', () => {
      expect(routeNaturalLanguage('규칙 재주입해줘')?.command).toBe('remind')
    })
    it('"치명 규칙 리마인드" → remind', () => {
      expect(routeNaturalLanguage('치명 규칙 리마인드')?.command).toBe('remind')
    })
    it('"규칙 동기화해줘" → sync (remind 가 가로채지 않음)', () => {
      expect(routeNaturalLanguage('규칙 동기화해줘')?.command).toBe('sync')
    })
  })

  it('"오늘 한 일 정리" → recap', () => {
    const result = routeNaturalLanguage('오늘 한 일 정리')
    expect(result?.command).toBe('recap')
  })

  it('"보안 스캔 돌려" → secure', () => {
    const result = routeNaturalLanguage('보안 스캔 돌려')
    expect(result?.command).toBe('secure')
  })

  it('"보안 스캔해줘"는 명령 허용 질문이 아니라 secure다', () => {
    expect(routeNaturalLanguage('보안 스캔해줘')?.command).toBe('secure')
  })

  it('"배포하고 싶어" → deploy', () => {
    const result = routeNaturalLanguage('배포하고 싶어')
    expect(result?.command).toBe('deploy')
  })

  it('키워드 맵 — save', () => {
    expect(routeNaturalLanguage('세이브해줘')?.command).toBe('save')
    expect(routeNaturalLanguage('푸시 올려')?.command).toBe('save')
  })

  it('키워드 맵 — undo', () => {
    expect(routeNaturalLanguage('롤백해줘')?.command).toBe('undo')
    expect(routeNaturalLanguage('원래대로 돌려')?.command).toBe('undo')
  })

  it('키워드 맵 — status', () => {
    expect(routeNaturalLanguage('지금 어때')?.command).toBe('status')
    expect(routeNaturalLanguage('프로젝트 현황')?.command).toBe('status')
  })

  it('"보안 확인" → secure (status 오라우팅 방지)', () => {
    expect(routeNaturalLanguage('보안 확인')?.command).toBe('secure')
  })

  it('키워드 맵 — diff', () => {
    expect(routeNaturalLanguage('뭐바뀜')?.command).toBe('diff')
    expect(routeNaturalLanguage('수정된 파일')?.command).toBe('diff')
  })

  it('"커밋 취소" → undo (save보다 우선)', () => {
    expect(routeNaturalLanguage('커밋 취소')?.command).toBe('undo')
  })

  it('"asdfqwer" → null (미매칭)', () => {
    const result = routeNaturalLanguage('asdfqwer')
    expect(result).toBeNull()
  })

  it('"디자인 토큰 만들어줘" → design', () => {
    expect(routeNaturalLanguage('디자인 토큰 만들어줘')?.command).toBe('design')
  })

  it('"팔레트 골라줘" → design-palette', () => {
    expect(routeNaturalLanguage('팔레트 골라줘')?.command).toBe('design-palette')
  })

  it('"다크 모드 적용" → theme', () => {
    expect(routeNaturalLanguage('다크 모드 적용')?.command).toBe('theme')
  })

  it('"레퍼런스 보여줘" → ref', () => {
    expect(routeNaturalLanguage('레퍼런스 보여줘')?.command).toBe('ref')
  })

  it('"ref add https://x.com" → null (commander 서브커맨드 보호)', () => {
    expect(routeNaturalLanguage('ref add https://x.com')).toBeNull()
  })

  it('"레퍼런스 추가해줘" → null (NL에서 의도적으로 배제)', () => {
    expect(routeNaturalLanguage('레퍼런스 추가해줘')).toBeNull()
  })

  it('"팔레트 만들고 싶어" → design-palette (init 룰의 \'만들고 싶\' 가로채기 방지)', () => {
    expect(routeNaturalLanguage('팔레트 만들고 싶어')?.command).toBe('design-palette')
  })

  it('"디자인 시스템 만들고 싶어" → design (init 가로채기 방지)', () => {
    expect(routeNaturalLanguage('디자인 시스템 만들고 싶어')?.command).toBe('design')
  })

  it('"테마 만들고 싶어" → theme (init 가로채기 방지)', () => {
    expect(routeNaturalLanguage('테마 만들고 싶어')?.command).toBe('theme')
  })

  it('"다크 모드 보안 검사" → secure (theme 가드: 보안 키워드 우선)', () => {
    expect(routeNaturalLanguage('다크 모드 보안 검사')?.command).toBe('secure')
  })

  it('"디자인 시스템 배포" → null (design 가드 + 모호 발화 → 메뉴 안내)', () => {
    // design 가드로 design 차단, deploy 룰은 `^배포$` 단독만 인정 → 안전한 null
    expect(routeNaturalLanguage('디자인 시스템 배포')).toBeNull()
  })

  it('"테마 시크릿 확인" → secure (theme 가드)', () => {
    expect(routeNaturalLanguage('테마 시크릿 확인')?.command).toBe('secure')
  })

  it('"디자인 토큰 npm 출시" → publish (design 가드)', () => {
    expect(routeNaturalLanguage('디자인 토큰 npm 출시')?.command).toBe('publish')
  })

  it('"품질 점검해줘" → harness', () => {
    expect(routeNaturalLanguage('품질 점검해줘')?.command).toBe('harness')
  })

  it('"통합 점검 돌려" → harness', () => {
    expect(routeNaturalLanguage('통합 점검 돌려')?.command).toBe('harness')
  })

  it('"규칙 점검" → check (harness 아님)', () => {
    expect(routeNaturalLanguage('규칙 점검')?.command).toBe('check')
  })

  it('"보안 감사 해줘" → audit', () => {
    expect(routeNaturalLanguage('보안 감사 해줘')?.command).toBe('audit')
  })

  it('"취약점 확인" → audit', () => {
    expect(routeNaturalLanguage('취약점 확인')?.command).toBe('audit')
  })

  it('"패키지 매니저 전환" → migrate', () => {
    expect(routeNaturalLanguage('패키지 매니저 전환')?.command).toBe('migrate')
  })

  it('"vhk 업데이트 해줘" → update', () => {
    expect(routeNaturalLanguage('vhk 업데이트 해줘')?.command).toBe('update')
  })

  it('"맥락 만들어줘" → context', () => {
    expect(routeNaturalLanguage('맥락 만들어줘')?.command).toBe('context')
  })

  it('"컨텍스트 보여줘" → context-show', () => {
    expect(routeNaturalLanguage('컨텍스트 보여줘')?.command).toBe('context-show')
  })

  it('"맥락 보여줘" → context-show (context 아님)', () => {
    expect(routeNaturalLanguage('맥락 보여줘')?.command).toBe('context-show')
  })

  it('"기억 목록" → memory', () => {
    expect(routeNaturalLanguage('기억 목록')?.command).toBe('memory')
  })

  it('"기억 마이그레이트" → memory (args migrate), 패키지매니저 migrate 로 안 샘', () => {
    const r = routeNaturalLanguage('기억 마이그레이트')
    expect(r?.command).toBe('memory')
    expect(r?.args).toEqual(['migrate'])
  })

  it('"메모리 마이그레이션" → memory (args migrate)', () => {
    const r = routeNaturalLanguage('메모리 마이그레이션')
    expect(r?.command).toBe('memory')
    expect(r?.args).toEqual(['migrate'])
  })

  it('"패키지 매니저 마이그레이트" → migrate (memory 아님)', () => {
    expect(routeNaturalLanguage('패키지 매니저 마이그레이트')?.command).toBe('migrate')
  })

  it('"메모리 누수 때문에 pnpm 으로 전환" → migrate (memory 단어가 있어도 pkg 전환 통과)', () => {
    expect(routeNaturalLanguage('메모리 누수 때문에 pnpm 으로 전환')?.command).toBe('migrate')
  })

  it('"기억 보관" → 잘못된 memory list 라우팅 안 함 (archive 는 번호 필요 → NL 미지원)', () => {
    const r = routeNaturalLanguage('기억 보관')
    const isMemoryList = r?.command === 'memory' && (!r.args || r.args.length === 0)
    expect(isMemoryList).toBe(false)
  })

  it('"기억 추가해줘" → null (NL 배제)', () => {
    expect(routeNaturalLanguage('기억 추가해줘')).toBeNull()
  })

  it('"프로젝트 브리핑 만들어줘" → brief', () => {
    expect(routeNaturalLanguage('프로젝트 브리핑 만들어줘')?.command).toBe('brief')
  })

  it('"상태 요약 보여줘" → brief', () => {
    expect(routeNaturalLanguage('상태 요약 보여줘')?.command).toBe('brief')
  })

  it('"오늘 한 일 정리" → recap (brief 아님)', () => {
    expect(routeNaturalLanguage('오늘 한 일 정리')?.command).toBe('recap')
  })

  // 클라우드 — 한국어 표현만 NLP, 영문 서브커맨드는 commander 가 처리(가로채기 금지)
  it('"클라우드에 백업해줘" → cloud-push', () => {
    expect(routeNaturalLanguage('클라우드에 백업해줘')?.command).toBe('cloud-push')
  })

  it('"백업해줘" → cloud-push', () => {
    expect(routeNaturalLanguage('백업해줘')?.command).toBe('cloud-push')
  })

  it('"클라우드에서 복원해줘" → cloud-pull', () => {
    expect(routeNaturalLanguage('클라우드에서 복원해줘')?.command).toBe('cloud-pull')
  })

  it('"cloud push" → null (commander 직접 처리, save 로 새지 않음)', () => {
    expect(routeNaturalLanguage('cloud push')).toBeNull()
  })

  it('"cloud pull 8fa29db959b3" → null (gistId 인자 보존 위해 commander)', () => {
    expect(routeNaturalLanguage('cloud pull 8fa29db959b3')).toBeNull()
  })

  // restore(로컬 sync 백업) — "백업" + 복원동사. cloud-pull/undo 보다 우선.
  it('"백업 복원해줘" → restore (cloud-pull 로 안 샘)', () => {
    expect(routeNaturalLanguage('백업 복원해줘')?.command).toBe('restore')
  })
  it('"백업 되돌려" → restore (undo 로 안 샘)', () => {
    expect(routeNaturalLanguage('백업 되돌려')?.command).toBe('restore')
  })
  it('"sync 백업 복구" → restore', () => {
    expect(routeNaturalLanguage('sync 백업 복구')?.command).toBe('restore')
  })
  // 회귀 가드 — "백업" 없는 표현은 종전대로
  it('"백업해줘" 는 여전히 cloud-push (복원동사 없음)', () => {
    expect(routeNaturalLanguage('백업해줘')?.command).toBe('cloud-push')
  })
  it('"롤백해줘" 는 여전히 undo (백업 없음)', () => {
    expect(routeNaturalLanguage('롤백해줘')?.command).toBe('undo')
  })
})
