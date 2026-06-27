import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  parseRulesMd,
  toCursorrules,
  toWindsurfrules,
  toCopilotInstructions,
  toGeminiMd,
  toClineRules,
  toAntigravityRules,
  toAgentsMd,
  agentsMdEcosystemBlock,
  truncateForAntigravity,
  ANTIGRAVITY_CHAR_LIMIT,
  SYNC_TARGETS,
  findUnmappedSections,
  syncCore,
} from '../src/commands/sync.js'
import { generateFiles } from '../src/commands/init.js'

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

describe('vhk sync — ③ 미매칭 섹션 silent drop 방지 (회귀)', () => {
  it('어느 타깃 키에도 안 맞는 섹션(프로젝트 정체성)을 잡는다 — 조용히 누락하면 FAIL', () => {
    const sections = parseRulesMd('# P — Rules\n\n## 프로젝트 정체성\n- 한 줄: x\n\n## 코딩 규칙\n- a\n')
    expect(findUnmappedSections(sections)).toContain('프로젝트 정체성')
  })

  it('매핑되는 섹션만 있으면 unmapped 0개', () => {
    const sections = parseRulesMd('## 코딩 규칙\n- a\n\n## 기록 규칙\n- b\n')
    expect(findUnmappedSections(sections)).toEqual([])
  })

  it('⑥ 서문(preamble)은 미매칭 경고에서 제외 — adopt RULES.md 매 sync 노이즈 0', () => {
    const sections = parseRulesMd('## 서문\n인트로 메모\n\n## 코딩 규칙\n- a\n')
    expect(findUnmappedSections(sections)).toEqual([])
  })
})

describe('vhk sync — AGENTS.md 생성 (배치3 6번째 타겟)', () => {
  it('toAgentsMd — Loop Protocol + Ecosystem block + 자동생성 경고 + 코딩 규칙 + compact 포인터 포함', () => {
    const sections = parseRulesMd(SAMPLE_RULES)
    const out = toAgentsMd(sections, '데모 프로젝트')
    expect(out).toContain('# 데모 프로젝트 — AGENTS')
    expect(out).toContain('Loop Protocol')
    expect(out).toContain('## Ecosystem (cross-repo)')
    expect(out).toContain('ecosystem-contract.yaml')
    expect(out).toContain('inheritance-registry.yaml')
    expect(out.indexOf('Loop Protocol')).toBeLessThan(out.indexOf('Ecosystem (cross-repo)'))
    expect(out).toContain('자동 생성됨 (vhk sync). 직접 수정 금지')
    expect(out).toContain('execSync 금지') // 코딩 규칙 섹션 본문
    // compact 안내는 AGENTS.md 에 하드코딩이 아니라 생성기(toAgentsMd)를 거쳐 들어간다.
    expect(out).toContain('agent-compact.md')
  })

  it('agentsMdEcosystemBlock — contract SoT + tier + 금지 3줄', () => {
    const block = agentsMdEcosystemBlock().join('\n')
    expect(block).toContain('status=active')
    expect(block).toContain('inject-bootstrap')
    expect(block).toContain('vhk sync')
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

  it('#131: 양쪽 키에 걸리는 섹션은 1회만 출력 (기술 스택 (변경 시 ADR 필수) 중복 제거)', () => {
    // '기술 스택'(CURSORRULES) + 'ADR'(CLAUDE_MD) 양쪽 매칭 → 기존엔 2회 출력되던 버그
    const sections = parseRulesMd('# P — Rules\n\n## 기술 스택 (변경 시 ADR 필수)\n- Node\n\n## 코딩 규칙\n- a\n')
    const out = toAgentsMd(sections, 'P')
    expect((out.match(/## 기술 스택 \(변경 시 ADR 필수\)/g) || []).length).toBe(1)
  })

  it('#130: 커스텀 H2(작업 3원칙·DoD)는 「기타 규칙」 버킷으로 전파 (silent drop 방지)', () => {
    const sections = parseRulesMd('# P — Rules\n\n## 0. 작업 3원칙\n- 스코프 고정\n\n## DoD\n- 테스트 통과\n\n## 코딩 규칙\n- a\n')
    const out = toAgentsMd(sections, 'P')
    expect(out).toContain('## 기타 규칙')
    expect(out).toContain('작업 3원칙')
    expect(out).toContain('스코프 고정')
    expect(out).toContain('DoD')
    expect(out).toContain('테스트 통과')
  })

  it('#130: 표준 섹션만이면 기타 규칙 버킷 없음 (노이즈 0)', () => {
    const out = toAgentsMd(parseRulesMd('## 코딩 규칙\n- a\n\n## 기록 규칙\n- b\n'), 'P')
    expect(out).not.toContain('기타 규칙')
  })
})

describe('vhk sync — Gemini CLI + Cline (Goal 16, 5→7종)', () => {
  it('toGeminiMd — 헤더 + 자동생성 경고 + 코딩 규칙, 기록 섹션 제외', () => {
    const out = toGeminiMd(parseRulesMd(SAMPLE_RULES), '데모 프로젝트')
    expect(out).toContain('# 데모 프로젝트 — Gemini CLI Rules')
    expect(out).toContain('자동 생성됨 (vhk sync). 직접 수정 금지')
    expect(out).toContain('execSync 금지')
    expect(out).not.toContain('docs/log/ 작성')
  })

  it('toClineRules — 헤더 + 자동생성 경고 + 코딩 규칙', () => {
    const out = toClineRules(parseRulesMd(SAMPLE_RULES), '데모 프로젝트')
    expect(out).toContain('# 데모 프로젝트 — Cline Rules')
    expect(out).toContain('자동 생성됨 (vhk sync). 직접 수정 금지')
    expect(out).toContain('execSync 금지')
  })

  it('SYNC_TARGETS 5 → 7종 (GEMINI.md/.clinerules/vhk-rules.md 등록, drift/backup 자동 반영)', () => {
    const paths = SYNC_TARGETS.map((t) => t.path)
    expect(paths).toContain('GEMINI.md')
    expect(paths).toContain('.clinerules/vhk-rules.md')
    expect(SYNC_TARGETS).toHaveLength(7)
  })

  it('Zed .rules 는 추가 안 함 (기존 AGENTS.md/CLAUDE.md/.cursorrules 로 커버 — 중복 방지)', () => {
    expect(SYNC_TARGETS.map((t) => t.path)).not.toContain('.rules')
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

describe('vhk init → sync 연결 (VHK-002 / #61 회귀)', () => {
  it('init 이 항상 생성하는 RULES.md 를 sync 가 소비해 .cursorrules·CLAUDE.md 를 만든다', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-init-sync-'))
    // #61: init 이 RULES.md 를 안 만들면 sync 가 그걸 요구하다 깨졌음 → 항상 생성됨을 보장.
    const files = generateFiles('데모', '한 줄 설명', ['Node.js', 'TypeScript'])
    expect(files['RULES.md']).toBeDefined()
    fs.writeFileSync(path.join(dir, 'RULES.md'), files['RULES.md'], 'utf-8')

    const result = await syncCore(dir, {}, async () => true)
    // sync 가 init 산출 RULES.md 를 읽어 도구 파일을 정상 생성(흐름 단절 없음)
    expect(result.written).toContain('.cursorrules')
    expect(result.written).toContain('CLAUDE.md')
    expect(fs.existsSync(path.join(dir, '.cursorrules'))).toBe(true)
    fs.rmSync(dir, { recursive: true })
  })
})
