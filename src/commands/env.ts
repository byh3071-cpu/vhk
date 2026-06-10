import { existsSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { ensureNotHardStopped } from '../lib/hard-stop-guard.js'

export function parseEnvKeys(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split('=')[0].trim())
    .filter(Boolean)
}

/**
 * dotenv 관례대로 값이 정의된 모든 env 파일에서 키를 union 한다.
 * `.env`, `.env.local`, `.env.<mode>`, `.env.<mode>.local` 등 — `.example`/`.sample`(템플릿)은 제외.
 * (VHK-009: `.env` 만 보고 `.env.local` 무시해 거짓 "누락" 나던 버그 수정.)
 */
export function loadDefinedEnvKeys(dir = '.'): string[] {
  const keys = new Set<string>()
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }
  for (const name of entries) {
    if (!name.startsWith('.env')) continue
    if (name.endsWith('.example') || name.endsWith('.sample')) continue
    try {
      for (const k of parseEnvKeys(readFileSync(join(dir, name), 'utf-8'))) keys.add(k)
    } catch {
      // 읽기 실패 파일은 건너뜀
    }
  }
  return [...keys]
}

// #247: 사용한 env 파일(.env 또는 .env.local)을 gitignore 에 보장 — 둘 다 시크릿 보유.
function ensureGitignore(envFile = '.env'): void {
  const gitignorePath = '.gitignore'
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8')
    if (!content.split('\n').some((l) => l.trim() === envFile)) {
      appendFileSync(gitignorePath, `\n${envFile}\n`)
      console.log(chalk.green(`\n🔒 .gitignore에 ${envFile} 추가됨`))
    }
  } else {
    writeFileSync(gitignorePath, `${envFile}\nnode_modules/\ndist/\n`)
    console.log(chalk.green(`\n🔒 .gitignore 생성 (${envFile} 포함)`))
  }
}

export async function env(): Promise<void> {
  if (!ensureNotHardStopped('env')) return // HARD_STOP 활성 시 .env.example/.gitignore 쓰기 차단
  console.log(chalk.bold('\n🔐 ' + t('env.title')))
  console.log(chalk.gray('─'.repeat(40)))

  // #247: .env 없으면 .env.local 폴백(Vercel/Vite 관례) — doctor 와 일관.
  const envFile = existsSync('.env') ? '.env' : existsSync('.env.local') ? '.env.local' : null
  if (!envFile) {
    console.log(chalk.yellow('\n⚠️  .env / .env.local 파일이 없습니다.'))
    console.log(chalk.gray('   .env 또는 .env.local 파일을 먼저 만들어주세요.'))
    return
  }

  const envContent = readFileSync(envFile, 'utf-8')
  const keys = parseEnvKeys(envContent)

  if (keys.length === 0) {
    console.log(chalk.yellow('\n📭 .env에 환경변수가 없습니다.'))
    return
  }

  const exampleContent = keys.map((k) => `${k}=`).join('\n') + '\n'
  writeFileSync('.env.example', exampleContent, 'utf-8')
  console.log(chalk.green(`\n✅ .env.example 생성 (${keys.length}개 키)`))
  keys.forEach((k) => console.log(chalk.gray(`   ${k}`)))

  ensureGitignore(envFile)

  printNextStep({
    message: '.env.example 생성 완료!',
    command: 'vhk env-check',
    cursorHint: '환경변수 점검해줘',
  })
}

export async function envCheck(): Promise<void> {
  console.log(chalk.bold('\n🔍 ' + t('env.checkTitle')))
  console.log(chalk.gray('─'.repeat(40)))

  if (!existsSync('.env.example')) {
    console.log(chalk.yellow('\n⚠️  .env.example이 없습니다. 먼저 vhk env를 실행하세요.'))
    return
  }

  const requiredKeys = parseEnvKeys(readFileSync('.env.example', 'utf-8'))
  // .env 뿐 아니라 .env.local / .env.*.local 까지 머지해 누락 판정(Vite 관례 시크릿 인식).
  const currentKeys = loadDefinedEnvKeys()

  const missing = requiredKeys.filter((k) => !currentKeys.includes(k))
  const extra = currentKeys.filter((k) => !requiredKeys.includes(k))

  console.log(chalk.cyan(`\n📋 필수 환경변수: ${requiredKeys.length}개`))

  if (missing.length === 0) {
    console.log(chalk.green('\n✅ 모든 필수 환경변수가 설정되어 있습니다!'))
  } else {
    console.log(chalk.red(`\n❌ 누락된 환경변수 (${missing.length}개):`))
    missing.forEach((k) => console.log(chalk.red(`   • ${k}`)))
    // 필수 변수 누락 → 비-0 종료(CI 게이트 의미). VHK-010.
    process.exitCode = 1
  }

  if (extra.length > 0) {
    console.log(chalk.yellow(`\n💡 .env.example에 없는 추가 변수 (${extra.length}개):`))
    extra.forEach((k) => console.log(chalk.yellow(`   • ${k}`)))
  }

  ensureGitignore()
}
