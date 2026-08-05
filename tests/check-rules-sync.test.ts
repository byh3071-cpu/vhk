import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// tsc 는 tests/ 미검사 → .mjs 직접 import 안전(meta-gate.test.ts 선례).
import { extractVhkBlockSections, findRulesDrift } from '../scripts/check-rules-sync.mjs'

const SCRIPT = path.join(process.cwd(), 'scripts', 'check-rules-sync.mjs')

const RULES = [
  '# 규칙',
  '',
  '## 코딩 규칙',
  '',
  '- A 규칙',
  '- B 규칙',
  '',
  '## 기록 규칙',
  '',
  '- 로그 남기기',
  '',
].join('\n')

function claudeWith(sections: string): string {
  return [
    '# CLAUDE.md',
    '',
    '## 헌법 섹션 (사용자 영역)',
    '- 불가침',
    '',
    '<!-- vhk:rules:start -->',
    '> ⚡ 아래 규칙 섹션은 RULES.md에서 자동 생성됨 (vhk sync). 직접 수정 금지.',
    '',
    sections,
    '<!-- vhk:rules:end -->',
    '',
    '## LIVE 상태 (사용자 영역)',
    '- 버전 어쩌고',
  ].join('\n')
}

const SYNCED = claudeWith('## 코딩 규칙\n- A 규칙\n- B 규칙\n\n## 기록 규칙\n- 로그 남기기\n')

describe('extractVhkBlockSections', () => {
  it('마커 안의 섹션만 추출 (사용자 영역 제외)', () => {
    const sections = extractVhkBlockSections(SYNCED)
    expect(sections?.map((s: { title: string }) => s.title)).toEqual(['코딩 규칙', '기록 규칙'])
  })

  it('마커 없으면 null (pre-migration 레포)', () => {
    expect(extractVhkBlockSections('# CLAUDE.md\n## 그냥 섹션\n- x')).toBeNull()
  })
})

describe('findRulesDrift', () => {
  it('동기화 상태 → drift 0', () => {
    expect(findRulesDrift(RULES, SYNCED)).toEqual([])
  })

  it('전 타겟 필수 표시는 제목 비교에서 메타데이터로 제거한다', () => {
    const required = RULES.replace('## 코딩 규칙', '## 코딩 규칙 <!-- vhk:sync=all -->')
    expect(findRulesDrift(required, SYNCED)).toEqual([])
  })

  it('RULES.md 만 수정(sync 안 함) → mismatch 감지', () => {
    const edited = RULES.replace('- B 규칙', '- B 규칙 수정됨')
    const drift = findRulesDrift(edited, SYNCED)
    expect(drift).toHaveLength(1)
    expect(drift[0]).toMatchObject({ title: '코딩 규칙', kind: 'mismatch' })
  })

  it('CLAUDE.md 블록 직접 편집 → mismatch 감지', () => {
    const tampered = SYNCED.replace('- 로그 남기기', '- 몰래 수정')
    expect(findRulesDrift(RULES, tampered)).toHaveLength(1)
  })

  it('CLAUDE.md 블록에 RULES 에 없는 섹션 → missing 감지', () => {
    const extra = claudeWith('## 코딩 규칙\n- A 규칙\n- B 규칙\n\n## 기록 규칙\n- 로그 남기기\n\n## 유령 섹션\n- 스테일\n')
    const drift = findRulesDrift(RULES, extra)
    expect(drift[0]).toMatchObject({ title: '유령 섹션', kind: 'missing' })
  })

  it('CRLF/트레일링 공백 차이는 drift 아님 (정규화)', () => {
    const crlf = SYNCED.replace(/\n/g, '\r\n')
    expect(findRulesDrift(RULES, crlf)).toEqual([])
  })
})

function run(rules: string, claude: string): number {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-rsync-'))
  fs.writeFileSync(path.join(d, 'RULES.md'), rules)
  fs.writeFileSync(path.join(d, 'CLAUDE.md'), claude)
  try {
    execFileSync('node', [SCRIPT], { cwd: d, encoding: 'utf-8', stdio: 'pipe' })
    return 0
  } catch (e) {
    return (e as { status?: number }).status ?? -1
  } finally {
    fs.rmSync(d, { recursive: true, force: true })
  }
}

describe('check-rules-sync e2e', () => {
  it('동기화 → exit 0 / drift → exit 1', () => {
    expect(run(RULES, SYNCED)).toBe(0)
    expect(run(RULES.replace('- A 규칙', '- A2'), SYNCED)).toBe(1)
  })

  it('실물 레포 — 현재 RULES.md ↔ CLAUDE.md 동기화 상태(회귀)', () => {
    execFileSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf-8', stdio: 'pipe' })
  })
})
