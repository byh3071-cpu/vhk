import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseRules } from '../src/lib/rules-parser.js'
import { check } from '../src/commands/check.js'
import { detectNaturalLanguageInput } from '../src/lib/cli-args.js'
import { setSink } from '../src/utils/logger.js'

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

// #405: `vhk check <미인식>` 이 RULES.md 규칙점검으로 silent fallback 하지 않고 명시적으로 안내.
describe('vhk check <서브명령> — silent fallback 차단 (#405)', () => {
  it('vhk check evals → NL 라우터가 가로채지 않고 commander 위치인자로 위임 (null)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', 'check', 'evals'])).toBeNull()
  })

  it('vhk 점검 evals → 한글 별칭도 동일 (null)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', '점검', 'evals'])).toBeNull()
  })

  it('vhk 린트 evals → 한글 별칭도 동일 (null)', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', '린트', 'evals'])).toBeNull()
  })

  // 회귀: 인자 없는 자연어 규칙점검은 여전히 NL 로 흐른다(check 키워드 → check 명령).
  it('회귀: vhk 규칙 점검(자연어) → 여전히 자연어 라우팅', () => {
    expect(detectNaturalLanguageInput(['node', 'vhk', '규칙', '점검'])).toBe('규칙 점검')
  })

  describe('서브명령 안내 출력', () => {
    let captured: string[] = []
    let restoreSink: (() => void) | undefined
    let prevExitCode: typeof process.exitCode

    afterEach(() => {
      restoreSink?.()
      restoreSink = undefined
      captured = []
      process.exitCode = prevExitCode
    })

    function run(target: string): Promise<void> {
      captured = []
      prevExitCode = process.exitCode
      restoreSink = setSink((line) => captured.push(line))
      return check({}, target)
    }

    it("evals → 골든셋 채점기 미구현(goal G-B) 안내, 규칙점검으로 안 샘", async () => {
      await run('evals')
      const out = captured.join('\n')
      expect(out).toMatch(/G-B/)
      expect(out).toMatch(/golden-set\.md/)
      // 규칙점검(checkRules)으로 흘렀다면 나올 문구가 없어야 한다 = silent fallback 아님.
      expect(out).not.toMatch(/규칙 .*개 통과|프로젝트 규칙 점검/)
      expect(process.exitCode ?? 0).toBe(0)
    })

    it("미인식 인자 → 정직한 안내 + exit 1 (조용한 성공 위장 차단)", async () => {
      await run('bogus-sub')
      const out = captured.join('\n')
      expect(out).toMatch(/bogus-sub/)
      expect(out).toMatch(/RULES\.md|규칙/)
      expect(process.exitCode).toBe(1)
    })
  })
})
