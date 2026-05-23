import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/mcp/index.ts'],
  format: ['esm'],
  tsconfig: 'tsconfig.build.json',
  dts: { entry: ['src/index.ts'] },
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
});
