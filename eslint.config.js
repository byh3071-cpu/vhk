import tseslint from 'typescript-eslint'

// 최소 type-aware 린트 — async 안전성 위주(floating/misused promise). 스타일 룰은 의도적으로 제외
// (솔로 유지비·노이즈 최소화). tsc(strict) 와 역할 분리: 타입은 tsc, "잊은 await" 류는 eslint.
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
  },
})
