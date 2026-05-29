import { describe, it, expect } from 'vitest'
import { parseRulesMd, toCursorrules, toWindsurfrules } from '../src/commands/sync.js'

const SAMPLE_RULES = `# 데모 프로젝트 — Rules

## 코딩 규칙
- execSync 금지 → safeExecFile 사용
- 파일명은 kebab-case

## 기록 규칙
- 세션 종료 시 docs/log/ 작성
`

describe('vhk sync — RULES.md 파싱', () => {
  it('## 헤더 기준으로 섹션을 나눈다', () => {
    const sections = parseRulesMd(SAMPLE_RULES)
    const titles = sections.map(s => s.title)
    expect(titles).toContain('코딩 규칙')
    expect(titles).toContain('기록 규칙')
  })
})

describe('vhk sync — .cursorrules 변환', () => {
  it('코딩 규칙 섹션과 자동생성 경고를 포함한다', () => {
    const sections = parseRulesMd(SAMPLE_RULES)
    const out = toCursorrules(sections, '데모 프로젝트')
    expect(out).toContain('# 데모 프로젝트 — Cursor Rules')
    expect(out).toContain('자동 생성됨 (vhk sync). 직접 수정 금지')
    expect(out).toContain('execSync 금지')
  })
})

describe('vhk sync — .windsurfrules 변환', () => {
  it('Windsurf 헤더를 단다', () => {
    const sections = parseRulesMd(SAMPLE_RULES)
    const out = toWindsurfrules(sections, '데모 프로젝트')
    expect(out).toContain('# 데모 프로젝트 — Windsurf Rules')
  })

  it('자동생성 경고 주석을 맨 위에 포함한다', () => {
    const sections = parseRulesMd(SAMPLE_RULES)
    const out = toWindsurfrules(sections, '데모 프로젝트')
    expect(out).toContain('자동 생성됨 (vhk sync). 직접 수정 금지')
  })

  it('코딩 규칙 섹션을 담고, 기록 전용 섹션은 제외한다', () => {
    const sections = parseRulesMd(SAMPLE_RULES)
    const out = toWindsurfrules(sections, '데모 프로젝트')
    expect(out).toContain('execSync 금지')
    expect(out).not.toContain('docs/log/ 작성')
  })

  it('.cursorrules와 동일한 코딩 섹션을 미러링한다', () => {
    const sections = parseRulesMd(SAMPLE_RULES)
    const cursor = toCursorrules(sections, 'P')
    const windsurf = toWindsurfrules(sections, 'P')
    // 헤더만 다르고 규칙 본문은 양쪽 모두 동일하게 들어간다
    expect(cursor).toContain('파일명은 kebab-case')
    expect(windsurf).toContain('파일명은 kebab-case')
  })
})
