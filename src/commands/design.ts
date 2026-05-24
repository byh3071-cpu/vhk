import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import chalk from 'chalk'
import inquirer from 'inquirer'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'

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

  const targetPath = hasTailwind() ? 'src/styles/vhk-colors.ts' : 'src/styles/tokens.css'
  const content = hasTailwind() ? generateTailwindExtend(palette) : generateCSSTokens(palette)

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

  if (hasTailwind()) {
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
