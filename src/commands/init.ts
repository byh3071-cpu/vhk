import inquirer from 'inquirer'
import chalk from 'chalk'
import path from 'node:path'
import { CLAUDE_MD_TEMPLATE } from '../templates/claude-md.js'
import { CURSORRULES_TEMPLATE } from '../templates/cursorrules.js'
import { PRD_TEMPLATE } from '../templates/prd.js'
import { ARCHITECTURE_TEMPLATE } from '../templates/architecture.js'
import { ADR_TEMPLATE } from '../templates/adr-template.js'
import { ko } from '../i18n/ko.js'
import { log } from '../utils/logger.js'
import { writeFile, fileExists } from '../utils/file.js'
import type { PrdContent } from '../types/prd.js'

const PROJECT_TYPES = [
  { name: '🌐 웹 앱 (Next.js + Supabase + Vercel)', value: 'webapp' },
  { name: '🔌 Chrome 확장 프로그램',                  value: 'extension' },
  { name: '⚙️ 자동화/CLI 도구',                      value: 'cli' },
  { name: '🤖 노션 통합/MCP 서버',                    value: 'notion' },
  { name: '📱 모바일 앱 (Flutter)',                    value: 'mobile' },
]

const VALID_TYPES = PROJECT_TYPES.map(t => t.value)

const STACK_PRESETS: Record<string, string[]> = {
  webapp:    ['Next.js', 'TypeScript', 'Tailwind CSS', 'shadcn/ui', 'Supabase', 'Vercel'],
  extension: ['Vite', 'TypeScript', '@crxjs/vite-plugin', 'Chrome Extension Manifest V3'],
  cli:       ['Node.js', 'TypeScript', 'commander', 'inquirer', 'chalk'],
  notion:    ['TypeScript', 'Notion API', 'MCP SDK'],
  mobile:    ['Flutter', 'Dart', 'Supabase'],
}

export type InitOptions = {
  skipGate?: boolean
  name?: string
  description?: string
  type?: string
  yes?: boolean
}

type ProjectAnswers = {
  name: string
  description: string
  type: string
}

function resolveType(type?: string): string | undefined {
  if (!type) return undefined
  if (!VALID_TYPES.includes(type)) {
    throw new Error(`유효하지 않은 type: ${type} (${VALID_TYPES.join(', ')})`)
  }
  return type
}

async function collectAnswers(options: InitOptions): Promise<ProjectAnswers> {
  const prompts: inquirer.DistinctQuestion[] = []

  if (!options.name) {
    prompts.push({ type: 'input', name: 'name', message: ko.init.projectName })
  }
  if (!options.description) {
    prompts.push({ type: 'input', name: 'description', message: ko.init.description })
  }
  if (!options.type) {
    prompts.push({ type: 'list', name: 'type', message: ko.init.projectType, choices: PROJECT_TYPES })
  }

  const prompted = prompts.length ? await inquirer.prompt(prompts) : {}

  return {
    name: options.name ?? prompted.name,
    description: options.description ?? prompted.description,
    type: resolveType(options.type ?? prompted.type) ?? prompted.type,
  }
}

export async function init(options: InitOptions = {}) {
  if (options.skipGate) {
    console.log(chalk.dim(`\n${ko.init.skipGate}\n`))
  }

  console.log(chalk.bold(`\n${ko.init.title}\n`))

  const answers = await collectAnswers(options)

  if (!answers.name || !answers.description || !answers.type) {
    log.error('프로젝트 이름, 설명, 유형이 모두 필요합니다.')
    process.exit(1)
  }

  const stack = STACK_PRESETS[answers.type]
  console.log(chalk.dim(`\n${ko.init.recommendedStack} ${stack.join(' + ')}\n`))

  if (!options.yes) {
    const { confirmStack } = await inquirer.prompt([{
      type: 'confirm', name: 'confirmStack',
      message: ko.init.confirmStack, default: true,
    }])

    if (!confirmStack) {
      log.warn(ko.init.canceled)
      return
    }
  }

  const cwd = process.cwd()
  const files = generateFiles(answers.name, answers.description, stack)

  log.step(ko.init.filesGenerating)
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(cwd, filePath)

    if (fileExists(fullPath)) {
      const { overwrite } = await inquirer.prompt([{
        type: 'confirm', name: 'overwrite',
        message: ko.init.overwrite(filePath),
        default: false,
      }])
      if (!overwrite) {
        log.warn(ko.init.skipped(filePath))
        continue
      }
    }

    writeFile(fullPath, content)
    log.success(filePath)
  }

  console.log(chalk.bold.green(`\n${ko.init.done}`))
  console.log(chalk.dim(`\n${ko.init.nextSteps}`))
  console.log(`  1. ${ko.init.fillHint}`)
  console.log(`  2. ${ko.init.prdHint}`)
  console.log(`  3. ${chalk.cyan(ko.init.gitHint)}`)
  console.log(`  4. ${ko.init.startDev}\n`)
}

export function generateFiles(
  name: string,
  description: string,
  stack: string[],
  prdContent: Partial<PrdContent> = {}
): Record<string, string> {
  const stackStr = stack.join(' + ')
  const prd: Partial<PrdContent> = {
    tagline: description,
    ...prdContent,
  }

  return {
    'CLAUDE.md': CLAUDE_MD_TEMPLATE(name, stackStr),
    '.cursorrules': CURSORRULES_TEMPLATE(name, description, stackStr),
    'docs/PRD.md': PRD_TEMPLATE(name, description, prd),
    'docs/ARCHITECTURE.md': ARCHITECTURE_TEMPLATE(name, stackStr),
    'docs/adr/ADR-000-template.md': ADR_TEMPLATE(),
    'docs/log/.gitkeep': '',
    'docs/troubleshooting/.gitkeep': '',
    'docs/til.md': `# TIL (Today I Learned)\n\n- [${new Date().toISOString().split('T')[0]}] 프로젝트 시작\n`,
    'BACKLOG.md': `# BACKLOG\n\n> v1 OUT 기능은 여기에 기록. 범위 수비 필수.\n\n## v1.1 후보\n\n- \n`,
  }
}
