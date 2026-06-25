import { describe, it, expect } from 'vitest'
import { Linter } from 'eslint'
import tseslint from 'typescript-eslint'
import eslintConfig from '../eslint.config.js'

// 영구 코딩 규칙(RULES.md → eslint.config.js → verify lint 게이트 → receipt block #381)이
// 실제로 위반을 잡는지 fixture 로 고정한다. 검증 대상 3규칙은 모두 type-aware 불필요(문법 기반)
// 이라 Linter API(타입 정보 없이)로 단위 검증할 수 있다.
//   R1 no-restricted-syntax(execSync) · R2 no-empty(빈 catch) · R3 no-explicit-any(명시 any)
// 설계 결정도 회귀로 못박는다: 주석으로 사유를 밝힌 catch 는 통과 · execFileSync(safeExecFile 통로)는 허용.

// flat config 배열 전체에서 rules 병합 — 특정 항목 위치([0])에 의존하지 않음(CodeRabbit #395).
const configs = Array.isArray(eslintConfig) ? eslintConfig : [eslintConfig]
const mergedRules: Record<string, unknown> = {}
for (const c of configs) {
  const r = (c as { rules?: Record<string, unknown> }).rules
  if (r) Object.assign(mergedRules, r)
}

// ★동작 검증은 config 의 **실제 규칙 값**으로 한다(명시 복제값이 아니라). 그래서 config 가 약화되면
//   (no-empty 가 allowEmptyCatch:true 로 바뀌거나 selector 가 빠지거나 규칙이 삭제되면) 아래 동작
//   테스트가 직접 빨강이 된다 — 존재만 보는 toBeDefined 보다 강한 드리프트 봉인(CodeRabbit #395).
const TESTED_RULES = {
  'no-restricted-syntax': mergedRules['no-restricted-syntax'],
  'no-empty': mergedRules['no-empty'],
  '@typescript-eslint/no-explicit-any': mergedRules['@typescript-eslint/no-explicit-any'],
} as Linter.RulesRecord

function lint(code: string): Linter.LintMessage[] {
  const linter = new Linter()
  return linter.verify(code, {
    languageOptions: {
      parser: tseslint.parser as unknown as Linter.Parser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    // @typescript-eslint 플러그인 등록(no-explicit-any 제공). 타입 마찰만 회피.
    plugins: { '@typescript-eslint': tseslint.plugin as unknown as Linter.Plugin },
    rules: TESTED_RULES,
  })
}

function hits(code: string, ruleId: string): number {
  return lint(code).filter((m) => m.ruleId === ruleId).length
}

describe('영구 코딩 규칙 — ESLint 코드화 (RULES.md 자동 집행, config 실제 값으로 검증)', () => {
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

  describe('R2: 빈 catch 금지 (no-empty, allowEmptyCatch:false)', () => {
    it('완전 빈 catch 를 잡는다 — config 가 allowEmptyCatch:true 로 약화되면 이 테스트가 빨강', () => {
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

  describe('config 정합 — 규칙이 eslint.config.js 에 실제 켜져 있다 (드리프트 봉인)', () => {
    it('세 영구 규칙이 모두 eslint.config.js 에 정의돼 있다 (삭제 시 위 동작 테스트도 빨강)', () => {
      expect(mergedRules['no-restricted-syntax']).toBeDefined()
      expect(mergedRules['no-empty']).toBeDefined()
      expect(mergedRules['@typescript-eslint/no-explicit-any']).toBeDefined()
    })

    it('깨끗한 코드는 위반 0', () => {
      expect(lint('export const x: number = 1\n')).toHaveLength(0)
    })
  })
})
