import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { installCursorSkills, CURSOR_SKILL_TEMPLATES } from '../src/lib/cursor-skill-templates.js'

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-bootstrap-'))
}

function toV2Gate(gate: string): string {
  return gate
    .replace('<!-- vhk-template: vhk-gate@3 -->', '<!-- vhk-template: vhk-gate@2 -->')
    .replace(
      '| review exit 1 — Goal 스키마 오류·무시 파일 | `vhk goal list`로 확인 → **vhk-goal-health** |\r\n' +
        '| review exit 1 — 모든 Goal이 정상 DONE | branch/handoff closeout에서는 review `N/A`; goal-health 호출 금지 |',
      '| review skip (goal 0) | **vhk-goal-health** |',
    )
    .replace(
      'verify exit 0 + receipt pass/caution + active Goal의 review pass 또는 모든 Goal 정상 DONE closeout의 review `N/A`.',
      'verify exit 0 + receipt pass/caution + review pass (또는 skip 사유 goal-health 해결 후).',
    )
}

describe('cursor-skill-templates', () => {
  it('5개 skill 템플릿 번들', () => {
    expect(Object.keys(CURSOR_SKILL_TEMPLATES).sort()).toEqual([
      'vhk-bootstrap-cursor',
      'vhk-dogfood-issue',
      'vhk-evolve-loop',
      'vhk-gate',
      'vhk-goal-health',
    ])
  })

  it('vhk-gate는 stale을 verify로 복구하고 작업 기준선 명령과 섞지 않는다', () => {
    const gate = CURSOR_SKILL_TEMPLATES['vhk-gate']
    expect(gate).toContain('<!-- vhk-template: vhk-gate@3 -->')
    expect(gate).not.toContain('pnpm.cmd')
    expect(gate).toContain('receipt BLOCK — stale')
    expect(gate).toMatch(/receipt BLOCK — stale[^\r\n]*vhk verify/)
    expect(gate).not.toMatch(/stale[^\r\n]*mark-start/)
  })

  it('vhk-gate는 깨진 Goal과 정상 전체-DONE closeout을 서로 다르게 안내한다', () => {
    const gate = CURSOR_SKILL_TEMPLATES['vhk-gate']
    expect(gate).toMatch(/스키마 오류[^\r\n]*vhk-goal-health/)
    expect(gate).toMatch(/모든 Goal이 정상 DONE[^\r\n]*(review N\/A|review `N\/A`)/)
    expect(gate).not.toContain('| review skip (goal 0) | **vhk-goal-health** |')
  })

  it('bootstrap 검증은 프로젝트별 스크립트를 추측하지 않고 verify에 위임한다', () => {
    const bootstrap = CURSOR_SKILL_TEMPLATES['vhk-bootstrap-cursor']
    expect(bootstrap).toContain('<!-- vhk-template: vhk-bootstrap-cursor@3 -->')
    expect(bootstrap).toContain('vhk verify')
    expect(bootstrap).not.toContain('pnpm.cmd')
  })

  it('생성 스크립트는 skill 본문만 갱신하고 안전한 설치·마이그레이션 코드를 보존한다', () => {
    const sourcePath = path.resolve('src/lib/cursor-skill-templates.ts')
    const outputPath = path.join(dir, 'cursor-skill-templates.ts')
    const skillsRoot = path.join(dir, 'skills')
    fs.writeFileSync(outputPath, fs.readFileSync(sourcePath, 'utf-8'), 'utf-8')
    for (const name of Object.keys(CURSOR_SKILL_TEMPLATES)) {
      const skillDir = path.join(skillsRoot, name)
      fs.mkdirSync(skillDir, { recursive: true })
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `# generated ${name}\n`, 'utf-8')
    }

    const result = spawnSync(
      process.execPath,
      [path.resolve('scripts/gen-cursor-skills.mjs'), skillsRoot, outputPath],
      { cwd: process.cwd(), encoding: 'utf-8' },
    )
    const generated = fs.readFileSync(outputPath, 'utf-8')

    expect(result.status, result.stderr).toBe(0)
    expect(generated).toContain('"vhk-gate": "# generated vhk-gate\\n"')
    expect(generated).toContain('export function installCursorSkills')
    expect(generated).toContain('isKnownLegacyTemplate')
  })

  let dir = ''
  beforeEach(() => { dir = tmp() })
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  it('installCursorSkills — create-if-missing', () => {
    const r1 = installCursorSkills(dir)
    expect(r1.created).toHaveLength(5)
    expect(r1.updated).toHaveLength(0)
    expect(r1.outdated).toHaveLength(0)
    expect(r1.skipped).toHaveLength(0)
    expect(fs.existsSync(path.join(dir, '.cursor', 'skills', 'vhk-gate', 'SKILL.md'))).toBe(true)

    const r2 = installCursorSkills(dir)
    expect(r2.created).toHaveLength(0)
    expect(r2.updated).toHaveLength(0)
    expect(r2.outdated).toHaveLength(0)
    expect(r2.skipped).toHaveLength(5)
  })

  it('installCursorSkills — 수정되지 않은 v2 gate는 v3로 안전하게 마이그레이션한다', () => {
    const gateDir = path.join(dir, '.cursor', 'skills', 'vhk-gate')
    const gatePath = path.join(gateDir, 'SKILL.md')
    fs.mkdirSync(gateDir, { recursive: true })
    const v2 = toV2Gate(CURSOR_SKILL_TEMPLATES['vhk-gate'])
    fs.writeFileSync(gatePath, v2, 'utf-8')

    const result = installCursorSkills(dir)

    expect(result.updated).toEqual(['vhk-gate'])
    expect(result.outdated).toEqual([])
    expect(fs.readFileSync(gatePath, 'utf-8')).toBe(CURSOR_SKILL_TEMPLATES['vhk-gate'])
  })

  it('installCursorSkills — 수정되지 않은 v1 gate는 v3로 안전하게 마이그레이션한다', () => {
    const gateDir = path.join(dir, '.cursor', 'skills', 'vhk-gate')
    const gatePath = path.join(gateDir, 'SKILL.md')
    fs.mkdirSync(gateDir, { recursive: true })
    const legacy = toV2Gate(CURSOR_SKILL_TEMPLATES['vhk-gate'])
      .replace('<!-- vhk-template: vhk-gate@2 -->\r\n', '')
      .replace(
        '```powershell\r\nvhk verify\r\nvhk receipt\r\nvhk review',
        '```powershell\r\npnpm.cmd typecheck\r\npnpm.cmd test\r\npnpm.cmd lint\r\nvhk verify\r\nvhk receipt\r\nvhk review',
      )
      .replace(
        '| verify red | `.vhk/reports/latest.json` → 실패 수정 → `vhk verify` 재실행 |\r\n' +
          '| receipt BLOCK — dirty | 변경을 확인·커밋한 뒤 `vhk receipt` 재실행 |\r\n' +
          '| receipt BLOCK — stale | `vhk verify`로 현재 HEAD를 재검증한 뒤 `vhk receipt` 재실행 |\r\n' +
          '| receipt BLOCK — forbidden | 금지 경로 변경을 제거하거나 사람과 mission을 재합의 |\r\n' +
          '| receipt CAUTION — 작업 기준 미기록 | 현재 범위를 확인하고 다음 작업 시작 전에 `vhk receipt --mark-start` |',
        '| verify red | `.vhk/reports/latest.json` → 수정 → 재실행 |\r\n' +
          '| receipt BLOCK | dirty/stale → commit 또는 `vhk receipt --mark-start` → **vhk-evolve-loop** |',
      )
    fs.writeFileSync(gatePath, legacy, 'utf-8')

    const result = installCursorSkills(dir)

    expect(result.updated).toEqual(['vhk-gate'])
    expect(result.outdated).toEqual([])
    expect(fs.readFileSync(gatePath, 'utf-8')).toBe(CURSOR_SKILL_TEMPLATES['vhk-gate'])
  })

  it('installCursorSkills — 내용이 그대로인 나머지 v1 skill도 관리 표식 버전으로 승격한다', () => {
    const names = ['vhk-evolve-loop', 'vhk-dogfood-issue', 'vhk-goal-health']
    for (const name of names) {
      const skillDir = path.join(dir, '.cursor', 'skills', name)
      fs.mkdirSync(skillDir, { recursive: true })
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        CURSOR_SKILL_TEMPLATES[name].replace(`<!-- vhk-template: ${name}@3 -->\r\n`, ''),
        'utf-8',
      )
    }

    const result = installCursorSkills(dir)

    expect(result.updated.sort()).toEqual(names.sort())
    expect(result.outdated).toEqual([])
  })

  it('installCursorSkills — 내용이 그대로인 나머지 v2 skill도 v3로 승격한다', () => {
    const names = ['vhk-evolve-loop', 'vhk-dogfood-issue', 'vhk-goal-health']
    for (const name of names) {
      const skillDir = path.join(dir, '.cursor', 'skills', name)
      fs.mkdirSync(skillDir, { recursive: true })
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        CURSOR_SKILL_TEMPLATES[name].replace(
          `<!-- vhk-template: ${name}@3 -->`,
          `<!-- vhk-template: ${name}@2 -->`,
        ),
        'utf-8',
      )
    }

    const result = installCursorSkills(dir)

    expect(result.updated.sort()).toEqual(names.sort())
    expect(result.outdated).toEqual([])
  })

  it('installCursorSkills — 사용자가 고친 오래된 gate는 덮어쓰지 않고 경고 대상으로 돌린다', () => {
    const gateDir = path.join(dir, '.cursor', 'skills', 'vhk-gate')
    const gatePath = path.join(gateDir, 'SKILL.md')
    fs.mkdirSync(gateDir, { recursive: true })
    const customLegacy = CURSOR_SKILL_TEMPLATES['vhk-gate']
      .replace('<!-- vhk-template: vhk-gate@3 -->\r\n', '')
      .replace(
        '| receipt BLOCK — stale | `vhk verify`로 현재 HEAD를 재검증한 뒤 `vhk receipt` 재실행 |',
        '| receipt BLOCK | dirty/stale → commit 또는 `vhk receipt --mark-start` → **vhk-evolve-loop** |',
      ) + '\r\n사용자 메모\r\n'
    fs.writeFileSync(gatePath, customLegacy, 'utf-8')

    const result = installCursorSkills(dir)

    expect(result.updated).toEqual([])
    expect(result.outdated).toEqual(['vhk-gate'])
    expect(fs.readFileSync(gatePath, 'utf-8')).toBe(customLegacy)
  })

  it('installCursorSkills — 명령을 npm으로 바꾼 무표식 사용자본도 조용히 건너뛰지 않는다', () => {
    const gateDir = path.join(dir, '.cursor', 'skills', 'vhk-gate')
    const gatePath = path.join(gateDir, 'SKILL.md')
    fs.mkdirSync(gateDir, { recursive: true })
    const customized = CURSOR_SKILL_TEMPLATES['vhk-gate']
      .replace('<!-- vhk-template: vhk-gate@3 -->\r\n', '')
      .replace('# VHK Gate', '# 팀 전용 VHK Gate')
      .replace('vhk verify', 'npm run verify')
    fs.writeFileSync(gatePath, customized, 'utf-8')

    const result = installCursorSkills(dir)

    expect(result.updated).toEqual([])
    expect(result.outdated).toEqual(['vhk-gate'])
    expect(fs.readFileSync(gatePath, 'utf-8')).toBe(customized)
  })
})
