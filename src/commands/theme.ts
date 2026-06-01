import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import chalk from 'chalk'
import inquirer from 'inquirer'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { promptOrDefault } from '../lib/interactive.js'

function generateDarkCSS(): string {
  return `/* vhk theme — 다크/라이트 모드 CSS 변수 */

@media (prefers-color-scheme: dark) {
  :root {
    --color-background: #0f172a;
    --color-surface: #1e293b;
    --color-text: #f1f5f9;
    --color-muted: #64748b;
  }
}

[data-theme="dark"] {
  --color-background: #0f172a;
  --color-surface: #1e293b;
  --color-text: #f1f5f9;
  --color-muted: #64748b;
}

[data-theme="light"] {
  --color-background: #ffffff;
  --color-surface: #f9fafb;
  --color-text: #111827;
  --color-muted: #9ca3af;
}
`
}

function generateToggleUtil(): string {
  return `// vhk theme — 다크/라이트 모드 토글 유틸리티

export function getTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  const stored = localStorage.getItem('vhk-theme') as 'light' | 'dark' | null
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function setTheme(theme: 'light' | 'dark'): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('vhk-theme', theme)
}

export function toggleTheme(): 'light' | 'dark' {
  const next = getTheme() === 'light' ? 'dark' : 'light'
  setTheme(next)
  return next
}

export function initTheme(): void {
  setTheme(getTheme())
}
`
}

export async function theme(options?: { yes?: boolean }): Promise<void> {
  console.log(chalk.bold('\n🌙 ' + t('theme.title')))
  console.log(chalk.gray('─'.repeat(40)))

  const cssPath = 'src/styles/theme.css'
  const togglePath = 'src/lib/theme-toggle.ts'
  const conflicts = [cssPath, togglePath].filter((p) => existsSync(p))

  if (conflicts.length > 0) {
    // ① auto-default(benign): --yes 면 덮어쓰기, 비대화형(비-TTY)이면 stdin 미접근 → 기본 false(보존).
    // 비-TTY 에서 inquirer 를 호출하지 않아 MCP 파이프 안전(R19/E5) + 절대 안 멈춤.
    const overwrite = options?.yes === true
      ? true
      : await promptOrDefault(
          async () => (await inquirer.prompt<{ overwrite: boolean }>([{
            type: 'confirm',
            name: 'overwrite',
            message: `다음 파일이 이미 있어요. 덮어쓸까요?\n   ${conflicts.join('\n   ')}`,
            default: false,
          }])).overwrite,
          false,
        )
    if (!overwrite) {
      console.log(chalk.yellow('\n⏭️  생성 취소 — 기존 파일 유지. (비대화형이면 --yes 로 덮어쓰기)'))
      return
    }
  }

  mkdirSync('src/styles', { recursive: true })
  mkdirSync('src/lib', { recursive: true })

  writeFileSync(cssPath, generateDarkCSS(), 'utf-8')
  console.log(chalk.green('\n✅ src/styles/theme.css 생성 (다크/라이트 모드)'))

  writeFileSync(togglePath, generateToggleUtil(), 'utf-8')
  console.log(chalk.green('✅ src/lib/theme-toggle.ts 생성 (토글 유틸리티)'))

  console.log(chalk.bold('\n📖 사용법:'))
  console.log(chalk.gray('   1. theme.css를 글로벌 스타일에 추가'))
  console.log(chalk.gray('   2. import { initTheme, toggleTheme } from "./lib/theme-toggle"'))
  console.log(chalk.gray('   3. 앱 진입점에서 initTheme() 호출'))
  console.log(chalk.gray('   4. 토글 버튼에서 toggleTheme() 호출'))

  printNextStep({
    message: '테마 설정 완료!',
    command: 'vhk ref list',
    cursorHint: '레퍼런스 확인해줘',
  })
}
