import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseRules } from '../src/lib/rules-parser.js'

describe('vhk check', () => {
  it('RULES.md 없으면 빈 규칙 배열 반환', () => {
    const rules = parseRules('/nonexistent/RULES.md')
    expect(rules).toEqual([])
  })

  it('kebab-case 규칙을 파싱한다', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-check-'))
    const rulesPath = path.join(tmp, 'RULES.md')
    fs.mkdirSync(path.join(tmp, 'src'))
    fs.writeFileSync(rulesPath, '## 코딩 규칙\n- 파일명은 kebab-case\n')
    fs.writeFileSync(path.join(tmp, 'src', 'BadFileName.ts'), 'export {}\n')

    const rules = parseRules(rulesPath)
    const naming = rules.find(r => r.type === 'naming')
    expect(naming).toBeDefined()

    const violations = naming!.check(tmp)
    expect(violations.some(v => v.message.includes('kebab-case'))).toBe(true)

    fs.rmSync(tmp, { recursive: true })
  })

  it('금지 패턴 규칙을 파싱한다', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-check-'))
    fs.mkdirSync(path.join(tmp, 'src'))
    fs.writeFileSync(path.join(tmp, 'RULES.md'), '## 코딩\n- `console.log` 금지\n')
    fs.writeFileSync(path.join(tmp, 'src', 'debug.ts'), 'console.log("test")\n')

    const rules = parseRules(path.join(tmp, 'RULES.md'))
    const ban = rules.find(r => r.id.startsWith('ban-'))
    expect(ban).toBeDefined()
    expect(ban!.type).toBe('content')

    const violations = ban!.check(tmp)
    expect(violations.length).toBeGreaterThan(0)
    expect(violations[0]?.message).toContain('console.log')

    fs.rmSync(tmp, { recursive: true })
  })

  it('구조 규칙: 디렉토리 존재 여부 검증', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhk-check-'))
    fs.writeFileSync(path.join(tmp, 'RULES.md'), '## 구조\n- 소스는 `src/` 에 둔다\n')

    const rules = parseRules(path.join(tmp, 'RULES.md'))
    const structure = rules.find(r => r.type === 'structure')
    expect(structure).toBeDefined()

    const violations = structure!.check(tmp)
    expect(violations).toHaveLength(1)
    expect(violations[0]?.message).toContain('src/')

    fs.mkdirSync(path.join(tmp, 'src'))
    expect(structure!.check(tmp)).toEqual([])

    fs.rmSync(tmp, { recursive: true })
  })
})
