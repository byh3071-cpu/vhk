import { defineConfig } from 'tsup';

// Goal 54: 버전 단일 진실원천(SoT) = package.json.
//   README.md(frontmatter tag + 제목 blockquote)·CLAUDE.md 표기는 tests/version-sync.test.ts 가
//   package.json 과 동적 대조해 드리프트를 CI 에서 차단한다.
//   (런타임 빌드 주입은 스코프 아웃 — 현재는 가드 기반 정합으로 충분.)
export default defineConfig({
  entry: ['src/index.ts', 'src/mcp/index.ts'],
  format: ['esm'],
  tsconfig: 'tsconfig.build.json',
  dts: { entry: ['src/index.ts'] },
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
});
