import { describe, it, expect } from 'vitest'
import {
  parseRulesMd,
  toCursorrules,
  toWindsurfrules,
  toCopilotInstructions,
  toAntigravityRules,
  toAgentsMd,
  truncateForAntigravity,
  ANTIGRAVITY_CHAR_LIMIT,
  SYNC_TARGETS,
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

describe('vhk sync — AGENTS.md 생성 (배치3 6번째 타겟)', () => {
  it('toAgentsMd — Loop Protocol + 자동생성 경고 + 코딩 규칙 + compact 포인터 포함', () => {
    const sections = parseRulesMd(SAMPLE_RULES)
    const out = toAgentsMd(sections, '데모 프로젝트')
    expect(out).toContain('# 데모 프로젝트 — AGENTS')
    expect(out).toContain('Loop Protocol')
    expect(out).toContain('자동 생성됨 (vhk sync). 직접 수정 금지')
    expect(out).toContain('execSync 금지') // 코딩 규칙 섹션 본문
    // compact 안내는 AGENTS.md 에 하드코딩이 아니라 생성기(toAgentsMd)를 거쳐 들어간다.
    expect(out).toContain('agent-compact.md')
  })

  it('SYNC_TARGETS 레지스트리에 AGENTS.md 가 등록됨 (drift/backup 자동 반영)', () => {
    expect(SYNC_TARGETS.map((t) => t.path)).toContain('AGENTS.md')
  })

  it('toAgentsMd 결과가 parseRulesMd 로 다시 파싱 가능 (## 구조 유지)', () => {
    const sections = parseRulesMd(SAMPLE_RULES)
    const out = toAgentsMd(sections, 'P')
    const titles = parseRulesMd(out).map((s) => s.title)
    expect(titles).toContain('Loop Protocol')
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

  it('한도 초과 시 결과가 항상 12000 바이트·자 이하 (영어)', () => {
    const huge = Array.from({ length: 400 }, (_, i) => `## 섹션 ${i}\n${'x'.repeat(60)}`).join('\n')
    const out = truncateForAntigravity(huge)
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(ANTIGRAVITY_CHAR_LIMIT)
    expect(out.length).toBeLessThanOrEqual(ANTIGRAVITY_CHAR_LIMIT)
    expect(out).toContain('절삭됨')
  })

  it('한글(3바이트/자) 입력도 byte 기준 12000 이하 보장 (byte/char 양쪽 안전)', () => {
    // 한글 11000자 = ~33000바이트 → char 기준이면 통과하지만 byte 기준이면 절삭돼야
    const huge = Array.from({ length: 300 }, (_, i) => `## 섹션 ${i}\n${'가'.repeat(60)}`).join('\n')
    const out = truncateForAntigravity(huge)
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(ANTIGRAVITY_CHAR_LIMIT)
    expect(out).toContain('절삭됨')
  })

  it('구조 경계(## 헤딩)에서 절삭 — 줄 중간에서 끊기지 않음', () => {
    const huge = Array.from({ length: 400 }, (_, i) => `## 섹션 ${i}\n${'x'.repeat(60)}`).join('\n')
    const out = truncateForAntigravity(huge)
    const body = out.replace(/\n\n<!--[\s\S]*$/, '') // 마커 제거
    // 본문의 모든 'x' 줄은 완전한 60자여야 함 — 부분 절삭이면 60자 미만 줄 발생
    const xLines = body.split('\n').filter(l => l.startsWith('x'))
    for (const l of xLines) expect(l.length).toBe(60)
    // 본문 마지막 줄은 헤딩이거나 완전한 x줄 — 빈 부분 토큰 아님
    const lastLine = body.split('\n').filter(Boolean).pop() ?? ''
    expect(lastLine.startsWith('## ') || lastLine === 'x'.repeat(60)).toBe(true)
  })
})
