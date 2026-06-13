import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { readJsonFile } from './read-json.js'

type Deps = Record<string, string>

/**
 * package.json 의존성에서 실제 스택을 감지(목록). `vhk init`/`vhk context` 가
 * `--type` 프리셋 대신 진짜 deps 를 쓰도록 공유. (VHK-001) 감지 0이면 [].
 */
export function detectStackFromDeps(deps: Deps): string[] {
  const stack: string[] = []
  // 프레임워크 / 번들러
  if (deps.next) stack.push('Next.js')
  else if (deps.nuxt) stack.push('Nuxt')
  else if (deps.vite || deps['@vitejs/plugin-react']) stack.push('Vite')
  // UI 라이브러리
  if (deps.react) stack.push('React')
  else if (deps.vue) stack.push('Vue')
  else if (deps.svelte) stack.push('Svelte')
  // 언어 / 스타일
  if (deps.typescript) stack.push('TypeScript')
  if (deps.tailwindcss || deps['@tailwindcss/vite']) stack.push('Tailwind CSS')
  // 데이터 / 백엔드
  if (deps['@supabase/supabase-js'] || deps['@supabase/ssr']) stack.push('Supabase')
  if (deps['@prisma/client'] || deps.prisma) stack.push('Prisma')
  if (deps['drizzle-orm']) stack.push('Drizzle')
  // 자주 쓰는 핵심 라이브러리
  if (deps['@anthropic-ai/sdk']) stack.push('Anthropic SDK')
  if (deps.openai) stack.push('OpenAI SDK')
  if (deps.zod) stack.push('zod')
  if (deps['@tanstack/react-query']) stack.push('TanStack Query')
  return stack
}

/** 비-JS 매니페스트 파일 → 언어 매핑 (Rust OS·Go·Python 등 JS 밖 프로젝트 지원). */
const MANIFEST_LANGS: ReadonlyArray<readonly [string, string]> = [
  ['Cargo.toml', 'Rust'],
  ['go.mod', 'Go'],
  ['pyproject.toml', 'Python'],
  ['requirements.txt', 'Python'],
  ['Gemfile', 'Ruby'],
  ['build.zig', 'Zig'],
  ['CMakeLists.txt', 'C/C++'],
]

/** cwd 의 비-JS 매니페스트로 언어 감지(중복 제거). 없으면 []. */
export function detectManifestLangs(cwd = '.'): string[] {
  const langs = new Set<string>()
  for (const [file, lang] of MANIFEST_LANGS) {
    if (existsSync(join(cwd, file))) langs.add(lang)
  }
  return [...langs]
}

/**
 * cwd 의 package.json deps 로 스택 목록 감지. package.json 없거나 deps 0이거나
 * 알려진 스택 0이면 null → 호출자가 프리셋/`__FILL__` 로 폴백(추측 금지).
 * 주의: JS-only 유지 — theme(#158) 등이 null 여부를 "JS 프로젝트" 신호로 쓰므로
 * 비-JS 매니페스트를 여기 병합하면 안 된다(→ detectManifestLangs 별도 소비).
 */
export function detectProjectStack(cwd = '.'): string[] | null {
  let pkg: { dependencies?: Deps; devDependencies?: Deps }
  try {
    pkg = readJsonFile(join(cwd, 'package.json'))
  } catch {
    return null
  }
  const all: Deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
  if (Object.keys(all).length === 0) return null
  const stack = detectStackFromDeps(all)
  return stack.length ? stack : null
}
