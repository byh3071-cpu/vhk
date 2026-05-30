import { describe, it, expect } from 'vitest'
import { routeNaturalLanguage, NLP_KEYWORDS } from '../src/lib/nlp-router.js'

describe('자연어 라우팅', () => {
  it('NLP_KEYWORDS — save·undo·status·diff 키워드 맵', () => {
    expect(NLP_KEYWORDS.save).toContain('저장')
    expect(NLP_KEYWORDS.save).toContain('push')
    expect(NLP_KEYWORDS.undo).toContain('롤백')
    expect(NLP_KEYWORDS.status).toContain('현황')
    expect(NLP_KEYWORDS.diff).toContain('뭐바뀜')
  })

  it('"프로젝트 만들고 싶어" → start (마법사)', () => {
    const result = routeNaturalLanguage('프로젝트 만들고 싶어')
    expect(result?.command).toBe('start')
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

  it('"오늘 한 일 정리" → recap', () => {
    const result = routeNaturalLanguage('오늘 한 일 정리')
    expect(result?.command).toBe('recap')
  })

  it('"보안 스캔 돌려" → secure', () => {
    const result = routeNaturalLanguage('보안 스캔 돌려')
    expect(result?.command).toBe('secure')
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
