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
  toClaudeMd,
  claudeMdMigration,
  toAgentsMd,
} from '../src/commands/sync.js'
import { RULES_MD_TEMPLATE } from '../src/templates/rules-md.js'
import {
  agentsMdEcosystemBlock,
  resolveAgentCompactRel,
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

  it('agentsMdEcosystemBlock — rootDir 에 ecosystem.mdc 없으면 빈 배열 (#468)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-eco-'))
    try {
      expect(agentsMdEcosystemBlock(dir)).toEqual([])
      fs.mkdirSync(path.join(dir, '.cursor', 'rules'), { recursive: true })
      fs.writeFileSync(path.join(dir, '.cursor', 'rules', 'ecosystem.mdc'), 'test\n', 'utf-8')
      expect(agentsMdEcosystemBlock(dir).length).toBeGreaterThan(0)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('toAgentsMd — rootDir without ecosystem.mdc omits Ecosystem block', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-agents-eco-'))
    try {
      const out = toAgentsMd(parseRulesMd(SAMPLE_RULES), 'P', null, dir)
      expect(out).not.toContain('## Ecosystem (cross-repo)')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('toAgentsMd — compactRel null 이면 agent-compact 포인터 생략 (tier S dead link 방지)', () => {
    const out = toAgentsMd(parseRulesMd(SAMPLE_RULES), 'P', null)
    expect(out).not.toContain('agent-compact')
    expect(out).toContain('Loop Protocol')
  })

  it('resolveAgentCompactRel — 파일 있을 때만 경로 반환', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-compact-'))
    try {
      expect(resolveAgentCompactRel(dir)).toBeNull()
      fs.mkdirSync(path.join(dir, 'docs', 'context'), { recursive: true })
      fs.writeFileSync(path.join(dir, 'docs', 'context', 'agent-compact.md'), '# c\n')
      expect(resolveAgentCompactRel(dir)).toBe('docs/context/agent-compact.md')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
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

describe('vhk sync — goal 90: 도메인 규칙 섹션이 .cursorrules + CLAUDE.md 양쪽 도달 (회귀)', () => {
  // init 커스터마이징 인터뷰가 쓸 법한 합성 RULES.md — 도메인 불변식 + ### 절대 금지.
  const domainRules =
    '# 사주봇 — Rules\n\n' +
    '## 도메인 규칙\n' +
    '- 사주 계산은 반드시 음력 변환을 거친다 SENTINEL_INVARIANT\n' +
    '### 절대 금지\n' +
    '- 사용자 사주 데이터 외부 전송 금지 SENTINEL_FORBIDDEN\n' +
    '\n## 코딩 규칙\n- a\n'

  it('.cursorrules 렌더 결과에 도메인 규칙 본문 포함 (AGENTS.md 만이면 FAIL)', () => {
    const out = toCursorrules(parseRulesMd(domainRules), '사주봇')
    expect(out).toContain('SENTINEL_INVARIANT')
    expect(out).toContain('SENTINEL_FORBIDDEN') // ### 하위 제목도 같은 ## 섹션 본문으로 실림
  })

  it('CLAUDE.md 렌더 결과(마커블록 안)에도 도메인 규칙 본문 포함', () => {
    const out = toClaudeMd(parseRulesMd(domainRules), '# 기록 규칙 (사주봇)\n\n## 현재 상태\n- P1\n')
    const start = out.indexOf('<!-- vhk:rules:start -->')
    const end = out.indexOf('<!-- vhk:rules:end -->')
    expect(start).toBeGreaterThanOrEqual(0)
    expect(out.indexOf('SENTINEL_INVARIANT')).toBeGreaterThan(start)
    expect(out.indexOf('SENTINEL_INVARIANT')).toBeLessThan(end)
    expect(out.indexOf('SENTINEL_FORBIDDEN')).toBeLessThan(end)
  })

  it('도메인 규칙 섹션은 findUnmappedSections 가 더 이상 잡지 않음 (properly mapped)', () => {
    expect(findUnmappedSections(parseRulesMd(domainRules))).not.toContain('도메인 규칙')
  })

  it('회귀 가드: 나머지 코딩 타깃(windsurf·copilot·gemini·cline·antigravity)에도 전파', () => {
    const s = parseRulesMd(domainRules)
    expect(toWindsurfrules(s, 'P')).toContain('SENTINEL_INVARIANT')
    expect(toCopilotInstructions(s, 'P')).toContain('SENTINEL_INVARIANT')
    expect(toGeminiMd(s, 'P')).toContain('SENTINEL_INVARIANT')
    expect(toClineRules(s, 'P')).toContain('SENTINEL_INVARIANT')
    expect(toAntigravityRules(s, 'P')).toContain('SENTINEL_INVARIANT')
  })

  // critic 리뷰 발견(2026-07-03): CURSORRULES_KEYS 확장이 VHK_MANAGED_KEYS(spread)에도 자동
  // 반영되고, VHK_MANAGED_KEYS는 stripLegacyAutogen(레거시 마커없는 CLAUDE.md 1회 마이그레이션)의
  // "옛 자동생성 → 삭제" 판정에도 쓰인다. 즉 이 기능 이전에 사용자가 CLAUDE.md에 손으로 써둔
  // "## 도메인 규칙" 유사 섹션이 있으면, 최초 sync 시 "옛 자동생성"으로 오인돼 제거된다.
  // governance 2026-06-10이 'Forbidden' 키에 대해 정확히 이 이유로 신규 키 추가를 거부한 전례가
  // 있으나, sync.ts:27-29 자체 주석이 "toClaudeMd 재생성 판정과 stripLegacyAutogen 삭제 판정은
  // 반드시 같은 키 집합을 써야 한다(다르면 재생성 섹션이 사용자 섹션으로 오인돼 중복된다)"고
  // 명시하므로, 두 키셋을 분리하는 완화책은 이 저장소 자신의 설계 의도와 정면 배치돼 채택하지
  // 않는다. 대신: (1) 완전 침묵 아님 — 아래 테스트가 증명하듯 removed 목록으로 노출되고
  // syncCore가 덮어쓰기 전 항상 백업하므로 복구 가능. (2) 위험 시나리오 자체가 좁음 — "도메인"은
  // 이 기능(goal 89/90) 이전엔 표준 관용구가 아니었어서 'Forbidden'(전 프로젝트 헌법 영구구역,
  // 매치 확률 사실상 100%)과 위험도가 다르다. 이 테스트는 그 트레이드오프를 의도적으로 문서화한다
  // — 동작이 바뀌면(예: 실수로 stripLegacyAutogen 을 건드려 조용해지면) 이 테스트가 잡는다.
  it('[알려진 트레이드오프] 레거시(마커없는) CLAUDE.md에 손으로 쓴 "도메인" 섹션은 1회 마이그레이션 시 제거 대상으로 분류되지만, 완전 침묵은 아니다(removed 로 노출)', () => {
    const legacy = '# 기록 규칙 (사주봇)\n\n## 도메인 규칙\n- 사용자가 예전에 손으로 쓴 내용\n\n## 현재 상태\n- P1\n'
    const r = claudeMdMigration(legacy)
    expect(r.migrated).toBe(true)
    expect(r.removed).toContain('도메인 규칙') // 알려진 트레이드오프 — 위 주석 참조
    expect(r.preserved).toContain('현재 상태') // 무관 사용자 섹션은 그대로 보존됨(과확장 아님)
  })

  // RFC 0060 T4: [여기에 작성:] 마커 규칙을 RULES.md(코딩 규칙)에 넣어 sync 가 전 도구 파일로
  // 전파 → SessionStart 훅이 없는 에이전트(Cursor·Codex)도 파일 안 규칙으로 "빈칸은 대화로" 백업 트리거.
  describe('RFC 0060 T4 — 마커 규칙 전 에이전트 전파', () => {
    it('RULES.md 마커 규칙이 sync 로 .cursorrules·AGENTS.md 에 전파된다', () => {
      const rules = RULES_MD_TEMPLATE('P', 'desc', 'Next.js')
      expect(rules).toContain('[여기에 작성:')
      const sections = parseRulesMd(rules)
      expect(toCursorrules(sections, 'P')).toContain('[여기에 작성:')
      expect(toAgentsMd(sections, 'P')).toContain('[여기에 작성:')
    })
  })
})
