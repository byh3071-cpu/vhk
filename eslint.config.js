import tseslint from 'typescript-eslint'

// type-aware 결함 린트 — tsc(strict) 가 못 잡는 "진짜 결함"만 잡는다. 스타일 룰은 의도적으로 제외
// (솔로 유지비·노이즈 최소화). 역할 분리: 타입·미사용·암묵return·fallthrough 는 tsc, 아래는 eslint.
// Goal 49: async 3룰에서 type-aware 결함 룰로 확대(switch 누락 케이스 등). 스타일이 아닌 결함만.
export default tseslint.config({
  files: ['src/**/*.ts'],
  // 이 최소 config 가 켜지 않은 코어 룰(no-control-regex 등)용 disable 주석을 "미사용"으로 깎지 않음.
  linterOptions: { reportUnusedDisableDirectives: 'off' },
  plugins: { '@typescript-eslint': tseslint.plugin },
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
  },
  rules: {
    // "잊은 await"(미처리 reject·조건문에 Promise 오용·non-thenable await) 만 잡는다.
    // require-await 는 의도적으로 제외 — MCP SDK 핸들러는 await 없어도 async 가 계약이라 노이즈만 큼.
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    // Goal 49 확대 — tsc 가 못 잡는 type-aware 결함:
    // union switch 의 누락 케이스(noFallthroughCasesInSwitch 와 별개 — 빠진 멤버를 잡음).
    '@typescript-eslint/switch-exhaustiveness-check': 'error',
    // 잘못된 가정 신호 — 불필관리자 `as`(타입이 이미 그 형이라 단언이 무의미·위험).
    '@typescript-eslint/no-unnecessary-type-assertion': 'error',
    // `${obj}` 가 "[object Object]" 로 직렬화되는 결함.
    '@typescript-eslint/no-base-to-string': 'error',
    // Promise reject 는 Error 로(문자열 reject 는 스택 없는 디버깅 지옥).
    '@typescript-eslint/prefer-promise-reject-errors': 'error',

    // ── 영구 코딩 규칙 코드화 (RULES.md → 자동 집행 → verify lint 게이트 → receipt block #381) ──
    // RULES.md: `execSync` 신규 사용 금지 → `safeExecFile` 사용. execFileSync(safeExecFile 내부 통로)는 허용 — execSync 만 차단.
    'no-restricted-syntax': [
      'error',
      {
        selector: "CallExpression[callee.name='execSync']",
        message: 'execSync 신규 사용 금지 → safeExecFile 사용 (RULES.md 코딩 규칙)',
      },
      {
        selector: "MemberExpression[property.name='execSync']",
        message: 'execSync 신규 사용 금지 → safeExecFile 사용 (RULES.md 코딩 규칙)',
      },
    ],
    // RULES.md: try-catch 필수, 빈 catch 금지. 주석으로 무시 사유를 밝힌 catch 는 통과(no-empty 기본).
    'no-empty': ['error', { allowEmptyCatch: false }],
    // RULES.md: TypeScript strict (any 금지) — tsc strict 는 implicit any 만, 명시 `: any`/`as any` 는 여기서 차단.
    '@typescript-eslint/no-explicit-any': 'error',
  },
})
