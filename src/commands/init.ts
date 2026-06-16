import { prompt } from '../lib/prompt.js'
import type { DistinctQuestion } from 'inquirer'
import chalk from 'chalk'
import fs from 'node:fs'
import path from 'node:path'
import { localDate } from '../lib/date.js'
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
import { generateCoreRulesContent } from '../lib/core-rules.js'
import { VISION_TEMPLATE } from '../templates/vision.js'
import { fetchPrdFromNotion } from '../notion/fetch-prd.js'
import type { PrdContent } from '../types/prd.js'
import { readJsonFile } from '../lib/read-json.js'
import { detectExistingRuleFiles, buildAdoptedRules } from '../lib/rules-import.js'
import { detectProjectStack, detectManifestLangs } from '../lib/stack-detect.js'
import { isInteractive } from '../lib/interactive.js'

const PROJECT_TYPES = [
  { name: '🌐 웹 앱 (Next.js + Supabase + Vercel)', value: 'webapp' },
  { name: '🔌 Chrome 확장 프로그램',                  value: 'extension' },
  { name: '⚙️ 자동화/CLI 도구',                      value: 'cli' },
  { name: '🤖 노션 통합/MCP 서버',                    value: 'notion' },
  { name: '📱 모바일 앱 (Flutter)',                    value: 'mobile' },
  { name: '🧩 기타 — 직접 입력 (OS·게임·임베디드 등)', value: 'other' },
]

const VALID_TYPES = PROJECT_TYPES.map(t => t.value)

const STACK_PRESETS: Record<string, string[]> = {
  webapp:    ['Next.js', 'TypeScript', 'Tailwind CSS', 'shadcn/ui', 'Supabase', 'Vercel'],
  extension: ['Vite', 'TypeScript', '@crxjs/vite-plugin', 'Chrome Extension Manifest V3'],
  cli:       ['Node.js', 'TypeScript', 'commander', 'inquirer', 'chalk'],
  notion:    ['TypeScript', 'Notion API', 'MCP SDK'],
  mobile:    ['Flutter', 'Dart', 'Supabase'],
  other:     [], // 프리셋 없음 → 직접 입력(대화형) 또는 미정(비대화형)
}

/** 스택 미정 표시값 — 템플릿에 그대로 박혀 사용자가 나중에 채운다. */
export const STACK_UNDECIDED = '미정'

/**
 * "Rust, QEMU" 같은 자유 입력을 스택 목록으로 파싱. 빈 입력 → [].
 * 분리자는 쉼표 계열만(ASCII , + 전각 ， + 모점 、 — IME 입력 대응).
 * '+'/'/'/'·' 는 "C++"·"C/C++"·"CI·CD" 같은 항목을 망가뜨려 제외.
 */
export function parseStackInput(input?: string): string[] {
  if (!input) return []
  return input.split(/[,，、]/).map(s => s.trim()).filter(Boolean)
}

/**
 * init 의 스택 결정 (우선순위):
 * ① JS deps 감지 → 비-JS 매니페스트 언어 병합 (Tauri = React + Rust)
 * ② 프리셋 있는 타입 → 프리셋 (떠돌이 매니페스트가 명시적 --type 을 silent 대체하지 않도록)
 * ③ 프리셋 없는 타입(other) → 매니페스트 언어 (Cargo.toml→Rust 등), 없으면 [] → 직접 입력/미정
 */
export function resolveInitStack(
  cwd: string,
  type: string
): { stack: string[]; detected: boolean } {
  const js = detectProjectStack(cwd)
  if (js) return { stack: [...js, ...detectManifestLangs(cwd)], detected: true }
  const preset = STACK_PRESETS[type] ?? []
  if (preset.length) return { stack: preset, detected: false }
  const manifest = detectManifestLangs(cwd)
  return { stack: manifest, detected: manifest.length > 0 }
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

// VHK-021/Goal 8: -y(--yes) 또는 비대화형(비-TTY stdin/CI/파이프) 면 프롬프트 0개.
// 비대화형 판정 SoT = isInteractive(opts) (src/lib/interactive.ts) — stdin 축만 본다.
// (stdout 파이프는 더 이상 프롬프트를 막지 않음 — 자동화 출력 리다이렉트 허용.)
const DEFAULT_TYPE = PROJECT_TYPES[0].value // 'webapp'

async function collectAnswers(
  options: InitOptions,
  defaults: Partial<ProjectAnswers> = {}
): Promise<ProjectAnswers> {
  const noninteractive = !isInteractive(options)
  const prompts: DistinctQuestion[] = []

  // 비대화형이면 프롬프트를 만들지 않는다 → inquirer 호출 0회 → 멈춤/EOF 크래시 없음.
  if (!noninteractive) {
    if (!options.name && !defaults.name) {
      prompts.push({ type: 'input', name: 'name', message: ko.init.projectName })
    }
    if (!options.description && !defaults.description) {
      prompts.push({ type: 'input', name: 'description', message: ko.init.description })
    }
    if (!options.type && !defaults.type) {
      prompts.push({ type: 'list', name: 'type', message: ko.init.projectType, choices: PROJECT_TYPES })
    }
  }

  const prompted = prompts.length ? await prompt(prompts) : {}

  // 폴백(비대화형에서만 실제 발동 — 대화형이면 prompted 값이 채워져 있음):
  //   name → 현재 디렉토리명, description → name 기반, type → 기본 타입(webapp)
  // 빈 문자열('')도 폴백 대상이라 ?? 가 아니라 || 사용 (예: `init -y --name ""`).
  const fallbackName = path.basename(process.cwd()) || 'my-project'
  const name = options.name || defaults.name || prompted.name || fallbackName
  const description =
    options.description || defaults.description || prompted.description || `${name} — vhk 프로젝트`
  const type =
    resolveType(options.type || defaults.type || prompted.type) ?? prompted.type ?? DEFAULT_TYPE

  return { name, description, type }
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

  // VHK-001: 기존 프로젝트면 실제 스택 감지(프리셋 하드코딩 대신) — 우선순위는 resolveInitStack 참조.
  const resolved = resolveInitStack(process.cwd(), answers.type)
  let stack = resolved.stack
  let stackLabel: string = ko.init.recommendedStack
  if (resolved.detected) console.log(chalk.dim('  🔎 프로젝트 매니페스트에서 실제 스택 감지'))

  // 기타(other) 등 프리셋 없는 타입 — 대화형이면 직접 입력(Enter=건너뛰기), 비대화형이면 미정.
  if (stack.length === 0) {
    if (isInteractive(options)) {
      const { customStack } = await prompt([{
        type: 'input', name: 'customStack', message: ko.init.stackInput,
      }])
      stack = parseStackInput(customStack)
    }
    stackLabel = ko.init.chosenStack // 사용자 입력/미정 — '추천' 아님
    if (stack.length === 0) {
      stack = [STACK_UNDECIDED]
      console.log(chalk.dim(`  ${ko.init.stackSkipHint}`))
    }
  }

  console.log(chalk.dim(`\n${stackLabel} ${stack.join(' + ')}\n`))

  // 비대화형(yes/비-TTY)이면 confirmStack 프롬프트 skip — default(진행)로 자동 진행.
  // (이전엔 !options.yes 만 봐서 비-TTY+무-yes 에서 EOF 멈춤 — Goal 8 비대화형 계약 위반.)
  // 스택 미정(직접 건너뜀)이면 확인 무의미 → skip.
  const stackUndecided = stack.length === 1 && stack[0] === STACK_UNDECIDED
  if (isInteractive(options) && !stackUndecided) {
    const { confirmStack } = await prompt([{
      type: 'confirm', name: 'confirmStack',
      message: ko.init.confirmStack, default: true,
    }])

    if (!confirmStack) {
      // 거절 = 즉시 취소가 아니라 직접 입력 기회 (Enter = 기존처럼 취소).
      const { customStack } = await prompt([{
        type: 'input', name: 'customStack', message: ko.init.stackEdit,
      }])
      const edited = parseStackInput(customStack)
      if (edited.length === 0) {
        log.warn(ko.init.canceled)
        return
      }
      stack = edited
      console.log(chalk.dim(`\n${ko.init.chosenStack} ${stack.join(' + ')}\n`))
    }
  }

  const cwd = process.cwd()

  // adopt 모드(브라운필드) — 기존 도구별 규칙 파일을 RULES.md(SoT)로 가져온다.
  let adoptedRules: string | null = null
  if (!options.fromNotion) {
    const existingRules = detectExistingRuleFiles(cwd)
    if (existingRules.length > 0) {
      if (isInteractive(options)) {
        const { adopt } = await prompt([{
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
      } else if (!fileExists(path.join(cwd, 'RULES.md'))) {
        // #132: 비대화형(-y)에서도 RULES.md 가 아직 없으면 기존 규칙을 자동 adopt.
        // thin 템플릿이 SoT 가 돼 알맹이 .cursorrules/CLAUDE.md 를 빈약하게 덮어쓰는 함정 방지.
        // (RULES.md 가 이미 있으면 건드리지 않음 — 아래 write 루프가 보존.)
        adoptedRules = buildAdoptedRules(existingRules, answers.name)
        console.log(
          chalk.cyan(`  기존 규칙 파일 ${existingRules.length}개 감지 → RULES.md 로 자동 병합(adopt)`)
        )
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
      // 비대화형이면 프롬프트 default(=false, 보존) 자동 적용 — 기존 파일 클로버 금지.
      const overwrite = !isInteractive(options)
        ? false
        : (await prompt([{
            type: 'confirm', name: 'overwrite',
            message: ko.init.overwrite(filePath),
            default: false,
          }])).overwrite
      if (!overwrite) {
        log.warn(ko.init.skipped(filePath))
        continue
      }
    }

    writeFile(fullPath, content)
    log.success(filePath)
  }

  await writeInitExtras(cwd, !isInteractive(options))

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
    'VISION.md': VISION_TEMPLATE(name, description),
    'docs/ARCHITECTURE.md': ARCHITECTURE_TEMPLATE(name, stackStr),
    'docs/adr/ADR-000-template.md': ADR_TEMPLATE(),
    'docs/log/.gitkeep': '',
    'docs/troubleshooting/.gitkeep': '',
    'docs/til.md': `# TIL (Today I Learned)\n\n- [${localDate()}] 프로젝트 시작\n`, // VHK-019
    'BACKLOG.md': `# BACKLOG\n\n> v1 OUT 기능은 여기에 기록. 범위 수비 필수.\n\n## v1.1 후보\n\n- \n`,
    // .vhk/ 씨앗 — 규격: docs/spec.md (spec_version 1.1)
    '.vhk/README.md': VHK_README_TEMPLATE(),
    '.vhk/context.md': VHK_CONTEXT_SEED(name, type || 'unknown', stack),
    '.vhk/.gitignore': VHK_GITIGNORE_TEMPLATE(),
    '.vhkignore': VHK_IGNORE_TEMPLATE(),
    // core-ruleset 마커블록 상속 — PRIVATE_RULES_ROOT 있으면 라이브, 없으면 번들 스냅샷
    '.agents/CORE-RULES.md': generateCoreRulesContent(null),
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

/** VHK-008: COMMANDS.md 가 실제 존재하는 test 스크립트만 안내하도록 package.json 감지. */
function projectHasTestScript(projectDir: string): boolean {
  const pkgPath = path.join(projectDir, 'package.json')
  if (!fs.existsSync(pkgPath)) return false
  try {
    const pkg = readJsonFile<{ scripts?: Record<string, string> }>(pkgPath)
    return Boolean(pkg.scripts?.test?.trim())
  } catch {
    return false
  }
}

async function writeInitExtras(projectDir: string, noninteractive = false) {
  const commandsPath = path.join(projectDir, 'COMMANDS.md')
  const hasTest = projectHasTestScript(projectDir)

  if (fileExists(commandsPath)) {
    // 비대화형이면 프롬프트 default(=false, 보존) 자동 적용.
    const overwrite = noninteractive
      ? false
      : (await prompt([{
          type: 'confirm',
          name: 'overwrite',
          message: ko.init.overwrite('COMMANDS.md'),
          default: false,
        }])).overwrite
    if (!overwrite) {
      log.warn(ko.init.skipped('COMMANDS.md'))
    } else {
      writeFile(commandsPath, COMMANDS_MD_TEMPLATE({ hasTest }))
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
