import inquirer from 'inquirer'
import type { DistinctQuestion } from 'inquirer'
import chalk from 'chalk'
import fs from 'node:fs'
import path from 'node:path'
import { CLAUDE_MD_TEMPLATE } from '../templates/claude-md.js'
import { CURSORRULES_TEMPLATE } from '../templates/cursorrules.js'
import { RULES_MD_TEMPLATE } from '../templates/rules-md.js'
import { PRD_TEMPLATE } from '../templates/prd.js'
import { ARCHITECTURE_TEMPLATE } from '../templates/architecture.js'
import { ADR_TEMPLATE } from '../templates/adr-template.js'
import { COMMANDS_MD_TEMPLATE } from '../templates/commands-md.js'
import { VHK_README_TEMPLATE, VHK_CONTEXT_SEED, VHK_GITIGNORE_TEMPLATE, VHK_IGNORE_TEMPLATE } from '../templates/vhk-dir.js'
import { ko } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { printSecurityWarnings } from '../lib/check-secure.js'
import { log } from '../utils/logger.js'
import { writeFile, fileExists } from '../utils/file.js'
import { fetchPrdFromNotion } from '../notion/fetch-prd.js'
import type { PrdContent } from '../types/prd.js'
import { readJsonFile } from '../lib/read-json.js'
import { detectExistingRuleFiles, buildAdoptedRules } from '../lib/rules-import.js'

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
  fromNotion?: string
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

async function collectAnswers(
  options: InitOptions,
  defaults: Partial<ProjectAnswers> = {}
): Promise<ProjectAnswers> {
  const prompts: DistinctQuestion[] = []

  if (!options.name && !defaults.name) {
    prompts.push({ type: 'input', name: 'name', message: ko.init.projectName })
  }
  if (!options.description && !defaults.description) {
    prompts.push({ type: 'input', name: 'description', message: ko.init.description })
  }
  if (!options.type && !defaults.type) {
    prompts.push({ type: 'list', name: 'type', message: ko.init.projectType, choices: PROJECT_TYPES })
  }

  const prompted = prompts.length ? await inquirer.prompt(prompts) : {}

  return {
    name: options.name ?? defaults.name ?? prompted.name,
    description: options.description ?? defaults.description ?? prompted.description,
    type: resolveType(options.type ?? defaults.type ?? prompted.type) ?? prompted.type,
  }
}

export async function init(options: InitOptions = {}) {
  const skipGate = Boolean(options.skipGate || options.fromNotion)

  if (skipGate) {
    console.log(chalk.dim(`\n${ko.init.skipGate}\n`))
  }

  console.log(chalk.bold(`\n${ko.init.title}\n`))
  printSecurityWarnings()

  let prdContent: Partial<PrdContent> = {}
  const defaults: Partial<ProjectAnswers> = {}

  if (options.fromNotion) {
    log.step(ko.init.notionFetching)
    try {
      const notion = await fetchPrdFromNotion(options.fromNotion)
      prdContent = notion.prd
      defaults.name = notion.projectName
      defaults.description = notion.prd.tagline
      log.success(ko.init.notionDone(notion.projectName))
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    }
  }

  const answers = await collectAnswers(options, defaults)

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

  // adopt 모드(브라운필드) — 기존 도구별 규칙 파일을 RULES.md(SoT)로 가져오기 제안.
  // 비대화형(--yes/notion)은 건너뛰고 greenfield 템플릿 RULES.md 를 그대로 쓴다.
  let adoptedRules: string | null = null
  if (!options.yes && !options.fromNotion) {
    const existingRules = detectExistingRuleFiles(cwd)
    if (existingRules.length > 0) {
      const { adopt } = await inquirer.prompt([{
        type: 'confirm',
        name: 'adopt',
        message: ko.init.adoptPrompt(
          existingRules.length,
          existingRules.map(f => f.path).join(', ')
        ),
        default: true,
      }])
      if (adopt) {
        adoptedRules = buildAdoptedRules(existingRules, answers.name)
        console.log(chalk.dim(`  ${ko.init.adoptPreview(existingRules.length)}`))
      }
    }
  }

  const files = generateFiles(answers.name, answers.description, stack, prdContent, answers.type)
  // adopt 채택 시 greenfield 템플릿 RULES.md 를 병합본으로 교체.
  if (adoptedRules) files['RULES.md'] = adoptedRules

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

  await writeInitExtras(cwd)

  console.log(chalk.bold.green(`\n${ko.init.done}`))
  console.log(chalk.dim(`\n${ko.init.nextSteps}`))
  if (options.fromNotion) {
    console.log(`  1. ${ko.init.notionReviewHint}`)
    console.log(`  2. ${ko.init.gitHintLabel}`)
    console.log(`     ${chalk.cyan(ko.init.gitHintCommand)}`)
    console.log(`  3. ${ko.init.startDev}\n`)
  } else {
    console.log(`  1. ${ko.init.fillHint}`)
    console.log(`  2. ${ko.init.prdHint}`)
    console.log(`  3. ${ko.init.gitHintLabel}`)
    console.log(`     ${chalk.cyan(ko.init.gitHintCommand)}`)
    console.log(`  4. ${ko.init.startDev}\n`)
  }

  printNextStep({
    message: '프로젝트 뼈대 완성! 이제 개발을 시작하세요.',
    command: `cd ${cwd}`,
    cursorHint: 'docs/PRD.md 열고 개발 시작해줘',
    alternative: 'VS Code/Cursor에서 폴더를 열어도 됩니다',
  })
}

export function generateFiles(
  name: string,
  description: string,
  stack: string[],
  prdContent: Partial<PrdContent> = {},
  type = ''
): Record<string, string> {
  const stackStr = stack.join(' + ')
  const prd: Partial<PrdContent> = {
    tagline: description,
    ...prdContent,
  }

  return {
    'CLAUDE.md': CLAUDE_MD_TEMPLATE(name, stackStr),
    '.cursorrules': CURSORRULES_TEMPLATE(name, description, stackStr),
    // RULES.md — 규칙 SoT. init 이 항상 생성해 sync 와 흐름을 연결한다.
    'RULES.md': RULES_MD_TEMPLATE(name, description, stackStr),
    'docs/PRD.md': PRD_TEMPLATE(name, description, prd),
    'docs/ARCHITECTURE.md': ARCHITECTURE_TEMPLATE(name, stackStr),
    'docs/adr/ADR-000-template.md': ADR_TEMPLATE(),
    'docs/log/.gitkeep': '',
    'docs/troubleshooting/.gitkeep': '',
    'docs/til.md': `# TIL (Today I Learned)\n\n- [${new Date().toISOString().split('T')[0]}] 프로젝트 시작\n`,
    'BACKLOG.md': `# BACKLOG\n\n> v1 OUT 기능은 여기에 기록. 범위 수비 필수.\n\n## v1.1 후보\n\n- \n`,
    // .vhk/ 씨앗 — 규격: docs/spec.md (spec_version 1.0)
    '.vhk/README.md': VHK_README_TEMPLATE(),
    '.vhk/context.md': VHK_CONTEXT_SEED(name, type || 'unknown', stack),
    '.vhk/.gitignore': VHK_GITIGNORE_TEMPLATE(),
    '.vhkignore': VHK_IGNORE_TEMPLATE(),
  }
}

const VHK_PACKAGE_SCRIPTS: Record<string, string> = {
  save: 'vhk save',
  check: 'vhk check',
  scan: 'vhk secure scan',
  recap: 'vhk recap',
  ship: 'vhk ship',
  doctor: 'vhk doctor',
}

/** 프로젝트 루트 .gitignore 기본 항목 (비밀·빌드 산출물 노출 방지) */
export const ROOT_GITIGNORE_ENTRIES = [
  '.env',
  '.env.local',
  '.env.*.local',
  'node_modules/',
  'dist/',
  '*.tsbuildinfo',
  '.DS_Store',
]

/**
 * 루트 .gitignore 보장 — 없으면 생성, 있으면 누락 항목만 append (기존 내용 보존).
 * 반환: 'created' | 'updated' | 'unchanged'
 */
export function ensureRootGitignore(projectDir: string): 'created' | 'updated' | 'unchanged' {
  const gitignorePath = path.join(projectDir, '.gitignore')

  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, ROOT_GITIGNORE_ENTRIES.join('\n') + '\n', 'utf-8')
    return 'created'
  }

  const content = fs.readFileSync(gitignorePath, 'utf-8')
  const existing = new Set(content.split('\n').map(l => l.trim()))
  const missing = ROOT_GITIGNORE_ENTRIES.filter(e => !existing.has(e))
  if (missing.length === 0) return 'unchanged'

  const prefix = content.endsWith('\n') ? '' : '\n'
  fs.appendFileSync(gitignorePath, `${prefix}\n# vhk init\n${missing.join('\n')}\n`, 'utf-8')
  return 'updated'
}

export function enhancePackageScripts(projectDir: string): boolean {
  const pkgPath = path.join(projectDir, 'package.json')
  if (!fs.existsSync(pkgPath)) return false

  const pkg = readJsonFile<{ scripts?: Record<string, string> }>(pkgPath)
  // 사용자가 정의한 동명 스크립트 보존. 누락된 키만 추가.
  pkg.scripts = { ...VHK_PACKAGE_SCRIPTS, ...pkg.scripts }
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
  return true
}

async function writeInitExtras(projectDir: string) {
  const commandsPath = path.join(projectDir, 'COMMANDS.md')

  if (fileExists(commandsPath)) {
    const { overwrite } = await inquirer.prompt([{
      type: 'confirm',
      name: 'overwrite',
      message: ko.init.overwrite('COMMANDS.md'),
      default: false,
    }])
    if (!overwrite) {
      log.warn(ko.init.skipped('COMMANDS.md'))
    } else {
      writeFile(commandsPath, COMMANDS_MD_TEMPLATE())
      log.success(ko.init.commandsMdDone)
    }
  } else {
    writeFile(commandsPath, COMMANDS_MD_TEMPLATE())
    log.success(ko.init.commandsMdDone)
  }

  if (enhancePackageScripts(projectDir)) {
    log.success(ko.init.scriptsDone)
  }

  const gitignoreResult = ensureRootGitignore(projectDir)
  if (gitignoreResult === 'created') {
    log.success(ko.init.gitignoreCreated)
  } else if (gitignoreResult === 'updated') {
    log.success(ko.init.gitignoreUpdated)
  }
}
