import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  detectExistingRuleFiles,
  buildAdoptedRules,
  ADOPT_SOURCES,
} from '../src/lib/rules-import.js'

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-adopt-'))
}

describe('rules-import — 기존 설정 파일 감지', () => {
  it('존재하는 규칙 파일만 골라 경로+내용을 돌려준다', () => {
    const dir = tmp()
    fs.writeFileSync(path.join(dir, '.cursorrules'), '# c\n## 코딩 규칙\n- a\n', 'utf-8')
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# m\n## 기록 규칙\n- b\n', 'utf-8')
    // .windsurfrules 는 없음 → 결과에서 제외돼야 함

    const found = detectExistingRuleFiles(dir)
    const paths = found.map((f) => f.path)
    expect(paths).toContain('.cursorrules')
    expect(paths).toContain('CLAUDE.md')
    expect(paths).not.toContain('.windsurfrules')
    expect(found.find((f) => f.path === '.cursorrules')?.content).toContain('- a')

    fs.rmSync(dir, { recursive: true })
  })

  it('중첩 경로(.github/copilot-instructions.md)도 감지한다', () => {
    const dir = tmp()
    fs.mkdirSync(path.join(dir, '.github'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, '.github', 'copilot-instructions.md'),
      '# x\n## 코딩 규칙\n- c\n',
      'utf-8'
    )
    const found = detectExistingRuleFiles(dir)
    expect(found.map((f) => f.path)).toContain('.github/copilot-instructions.md')
    fs.rmSync(dir, { recursive: true })
  })

  it('감지 대상 목록(ADOPT_SOURCES)에 5개 도구 파일이 들어있다', () => {
    expect(ADOPT_SOURCES).toContain('.cursorrules')
    expect(ADOPT_SOURCES).toContain('CLAUDE.md')
    expect(ADOPT_SOURCES).toContain('AGENTS.md')
    expect(ADOPT_SOURCES).toContain('.windsurfrules')
    expect(ADOPT_SOURCES).toContain('.github/copilot-instructions.md')
  })
})

describe('rules-import — RULES.md 표준 섹션 병합', () => {
  it('각 출처 섹션을 출처 주석과 함께 RULES.md 로 병합한다', () => {
    const files = [
      { path: '.cursorrules', content: '# c\n## 코딩 규칙\n- execSync 금지\n' },
      { path: 'CLAUDE.md', content: '# m\n## 기록 규칙\n- docs/log 작성\n' },
    ]
    const out = buildAdoptedRules(files, '데모')
    expect(out).toContain('# 데모 — Rules')
    expect(out).toContain('## 코딩 규칙')
    expect(out).toContain('execSync 금지')
    expect(out).toContain('## 기록 규칙')
    expect(out).toContain('docs/log 작성')
    // 출처 주석
    expect(out).toContain('.cursorrules')
    expect(out).toContain('CLAUDE.md')
    expect(out).toMatch(/<!--[^>]*출처/)
  })

  it('같은 제목 섹션이 여러 출처에 있으면 한 제목 아래 병합한다', () => {
    const files = [
      { path: '.cursorrules', content: '## 코딩 규칙\n- a\n' },
      { path: '.windsurfrules', content: '## 코딩 규칙\n- b\n' },
    ]
    const out = buildAdoptedRules(files, 'P')
    // 제목은 한 번만, 두 출처 본문 모두 포함
    expect(out.match(/^## 코딩 규칙$/gm)?.length).toBe(1)
    expect(out).toContain('- a')
    expect(out).toContain('- b')
    expect(out).toContain('.cursorrules')
    expect(out).toContain('.windsurfrules')
  })

  it('병합 결과가 sync 파서로 다시 파싱 가능하다', () => {
    const files = [{ path: '.cursorrules', content: '## 기술 스택\n- Node.js\n' }]
    const out = buildAdoptedRules(files, 'P')
    // parseRulesMd 가 읽을 수 있는 ## 섹션 구조 유지
    expect(out).toContain('## 기술 스택')
    expect(out).toContain('Node.js')
  })
})

describe('rules-import — ⑥ 인트로 보존 + 빈 섹션 0 (회귀)', () => {
  it('첫 ## 이전 인트로를 서문으로 보존한다 (버리지 않음 → 잃으면 FAIL)', () => {
    const files = [{ path: '.cursorrules', content: '# C\n\n중관리자 인트로 메모입니다\n\n## 코딩 규칙\n- a\n' }]
    const out = buildAdoptedRules(files, 'P')
    expect(out).toContain('중관리자 인트로 메모입니다')
  })

  it('본문 없는 빈 섹션은 제목/출처주석을 만들지 않는다 (오염 0)', () => {
    const files = [{ path: '.cursorrules', content: '## 빈섹션\n\n## 코딩 규칙\n- a\n' }]
    const out = buildAdoptedRules(files, 'P')
    expect(out).not.toContain('## 빈섹션')
    expect(out).toContain('## 코딩 규칙')
  })
})

describe('rules-import — 관리형 블록 무결성 (#544)', () => {
  const block = [
    '<!-- MY-BLOCK:BEGIN (managed by sample — 직접수정 금지) -->',
    '## 공통 규칙',
    '- 같은 규칙',
    '<!-- MY-BLOCK:END -->',
  ].join('\n')

  it('여러 입력의 동일 관리형 블록은 첫 번째 한 벌만 남긴다', () => {
    const out = buildAdoptedRules([
      { path: 'CLAUDE.md', content: block },
      { path: 'AGENTS.md', content: block },
    ], 'P')
    expect(out.match(/MY-BLOCK:BEGIN/g)).toHaveLength(1)
    expect(out.match(/MY-BLOCK:END/g)).toHaveLength(1)
  })

  it('같은 파일에 반복되거나 BEGIN 설명만 달라도 내용이 같으면 한 벌만 남긴다', () => {
    const alternateMarker = block.replace('(managed by sample — 직접수정 금지)', '(managed by another tool)')
    const out = buildAdoptedRules([
      { path: 'CLAUDE.md', content: `${block}\n\n${alternateMarker}` },
    ], 'P')
    expect(out.match(/MY-BLOCK:BEGIN/g)).toHaveLength(1)
    expect(out.match(/MY-BLOCK:END/g)).toHaveLength(1)
  })

  it('같은 키의 내용이 다르면 자동 선택하지 않고 충돌 오류를 낸다', () => {
    const changed = block.replace('- 같은 규칙', '- 다른 규칙')
    expect(() => buildAdoptedRules([
      { path: 'CLAUDE.md', content: block },
      { path: 'AGENTS.md', content: changed },
    ], 'P')).toThrow(/MY-BLOCK.*내용이 다릅니다/)
  })

  it.each([
    ['닫는 마커 없음', '<!-- X:BEGIN -->\n## 규칙\n- a'],
    ['여는 마커 없음', '## 규칙\n- a\n<!-- X:END -->'],
    ['중첩 마커', '<!-- X:BEGIN -->\n<!-- Y:BEGIN -->\n<!-- Y:END -->\n<!-- X:END -->'],
    ['키 불일치', '<!-- X:BEGIN -->\n## 규칙\n<!-- Y:END -->'],
  ])('%s이면 무수정 실패용 오류를 낸다', (_label, content) => {
    expect(() => buildAdoptedRules([{ path: 'AGENTS.md', content }], 'P')).toThrow(/관리형 블록/)
  })
})
