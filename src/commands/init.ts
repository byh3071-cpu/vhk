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
import { RFC_README_TEMPLATE, PATTERNS_README_TEMPLATE } from '../templates/docs-readme.js'
import { CUSTOMIZATION_HOOK_TEMPLATE } from '../templates/customization-hook.js'
import { RECORD_CHECK_TEMPLATE } from '../templates/record-hook.js'
import { installRecordCommitMsgHook } from '../lib/record-hook.js'
import { ensureCursorSessionStartHook } from '../lib/cursor-hooks.js'
import { COMMANDS_MD_TEMPLATE } from '../templates/commands-md.js'
import { VHK_README_TEMPLATE, VHK_CONTEXT_SEED, VHK_GITIGNORE_TEMPLATE, VHK_GITATTRIBUTES_TEMPLATE, VHK_IGNORE_TEMPLATE } from '../templates/vhk-dir.js'
import { ko } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { printSecurityWarnings } from '../lib/check-secure.js'
import { log } from '../utils/logger.js'
import { writeFile, fileExists } from '../utils/file.js'
import { generateCoreRulesContent, loadCoreRuleset } from '../lib/core-rules.js'
import { generateEcosystemMdcContent } from '../lib/inject-bootstrap.js'
import { VISION_TEMPLATE } from '../templates/vision.js'
import { fetchPrdFromNotion } from '../notion/fetch-prd.js'
import type { PrdContent } from '../types/prd.js'
import { readJsonFile } from '../lib/read-json.js'
import { detectExistingRuleFiles, buildAdoptedRules } from '../lib/rules-import.js'
import { syncCore } from './sync.js'
import { collectInstallReceipt, formatInstallReceipt } from '../lib/install-receipt.js'
import { detectProjectStack, detectManifestLangs } from '../lib/stack-detect.js'
import { isInteractive } from '../lib/interactive.js'
import { scaffoldMission, writeMission, readMission, MISSION_PATH_REL } from './mission.js'
import { upsertRulesStackSection, type StackStatus } from '../lib/stack-state.js'
import { CI_WORKFLOW_TEMPLATE } from '../templates/ci-workflow.js'
import { getVhkVersion } from '../lib/version.js'

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
 * ① 명시적 --stack → 확정값
 * ② JS deps 감지 → 비-JS 매니페스트 언어 병합 (Tauri = React + Rust)
 * ③ 프리셋 있는 타입 → 프리셋 (떠돌이 매니페스트가 명시적 --type 을 silent 대체하지 않도록)
 * ④ 프리셋 없는 타입(other) → 매니페스트 언어 (Cargo.toml→Rust 등), 없으면 [] → 직접 입력/미정
 */
export function resolveInitStack(
  cwd: string,
  type: string,
  explicitStack?: string
): { stack: string[]; detected: boolean; status: StackStatus; source: 'explicit' | 'detected' | 'preset' | 'undecided' } {
  const explicit = parseStackInput(explicitStack)
  if (explicit.length > 0) {
    return { stack: explicit, detected: false, status: 'confirmed', source: 'explicit' }
  }
  const js = detectProjectStack(cwd)
  if (js) {
    return {
      stack: [...js, ...detectManifestLangs(cwd)],
      detected: true,
      status: 'candidate',
      source: 'detected',
    }
  }
  const preset = STACK_PRESETS[type] ?? []
  if (preset.length) {
    return { stack: preset, detected: false, status: 'candidate', source: 'preset' }
  }
  const manifest = detectManifestLangs(cwd)
  return {
    stack: manifest,
    detected: manifest.length > 0,
    status: 'candidate',
    source: manifest.length > 0 ? 'detected' : 'undecided',
  }
}

export type InitOptions = {
  skipGate?: boolean
  ci?: boolean
  name?: string
  description?: string
  type?: string
  stack?: string
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
  const resolved = resolveInitStack(process.cwd(), answers.type, options.stack)
  let stack = resolved.stack
  let stackStatus = resolved.status
  let stackLabel = stackStatus === 'confirmed' ? ko.init.confirmedStack : ko.init.candidateStack
  if (options.stack !== undefined && resolved.source !== 'explicit') {
    log.warn(ko.init.emptyStack)
  }
  if (resolved.detected) console.log(chalk.dim('  🔎 프로젝트 매니페스트에서 실제 스택 감지'))

  // 기타(other) 등 프리셋 없는 타입 — 대화형이면 직접 입력(Enter=건너뛰기), 비대화형이면 미정.
  if (stack.length === 0) {
    if (isInteractive(options)) {
      const { customStack } = await prompt([{
        type: 'input', name: 'customStack', message: ko.init.stackInput,
      }])
      stack = parseStackInput(customStack)
    }
    stackLabel = ko.init.candidateStack
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
  if (isInteractive(options) && !stackUndecided && stackStatus === 'candidate') {
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
      stackStatus = 'confirmed'
      console.log(chalk.dim(`\n${ko.init.confirmedStack} ${stack.join(' + ')}\n`))
    } else {
      stackStatus = 'confirmed'
    }
  }

  const cwd = process.cwd()

  // adopt 모드(브라운필드) — 기존 도구별 규칙 파일을 RULES.md(SoT)로 가져온다.
  let adoptedRules: string | null = null
  // RFC 0060 T3: 자동 sync 는 "덮을 남의 파일이 없을 때(그린필드)"거나 "사용자가 adopt 를 승인"했을
  // 때만 켠다. 브라운필드에서 adopt 를 거절하면 false → 기존 도구 규칙 파일을 건드리지 않는다.
  let allowAutoSync = false
  if (!options.fromNotion) {
    const existingRules = detectExistingRuleFiles(cwd)
    if (existingRules.length === 0) {
      allowAutoSync = true
    } else {
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
          try {
            adoptedRules = buildAdoptedRules(existingRules, answers.name)
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error)
            log.error(ko.init.adoptIntegrityFailed(detail))
            process.exitCode = 1
            return
          }
          allowAutoSync = true
          console.log(chalk.dim(`  ${ko.init.adoptPreview(existingRules.length)}`))
        }
      } else if (!fileExists(path.join(cwd, 'RULES.md'))) {
        // #132: 비대화형(-y)에서도 RULES.md 가 아직 없으면 기존 규칙을 자동 adopt.
        // thin 템플릿이 SoT 가 돼 알맹이 .cursorrules/CLAUDE.md 를 빈약하게 덮어쓰는 함정 방지.
        // (RULES.md 가 이미 있으면 건드리지 않음 — 아래 write 루프가 보존.)
        try {
          adoptedRules = buildAdoptedRules(existingRules, answers.name)
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          log.error(ko.init.adoptIntegrityFailed(detail))
          process.exitCode = 1
          return
        }
        allowAutoSync = true
        console.log(
          chalk.cyan(`  기존 규칙 파일 ${existingRules.length}개 감지 → RULES.md 로 자동 병합(adopt)`)
        )
        console.log(chalk.dim(`  ${ko.init.adoptPreview(existingRules.length)}`))
      }
    }
  }

  if (options.fromNotion) {
    // fromNotion = 노션 PRD 로 새로 만든 프로젝트 → 그린필드 취급(덮을 남의 파일 없음).
    allowAutoSync = true
  }

  const files = generateFiles(
    answers.name,
    answers.description,
    stack,
    prdContent,
    answers.type,
    stackStatus,
  )
  // adopt 채택 시 greenfield 템플릿 RULES.md 를 병합본으로 교체.
  if (adoptedRules) {
    files['RULES.md'] = upsertRulesStackSection(adoptedRules, stack, stackStatus)
  }

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

  if (options.ci) {
    const ciVersion = getVhkVersion()
    let ciResult: CiWorkflowInstallResult
    try {
      ciResult = installCiWorkflow(cwd, ciVersion)
    } catch (error) {
      log.error(ko.init.ciInstallFailed(error instanceof Error ? error.message : String(error)))
      process.exitCode = 1
      return
    }
    if (ciResult.status === 'created') {
      log.success(ko.init.ciCreated(ciResult.workflowPath))
    } else {
      log.warn(ko.init.ciExisting(ciResult.existingWorkflows))
      log.dim(ko.init.ciMergeHeader)
      for (const command of ko.init.ciMergeCommands(ciVersion)) log.list(command)
    }
    log.info(ko.init.ciRequiredCheckHint)
  }

  // 작업 계약(mission) 뼈대 — 이미 있으면 절대 덮어쓰지 않는다(조건부). isInteractive 분기 밖:
  // 비대화형 --yes 에서도 생성해 "미설정 0"(거짓 안전)을 없애고 work/receipt 가 합류 지점을 갖게 한다.
  // 선택 기능이라 실패(권한 등)해도 init 전체를 중단하지 않는다 — 경고만 (missionSet 과 동일 방어).
  const missionPath = path.join(cwd, MISSION_PATH_REL)
  if (!fileExists(missionPath)) {
    try {
      writeMission(cwd, scaffoldMission(answers.name))
      log.success(ko.init.missionScaffold)
    } catch (e) {
      log.warn(`${ko.init.missionScaffoldFailed} ${e instanceof Error ? e.message : String(e)}`)
    }
  } else if (readMission(cwd) === null) {
    // 파일은 있는데 손상(파싱 실패) → work 가 "없다"고 경고하는 혼동 방지용 별도 안내. 덮어쓰진 않음(보존).
    log.warn(ko.init.missionScaffoldCorrupt)
  }

  const coreRulesCheck = loadCoreRuleset()
  if (coreRulesCheck.warning) log.warn(coreRulesCheck.warning)
  if (coreRulesCheck.source === 'bundled') {
    log.warn(ko.init.coreRulesBundledWarn(coreRulesCheck.version))
  }

  // RFC 0060 T3: 그린필드/adopt 승인 시 자동 sync — RULES.md(SoT)에서 AGENTS.md 등 도구별
  // 규칙 파일을 즉시 파생(Codex·Zed 등이 첫 세션부터 규칙을 본다). syncCore 가 덮기 전 자동 백업하고,
  // 신규 파일은 항상 쓰되 drift 파일만 confirmOverwrite 로 확인한다(여기선 게이트 통과 → 허용).
  // 실패해도 init 산출물은 보존하고 경고만 — 사용자는 vhk sync 로 수동 복구 가능.
  if (allowAutoSync) {
    try {
      await syncCore(cwd, { yes: true }, async () => true)
      log.success('규칙 파생 완료 — AGENTS.md 등 도구별 규칙 파일 생성')
    } catch (e) {
      log.warn(`규칙 파생(sync) 실패 — 산출물은 보존됨. 수동 실행: vhk sync (${e instanceof Error ? e.message : String(e)})`)
    }
  }

  console.log(chalk.bold.green(`\n${ko.init.done}`))
  // RFC 0060 T3: 설치 점검 영수증 — "썼다"가 아니라 디스크에서 읽어 확인한 현황(거짓완료 금지).
  const receiptCoreRules = {
    source: coreRulesCheck.source,
    ...(coreRulesCheck.version === 'unknown' ? {} : { version: coreRulesCheck.version }),
  }
  console.log('\n' + formatInstallReceipt(collectInstallReceipt(cwd, receiptCoreRules)))
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
  type = '',
  stackStatus: StackStatus = 'confirmed'
): Record<string, string> {
  const stackStr = stack.join(' + ')
  const prd: Partial<PrdContent> = {
    tagline: description,
    ...prdContent,
  }
  const coreRules = loadCoreRuleset()

  return {
    'CLAUDE.md': CLAUDE_MD_TEMPLATE(name, stackStr, stackStatus),
    '.cursorrules': CURSORRULES_TEMPLATE(name, description, stackStr, stackStatus),
    // RULES.md — 규칙 SoT. init 이 항상 생성해 sync 와 흐름을 연결한다.
    'RULES.md': RULES_MD_TEMPLATE(name, description, stackStr, stackStatus),
    'docs/PRD.md': PRD_TEMPLATE(name, description, prd),
    'VISION.md': VISION_TEMPLATE(name, description),
    'docs/ARCHITECTURE.md': ARCHITECTURE_TEMPLATE(name, stackStr, stackStatus),
    'docs/adr/ADR-000-template.md': ADR_TEMPLATE(),
    'docs/rfc/README.md': RFC_README_TEMPLATE(),
    'docs/patterns/README.md': PATTERNS_README_TEMPLATE(),
    'docs/log/.gitkeep': '',
    'docs/troubleshooting/.gitkeep': '',
    'docs/til.md': `# TIL (Today I Learned)\n\n- [${localDate()}] 프로젝트 시작\n`, // VHK-019
    'BACKLOG.md': `# BACKLOG\n\n> v1 OUT 기능은 여기에 기록. 범위 수비 필수.\n\n## v1.1 후보\n\n- \n`,
    // .vhk/ 씨앗 — 규격: docs/spec.md (spec_version 1.1)
    '.vhk/README.md': VHK_README_TEMPLATE(),
    '.vhk/context.md': VHK_CONTEXT_SEED(name, type || 'unknown', stack, {
      source: coreRules.source,
      version: coreRules.version,
    }, stackStatus),
    '.vhk/.gitignore': VHK_GITIGNORE_TEMPLATE(),
    // 증거 원장(events·ledger)에 merge=union — 멀티PC append 분기 자동 병합(A축). 추적 유지 전제.
    '.vhk/.gitattributes': VHK_GITATTRIBUTES_TEMPLATE(),
    '.vhk/hooks/customization-check.mjs': CUSTOMIZATION_HOOK_TEMPLATE(),
    // RFC 0061 T1 — 기록 집행 판정 본체(버전관리). 배선은 writeInitExtras 의 commit-msg shim.
    '.vhk/hooks/record-check.mjs': RECORD_CHECK_TEMPLATE(),
    '.vhkignore': VHK_IGNORE_TEMPLATE(),
    // core-ruleset 마커블록 상속 — 사용자 지정 규칙이 있으면 적용하고, 없으면 번들 스냅샷을 쓴다.
    '.agents/CORE-RULES.md': generateCoreRulesContent(null),
    '.cursor/rules/ecosystem.mdc': generateEcosystemMdcContent(),
  }
}

export const CI_WORKFLOW_PATH_REL = '.github/workflows/vhk-gate.yml'

export type CiWorkflowInstallResult =
  | { status: 'created'; workflowPath: string; existingWorkflows: [] }
  | { status: 'existing'; workflowPath: string; existingWorkflows: string[] }

export function installCiWorkflow(projectDir: string, version: string): CiWorkflowInstallResult {
  const workflowsDir = path.join(projectDir, '.github', 'workflows')
  const existingWorkflows = fs.existsSync(workflowsDir)
    ? fs.readdirSync(workflowsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
        .map((entry) => `.github/workflows/${entry.name}`)
        .sort()
    : []

  if (existingWorkflows.length > 0) {
    return {
      status: 'existing',
      workflowPath: CI_WORKFLOW_PATH_REL,
      existingWorkflows,
    }
  }

  writeFile(path.join(projectDir, ...CI_WORKFLOW_PATH_REL.split('/')), CI_WORKFLOW_TEMPLATE(version))
  return {
    status: 'created',
    workflowPath: CI_WORKFLOW_PATH_REL,
    existingWorkflows: [],
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
  // `.agents/CORE-RULES.md` 는 개발자 **홈**의 범용 규칙 파일(VHK_RULES_FILE ·
  // ~/.vhk/config.json 의 rulesFile)에서 재생성된다. 즉 내용이 머신마다 다르고 개인 규칙
  // 원문이 그대로 실린다. 추적하면 그게 공개 저장소로 새고, 되돌리면 `vhk sync --check` 가
  // 영구 red 가 된다(둘 다 나쁜 선택지). 애초에 추적 대상이 아니다 — 프로젝트 공통 규칙은
  // RULES.md 가 담당한다.
  '.agents/CORE-RULES.md',
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
  // 트레일링 슬래시 정규화 — git 은 디렉터리에서 `node_modules` 와 `node_modules/` 를 동치로
  // 취급한다. ensureVhkIgnored 와 동일 정규화로 슬래시 변형만 다른 중복 추가를 막는다 (#326).
  const norm = (s: string): string => s.trim().replace(/\/$/, '')
  const existing = new Set(content.split('\n').map(norm))
  const missing = ROOT_GITIGNORE_ENTRIES.filter(e => !existing.has(norm(e)))
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

  if (ensureCustomizationMarker(projectDir)) {
    log.success(ko.init.customizationMarkerDone)
  }
  const hookResult = ensureSessionStartHook(projectDir)
  if (hookResult === 'created' || hookResult === 'merged') {
    log.success(ko.init.customizationHookWired)
  }

  // RFC 0057 §7 — Cursor 세션시작 훅(에이전트 불가지론). 같은 customization-check.mjs 를 --format cursor 로.
  // 선택 기능·fail-soft — 실패해도 init 중단 안 함(SessionStart 훅과 동일 방어).
  try {
    const cursorHook = ensureCursorSessionStartHook(projectDir)
    if (cursorHook === 'created' || cursorHook === 'merged') {
      log.success(ko.init.cursorHookWired)
    }
  } catch (e) {
    log.warn(`${ko.init.cursorHookFailed} ${e instanceof Error ? e.message : String(e)}`)
  }

  // RFC 0061 T1 — 기록 집행 커밋훅. git 이 실행하는 훅이라 도구 불가지론(어떤 에이전트 커밋도 잡음).
  // 선택 기능이라 실패(권한 등)해도 init 전체를 중단하지 않는다 — missionScaffold 와 동일 방어.
  try {
    const recordHook = installRecordCommitMsgHook(projectDir)
    if (recordHook === 'installed' || recordHook === 'updated') {
      log.success(ko.init.recordHookWired)
    } else if (recordHook === 'respected-existing') {
      log.warn(ko.init.recordHookRespected)
    } else if (recordHook === 'hooks-path-set') {
      log.warn(ko.init.recordHookHooksPath)
    } else {
      log.warn(ko.init.recordHookNoGit)
    }
  } catch (e) {
    log.warn(`${ko.init.recordHookFailed} ${e instanceof Error ? e.message : String(e)}`)
  }
}

/**
 * goal 89 — `.vhk/NEEDS_CUSTOMIZATION` 트립와이어 마커(내용 없음, HARD_STOP과 동일 패턴).
 * customization-done 이 이미 있으면 절대 재생성하지 않는다 — 인터뷰 끝난 프로젝트를 재우지 않는 게 핵심.
 * 반환: true = 새로 생성함(호출부가 로그 출력에 사용).
 */
export function ensureCustomizationMarker(projectDir: string): boolean {
  const vhkDir = path.join(projectDir, '.vhk')
  const needs = path.join(vhkDir, 'NEEDS_CUSTOMIZATION')
  const done = path.join(vhkDir, 'customization-done')
  if (fs.existsSync(done)) return false
  if (fs.existsSync(needs)) return false
  writeFile(needs, '')
  return true
}

// ${CLAUDE_PROJECT_DIR} — Claude Code 가 훅 실행 시 실제 프로젝트 루트로 동적 치환(공식 권장 패턴).
// 상대경로(cwd 의존)는 Claude Code 가 SessionStart 훅을 어떤 cwd 로 spawn 하는지 미보장이라
// "command not found"로 조용히 실패할 위험 — 절대경로이면서도 프로젝트 이동/클론에 안전하다.
// 큰따옴표로 전체 경로를 감쌈 — 프로젝트 경로에 공백(Windows에서 흔함, 예: "John Doe")이 있어도
// 셸이 단어분리하지 않게 보호(공식 문서 예시도 변수를 따옴표로 감쌈).
const CUSTOMIZATION_HOOK_CMD = 'node "${CLAUDE_PROJECT_DIR}/.vhk/hooks/customization-check.mjs"'
// 공식 문서의 SessionStart matcher 예시는 전부 단일값('startup'·'compact')뿐 — 파이프 OR가
// SessionStart 에서도 지원되는지 문서로 확정 안 됨. 단일값 2개 entry 로 분리해 트리거 전체가
// 조용히 안 뜰 위험을 원천 제거(startup/resume 은 상호배타적이라 중복 실행 없음).
const SESSION_START_ENTRIES = ['startup', 'resume'].map((matcher) => ({
  matcher,
  hooks: [{ type: 'command', command: CUSTOMIZATION_HOOK_CMD, timeout: 10 }],
}))

/**
 * goal 89 — 새 프로젝트의 .claude/settings.json 에 SessionStart 훅을 심는다.
 * 없으면 생성, 있으면 기존 내용(다른 훅·enabledPlugins 등) 보존하며 SessionStart 만 병합.
 * 손상된 JSON 이면 fail-soft(경고만, 파일 안 건드림) — init 전체를 막지 않는다.
 */
export function ensureSessionStartHook(
  projectDir: string
): 'created' | 'merged' | 'unchanged' | 'skipped' {
  const file = path.join(projectDir, '.claude', 'settings.json')

  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(
      file,
      JSON.stringify({ hooks: { SessionStart: SESSION_START_ENTRIES } }, null, 2) + '\n',
      'utf-8'
    )
    return 'created'
  }

  let parsed: unknown
  try {
    parsed = readJsonFile(file)
  } catch {
    log.warn(ko.init.customizationHookSkipped)
    return 'skipped'
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    log.warn(ko.init.customizationHookSkipped)
    return 'skipped'
  }
  const root = parsed as Record<string, unknown>
  if (root.hooks !== undefined && (typeof root.hooks !== 'object' || root.hooks === null || Array.isArray(root.hooks))) {
    log.warn(ko.init.customizationHookSkipped)
    return 'skipped'
  }
  const hooks = (root.hooks as Record<string, unknown> | undefined) ?? {}
  const ss = hooks.SessionStart
  if (ss !== undefined && !Array.isArray(ss)) {
    log.warn(ko.init.customizationHookSkipped)
    return 'skipped'
  }
  const arr = Array.isArray(ss) ? ss : []

  const already = arr.some((e) => {
    const inner = (e as { hooks?: unknown })?.hooks
    return (
      Array.isArray(inner) &&
      inner.some(
        (h) =>
          typeof (h as { command?: unknown })?.command === 'string' &&
          (h as { command: string }).command.includes('customization-check.mjs')
      )
    )
  })
  if (already) return 'unchanged'

  arr.push(...SESSION_START_ENTRIES)
  hooks.SessionStart = arr
  root.hooks = hooks
  fs.writeFileSync(file, JSON.stringify(root, null, 2) + '\n', 'utf-8')
  return 'merged'
}
