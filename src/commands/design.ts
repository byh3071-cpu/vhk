import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import chalk from 'chalk'
import inquirer from 'inquirer'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { ensureInteractive } from '../lib/interactive.js'
import { readJsonFile } from '../lib/read-json.js'

interface ColorPalette {
  name: string
  colors: Record<string, string>
}

const PALETTES: ColorPalette[] = [
  {
    name: 'Minimal',
    colors: {
      primary: '#1a1a1a',
      secondary: '#6b7280',
      accent: '#3b82f6',
      background: '#ffffff',
      surface: '#f9fafb',
      text: '#111827',
      muted: '#9ca3af',
    },
  },
  {
    name: 'Vibrant',
    colors: {
      primary: '#7c3aed',
      secondary: '#ec4899',
      accent: '#f59e0b',
      background: '#ffffff',
      surface: '#faf5ff',
      text: '#1e1b4b',
      muted: '#8b5cf6',
    },
  },
  {
    name: 'Corporate',
    colors: {
      primary: '#1e40af',
      secondary: '#0f766e',
      accent: '#ca8a04',
      background: '#ffffff',
      surface: '#f0f9ff',
      text: '#0f172a',
      muted: '#64748b',
    },
  },
  {
    name: 'Pastel',
    colors: {
      primary: '#a78bfa',
      secondary: '#f9a8d4',
      accent: '#fcd34d',
      background: '#fffbeb',
      surface: '#fef3c7',
      text: '#44403c',
      muted: '#a8a29e',
    },
  },
]

function hasTailwind(): boolean {
  return (
    existsSync('tailwind.config.js') ||
    existsSync('tailwind.config.ts') ||
    existsSync('tailwind.config.mjs') ||
    existsSync('tailwind.config.cjs')
  )
}

/** Tailwind v4(CSS-first) 의존성 판정 — @tailwindcss/vite·postcss 또는 tailwindcss ^4. (VHK-018) */
export function isTailwindV4Deps(deps: Record<string, string>): boolean {
  if (deps['@tailwindcss/vite'] || deps['@tailwindcss/postcss']) return true
  const tw = deps.tailwindcss
  return typeof tw === 'string' && /^\D*4(\.|$)/.test(tw)
}

function hasTailwindV4(): boolean {
  try {
    const pkg = readJsonFile<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>(
      'package.json'
    )
    return isTailwindV4Deps({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) })
  } catch {
    return false
  }
}

/** Tailwind v4 CSS-first 토큰 — `@theme` 등록 + `@custom-variant dark`. 유틸(bg-primary 등) 생성됨. */
export function generateTailwindV4Theme(palette: ColorPalette): string {
  return [
    '/* vhk design — Tailwind v4 @theme 토큰 (CSS-first). 진입 CSS 에 @import 하세요. */',
    '@import "tailwindcss";',
    '',
    '@theme {',
    ...Object.entries(palette.colors).map(([k, v]) => `  --color-${k}: ${v};`),
    '}',
    '',
    '/* 다크 모드 — .dark 클래스 기반 variant (bg-background 등이 .dark 에서 전환) */',
    '@custom-variant dark (&:where(.dark, .dark *));',
    '',
  ].join('\n')
}

function generateCSSTokens(palette: ColorPalette): string {
  const lines = Object.entries(palette.colors)
    .map(([key, value]) => `  --color-${key}: ${value};`)
    .join('\n')
  return `:root {\n${lines}\n}\n`
}

function generateTailwindExtend(palette: ColorPalette): string {
  const entries = Object.entries(palette.colors)
    .map(([key, value]) => `  '${key}': '${value}',`)
    .join('\n')
  return `// vhk design — Tailwind config 확장용 컬러 토큰\n// tailwind.config의 theme.extend.colors에 spread 하세요.\nconst vhkColors = {\n${entries}\n}\n\nexport default vhkColors\n`
}

export async function design(): Promise<void> {
  console.log(chalk.bold('\n🎨 ' + t('design.title')))
  console.log(chalk.gray('─'.repeat(40)))

  // VHK-014: 비-TTY 면 inquirer 크래시(ERR_USE_AFTER_CLOSE) 대신 friendly 안내 + exit 1.
  if (!ensureInteractive('컬러 팔레트 선택은 대화형으로만 가능합니다.')) return

  const { paletteIndex } = await inquirer.prompt<{ paletteIndex: number }>([
    {
      type: 'list',
      name: 'paletteIndex',
      message: t('design.selectPalette'),
      choices: PALETTES.map((p, i) => ({
        name: `${p.name} — primary ${p.colors.primary}`,
        value: i,
      })),
    },
  ])

  const palette = PALETTES[paletteIndex]
  console.log(chalk.cyan(`\n🎨 선택된 팔레트: ${palette.name}`))

  const v4 = hasTailwindV4()
  const targetPath = v4
    ? 'src/styles/theme.css'
    : hasTailwind()
      ? 'src/styles/vhk-colors.ts'
      : 'src/styles/tokens.css'
  const content = v4
    ? generateTailwindV4Theme(palette)
    : hasTailwind()
      ? generateTailwindExtend(palette)
      : generateCSSTokens(palette)

  if (existsSync(targetPath)) {
    const { overwrite } = await inquirer.prompt<{ overwrite: boolean }>([{
      type: 'confirm',
      name: 'overwrite',
      message: `${targetPath} 이미 있어요. 덮어쓸까요?`,
      default: false,
    }])
    if (!overwrite) {
      console.log(chalk.yellow('\n⏭️  생성 취소 — 기존 파일 유지.'))
      return
    }
  }

  mkdirSync('src/styles', { recursive: true })
  writeFileSync(targetPath, content, 'utf-8')

  if (v4) {
    console.log(chalk.green('\n✅ src/styles/theme.css 생성 (Tailwind v4 @theme)'))
    console.log(chalk.gray('   진입 CSS(예: src/index.css)에 `@import "./styles/theme.css";` 추가 → bg-primary 등 유틸 사용.'))
    console.log(chalk.gray('   다크 토글: 루트 <html>/<body> 에 `.dark` 클래스 on/off.'))
  } else if (hasTailwind()) {
    console.log(chalk.green('\n✅ src/styles/vhk-colors.ts 생성'))
    console.log(chalk.gray('   tailwind.config의 extend.colors에 import 해서 사용하세요.'))
  } else {
    console.log(chalk.green('\n✅ src/styles/tokens.css 생성'))
    console.log(chalk.gray('   HTML에 <link>로 추가하거나 CSS에서 @import 하세요.'))
  }

  console.log(chalk.bold('\n🌈 컬러 미리보기:'))
  for (const [key, value] of Object.entries(palette.colors)) {
    console.log(`   ${key.padEnd(12)} ${value}`)
  }

  printNextStep({
    message: '디자인 토큰 생성 완료!',
    command: 'vhk theme',
    cursorHint: '테마 설정해줘',
  })
}

export async function designPalette(): Promise<void> {
  await design()
}
