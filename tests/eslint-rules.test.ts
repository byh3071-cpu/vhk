import { describe, it, expect } from 'vitest'
import { Linter } from 'eslint'
import tseslint from 'typescript-eslint'
import eslintConfig from '../eslint.config.js'

// 영구 코딩 규칙(RULES.md → eslint.config.js → verify lint 게이트 → receipt block #381)이
// 실제로 위반을 잡는지 fixture 로 고정한다. 검증 대상 3규칙은 모두 type-aware 불필요(문법 기반)
// 이라 Linter API(타입 정보 없이)로 단위 검증할 수 있다.
//   R1 no-restricted-syntax(execSync) · R2 no-empty(빈 catch) · R3 no-explicit-any(명시 any)
// 설계 결정도 회귀로 못박는다: 주석으로 사유를 밝힌 catch 는 통과 · execFileSync(safeExecFile 통로)는 허용.

// 동작 검증용 규칙(명시) — eslint.config.js 의 값과 동일하게 유지. config 존재 여부는 아래 정합 테스트가 봉인.
const PERMANENT_RULES: Linter.RulesRecord = {
  'no-restricted-syntax': [
    'error',
    { selector: "CallExpression[callee.name='execSync']", message: 'execSync 금지' },
    { selector: "MemberExpression[property.name='execSync']", message: 'execSync 금지' },
  ],
  'no-empty': ['error', { allowEmptyCatch: false }],
  '@typescript-eslint/no-explicit-any': 'error',
}

function lint(code: string): Linter.LintMessage[] {
  const linter = new Linter()
  return linter.verify(code, {
    languageOptions: {
      parser: tseslint.parser as unknown as Linter.Parser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    // @typescript-eslint 플러그인 등록(no-explicit-any 제공). 타입 마찰만 회피.
    plugins: { '@typescript-eslint': tseslint.plugin as unknown as Linter.Plugin },
    rules: PERMANENT_RULES,
  })
}

function hits(code: string, ruleId: string): number {
  return lint(code).filter((m) => m.ruleId === ruleId).length
}

describe('영구 코딩 규칙 — ESLint 코드화 (RULES.md 자동 집행)', () => {
  describe('R1: execSync 신규 금지 (no-restricted-syntax)', () => {
    it('execSync 직접 호출을 잡는다', () => {
      expect(hits("import { execSync } from 'node:child_process'\nexecSync('echo')", 'no-restricted-syntax')).toBeGreaterThan(0)
    })

    it('child_process.execSync 멤버 호출도 잡는다', () => {
      expect(hits("import cp from 'node:child_process'\ncp.execSync('echo')", 'no-restricted-syntax')).toBeGreaterThan(0)
    })

    it('execFileSync(safeExecFile 통로)는 허용한다 — 통로 자체를 막지 않음', () => {
      expect(hits("import { execFileSync } from 'node:child_process'\nexecFileSync('git', ['status'])", 'no-restricted-syntax')).toBe(0)
    })
  })

  describe('R2: 빈 catch 금지 (no-empty)', () => {
    it('완전 빈 catch 를 잡는다', () => {
      expect(hits('try { doThing() } catch {}', 'no-empty')).toBeGreaterThan(0)
    })

    it('주석으로 사유를 밝힌 catch 는 통과 — "에러를 말없이 삼킴"만 차단', () => {
      expect(hits('try { doThing() } catch { /* 무시 사유 명시 */ }', 'no-empty')).toBe(0)
    })
  })

  describe('R3: 명시 any 금지 (no-explicit-any)', () => {
    it('명시 any 타입 표기를 잡는다', () => {
      expect(hits('const x: any = 1', '@typescript-eslint/no-explicit-any')).toBeGreaterThan(0)
    })

    it('as any 단언도 잡는다', () => {
      expect(hits('const x = (1 as any)', '@typescript-eslint/no-explicit-any')).toBeGreaterThan(0)
    })
  })

  describe('config 정합 — 규칙이 eslint.config.js 에 실제 켜져 있다 (드리프트 1차 봉인)', () => {
    const flat = (Array.isArray(eslintConfig) ? eslintConfig[0] : eslintConfig) as {
      rules?: Record<string, unknown>
    }
    const cfgRules = flat.rules ?? {}

    it('세 영구 규칙이 모두 eslint.config.js 에 정의돼 있다', () => {
      expect(cfgRules['no-restricted-syntax']).toBeDefined()
      expect(cfgRules['no-empty']).toBeDefined()
      expect(cfgRules['@typescript-eslint/no-explicit-any']).toBeDefined()
    })

    it('깨끗한 코드는 위반 0', () => {
      expect(lint('export const x: number = 1\n')).toHaveLength(0)
    })
  })
})
