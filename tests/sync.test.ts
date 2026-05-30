import { describe, it, expect } from 'vitest'
import {
  parseRulesMd,
  toCursorrules,
  toWindsurfrules,
  toCopilotInstructions,
  toAntigravityRules,
  truncateForAntigravity,
  ANTIGRAVITY_CHAR_LIMIT,
} from '../src/commands/sync.js'

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

describe('vhk sync — GitHub Copilot 변환', () => {
  it('Copilot 헤더 + 자동생성 경고(최상단) + 코딩 규칙 포함, 기록 섹션 제외', () => {
    const sections = parseRulesMd(SAMPLE_RULES)
    const out = toCopilotInstructions(sections, '데모 프로젝트')
    expect(out).toContain('# 데모 프로젝트 — GitHub Copilot Instructions')
    // 경고가 최상단(제목 다음 5줄 내)에 있는지
    expect(out.split('\n').slice(0, 5).join('\n')).toContain('자동 생성됨 (vhk sync). 직접 수정 금지')
    expect(out).toContain('execSync 금지')
    expect(out).not.toContain('docs/log/ 작성')
  })
})

describe('vhk sync — Antigravity 변환 + 12k 절삭', () => {
  it('짧은 규칙은 그대로, 헤더 단다', () => {
    const sections = parseRulesMd(SAMPLE_RULES)
    const out = toAntigravityRules(sections, '데모 프로젝트')
    expect(out).toContain('# 데모 프로젝트 — Antigravity Rules')
    expect(out).toContain('execSync 금지')
    expect(out).not.toContain('절삭됨') // 짧으니 절삭 안 됨
  })

  it('한도 이하 입력은 변경 없이 반환', () => {
    const small = '## A\n내용\n## B\n내용\n'
    expect(truncateForAntigravity(small)).toBe(small)
  })

  it('한도 초과 시 결과 길이가 항상 12000 미만 (마커 포함 보장)', () => {
    // 12k 훨씬 넘는 입력 — ## 섹션 다수
    const huge = Array.from({ length: 400 }, (_, i) => `## 섹션 ${i}\n${'가'.repeat(60)}`).join('\n')
    expect(huge.length).toBeGreaterThan(ANTIGRAVITY_CHAR_LIMIT)
    const out = truncateForAntigravity(huge)
    expect(out.length).toBeLessThanOrEqual(ANTIGRAVITY_CHAR_LIMIT)
    expect(out).toContain('절삭됨')
  })

  it('구조 경계(## 헤딩)에서 절삭 — 헤딩 중간이 아님', () => {
    const huge = Array.from({ length: 400 }, (_, i) => `## 섹션 ${i}\n${'x'.repeat(60)}`).join('\n')
    const out = truncateForAntigravity(huge)
    const body = out.replace(/\n\n<!--[\s\S]*$/, '') // 마커 제거
    // 마지막 비어있지 않은 줄이 헤딩이거나, 최소한 줄 중간에서 끊기지 않음
    const lines = body.split('\n')
    const last = lines[lines.length - 1]
    // 'x' 반복 줄은 통째로 들어가거나 아예 없어야 함 — 부분 'x' 줄로 끝나면 60자 미만
    if (last.startsWith('x')) {
      expect(last.length).toBe(60)
    }
  })
})
