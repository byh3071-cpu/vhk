import chalk from 'chalk'
import fs from 'node:fs'
import path from 'node:path'
import inquirer from 'inquirer'
import { ko } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { normalizeForCompare } from '../lib/drift.js'
import { saveBackup, pruneBackups, ensureVhkIgnored } from '../lib/backup.js'

interface RulesSection {
  title: string
  content: string
}

const CURSORRULES_KEYS = ['코딩 규칙', '기술 스택', '아키텍처', '디자인', 'Anti-patterns', '커밋']
const CLAUDE_MD_KEYS = ['기록', '로그', 'ADR', '트러블슈팅', 'TIL', '/done', '체크리스트']

/**
 * RULES.md를 ## 기준으로 섹션 파싱
 */
export function parseRulesMd(content: string): RulesSection[] {
  const sections: RulesSection[] = []
  const lines = content.split('\n')
  let currentTitle = ''
  let currentContent: string[] = []

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentTitle) {
        sections.push({ title: currentTitle, content: currentContent.join('\n').trim() })
      }
      currentTitle = line.replace('## ', '').trim()
      currentContent = []
    } else {
      currentContent.push(line)
    }
  }

  if (currentTitle) {
    sections.push({ title: currentTitle, content: currentContent.join('\n').trim() })
  }

  return sections
}

/**
 * 코딩 규칙 문서 공통 빌더. 모든 도구별 규칙 파일(.cursorrules·.windsurfrules·
 * copilot·antigravity)이 동일 본문을 공유한다 — 헤더 제목만 다름.
 * 자동생성 경고 주석은 상단 헤더에 둬 직접 편집 시 덮어쓰기 신호를 준다.
 * (기존 .cursorrules/.windsurfrules 출력과 100% 동일 — GA 안정성 유지.)
 */
function buildCodingDoc(headerTitle: string, sections: RulesSection[], projectName: string): string {
  const codingSections = sections.filter(s =>
    CURSORRULES_KEYS.some(k => s.title.includes(k))
  )

  const lines = [
    `# ${projectName} — ${headerTitle}`,
    '',
    '> 코딩/디자인 전용. 기록/운영 → CLAUDE.md 참조.',
    '> ⚡ 이 파일은 RULES.md에서 자동 생성됨 (vhk sync). 직접 수정 금지.',
    '',
    '## 필수 참조',
    '- docs/PRD.md · docs/ARCHITECTURE.md · CLAUDE.md · RULES.md',
    '',
  ]

  for (const section of codingSections) {
    lines.push(`## ${section.title}`)
    lines.push(section.content)
    lines.push('')
  }

  return lines.join('\n')
}

/** RULES.md 섹션을 .cursorrules 포맷으로 변환 */
export function toCursorrules(sections: RulesSection[], projectName: string): string {
  return buildCodingDoc('Cursor Rules', sections, projectName)
}

/** RULES.md 섹션을 .windsurfrules 포맷으로 변환 (Windsurf/Cascade) */
export function toWindsurfrules(sections: RulesSection[], projectName: string): string {
  return buildCodingDoc('Windsurf Rules', sections, projectName)
}

/**
 * GitHub Copilot — 레포 전역 지침. 공식 경로 .github/copilot-instructions.md (Markdown).
 * 공식 문서상 하드 글자수 제한이 없어 절삭하지 않는다 (Antigravity 와 다른 점).
 */
export function toCopilotInstructions(sections: RulesSection[], projectName: string): string {
  return buildCodingDoc('GitHub Copilot Instructions', sections, projectName)
}

/**
 * Antigravity 규칙 파일 1개당 12,000 제한 (공식 docs는 "characters").
 * 측정 안전성: char/byte 어느 해석이든 안전하도록 **UTF-8 바이트 기준**으로 강제한다.
 * byteLength ≥ charCount 이므로 byteLength ≤ 12000 이면 char 수도 자동으로 ≤ 12000.
 * → 영어(1B/char)는 사실상 12,000자 그대로, 한글(3B/char)은 더 보수적으로 절삭(안전 방향).
 */
export const ANTIGRAVITY_CHAR_LIMIT = 12000
const ANTIGRAVITY_TRUNCATE_MARKER =
  '\n\n<!-- ⚠️ Antigravity 12,000자 제한으로 절삭됨 — 전체 규칙은 RULES.md 참조 -->\n'

/**
 * 12k 안전 절삭 — UTF-8 바이트 예산 안에서, 마크다운 구조 경계(## 헤딩, 없으면 직전 \n)에서 자른다.
 * 마커 바이트 + 안전마진을 예산에서 빼므로 결과는 항상 byteLength ≤ limit (테스트로 보장).
 */
export function truncateForAntigravity(
  content: string,
  limit = ANTIGRAVITY_CHAR_LIMIT
): string {
  if (Buffer.byteLength(content, 'utf8') <= limit) return content

  const SAFETY = 200 // 바이트 안전마진
  const budget = limit - Buffer.byteLength(ANTIGRAVITY_TRUNCATE_MARKER, 'utf8') - SAFETY

  // budget 바이트 이하인 최대 prefix 길이(char index)를 이진 탐색
  let lo = 0
  let hi = content.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (Buffer.byteLength(content.slice(0, mid), 'utf8') <= budget) lo = mid
    else hi = mid - 1
  }
  const charCut = lo

  // 구조 경계로 스냅 — 코드블록/헤딩/리스트 한가운데서 깨지지 않게
  let cut = content.lastIndexOf('\n## ', charCut)
  if (cut < charCut * 0.5) {
    const nl = content.lastIndexOf('\n', charCut)
    cut = nl > 0 ? nl : charCut
  }

  return content.slice(0, cut).trimEnd() + ANTIGRAVITY_TRUNCATE_MARKER
}

/** Antigravity — 워크스페이스 규칙. 공식 경로 .agents/rules/<name>.md (파일당 12,000자). */
export function toAntigravityRules(sections: RulesSection[], projectName: string): string {
  return truncateForAntigravity(buildCodingDoc('Antigravity Rules', sections, projectName))
}

/**
 * RULES.md 섹션을 CLAUDE.md 포맷으로 변환
 */
export function toClaudeMd(sections: RulesSection[], existing: string): string {
  const recordSections = sections.filter(s =>
    CLAUDE_MD_KEYS.some(k => s.title.includes(k))
  )

  // 멱등성: '## 현재 상태' 캡처가 자동생성 배너(> ⚡ …)까지 흡수하면 toClaudeMd 가 매번
  // 배너를 또 추가해 CLAUDE.md 가 무한 증가 → 매 sync drift → 백업 churn. 배너 경계에서 멈춘다.
  const statusMatch = existing.match(/## 현재 상태[\s\S]*?(?=\n## |\n> ⚡|$)/)
  const statusSection = statusMatch ? statusMatch[0].trimEnd() : ''
  const header = existing.split('## ')[0].trim()

  const lines = [
    header,
    '',
    statusSection,
    '',
    '> ⚡ 아래 규칙 섹션은 RULES.md에서 자동 생성됨 (vhk sync). 직접 수정 금지.',
    '',
  ]

  for (const section of recordSections) {
    lines.push(`## ${section.title}`)
    lines.push(section.content)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * RULES.md 첫 줄에서 프로젝트명 도출. sync() 와 드리프트 점검이 **같은 로직**을
 * 쓰도록 단일 출처로 분리 (둘이 다르게 도출하면 거짓 드리프트 발생).
 */
export function deriveProjectName(rulesContent: string): string {
  const firstLine = rulesContent.split('\n')[0]
  return firstLine.replace(/^#\s*/, '').replace(/\s*—.*/, '').trim() || 'Project'
}

export interface SyncTarget {
  /** cwd 기준 상대 경로 (posix) */
  path: string
  /** RULES.md 섹션 → 파일 내용 (순수 함수) */
  generate: (sections: RulesSection[], projectName: string) => string
  /** 완료 메시지 (ko.sync.*) */
  doneMessage: string
}

/**
 * sync 출력 대상 단일 레지스트리 — sync() 가 쓰고, 드리프트 점검(`lib/drift.ts`)이 읽는다.
 * 도구 추가 = 여기 항목 1개 추가 → sync·drift 자동 반영 (목록 중복/하드코딩 방지).
 * CLAUDE.md 는 하이브리드(현재 상태 보존 + 기존 내용 병합)라 이 레지스트리에서 제외.
 */
export const SYNC_TARGETS: SyncTarget[] = [
  { path: '.cursorrules', generate: toCursorrules, doneMessage: ko.sync.cursorrulesDone },
  { path: '.windsurfrules', generate: toWindsurfrules, doneMessage: ko.sync.windsurfDone },
  { path: '.github/copilot-instructions.md', generate: toCopilotInstructions, doneMessage: ko.sync.copilotDone },
  { path: '.agents/rules/vhk-rules.md', generate: toAntigravityRules, doneMessage: ko.sync.antigravityDone },
]

/** 보존할 백업 개수 — 무한 증식 방지(스케일/팀 고려). */
const BACKUP_KEEP = 10
/** 로컬 전용 sync 마커 — 존재 여부로 첫 sync 판정. 추적/클라우드 제외. */
const SYNCED_MARKER_REL = path.join('.vhk', '.synced')

export interface SyncOptions {
  /** 미리보기만 — 디스크 변경 없음 */
  dryRun?: boolean
  /** drift 확인 프롬프트 생략(덮어쓰기 동의 간주) */
  yes?: boolean
}

export interface SyncPlanItem {
  path: string
  newContent: string
  doneMessage: string
  /** 디스크에 이미 존재? */
  exists: boolean
  /** 기존 파일이 RULES.md 생성본과 다름(=수작업 수정 가능성). 정규화 비교(거짓 드리프트 방지). */
  drift: boolean
}

export interface SyncResult {
  dryRun: boolean
  firstSync: boolean
  backupId: string | null
  backedUp: string[]
  written: string[]
  skipped: string[]
  truncated: string[]
  plan: SyncPlanItem[]
}

/**
 * SYNC_TARGETS(순수 미러) + CLAUDE.md(하이브리드) 를 균일한 계획으로.
 * drift 판정은 `normalizeForCompare`(lib/drift) 재활용 — CRLF/끝공백 거짓경보 방지.
 */
export function buildSyncPlan(
  rootDir: string,
  sections: RulesSection[],
  projectName: string
): SyncPlanItem[] {
  const plan: SyncPlanItem[] = []
  for (const target of SYNC_TARGETS) {
    const fullPath = path.join(rootDir, target.path)
    const exists = fs.existsSync(fullPath)
    const newContent = target.generate(sections, projectName)
    // drift = 정규화 후 비교. 공백/EOL(CRLF)-only 차이는 의도적으로 drift 아님(거짓경보·백업 churn 방지)
    // → 그 차이는 백업 없이 덮어써질 수 있으나 규칙 본문은 절대 손실 안 됨(범위 한정).
    const drift = exists
      ? normalizeForCompare(fs.readFileSync(fullPath, 'utf-8')) !== normalizeForCompare(newContent)
      : false
    plan.push({ path: target.path, newContent, doneMessage: target.doneMessage, exists, drift })
  }
  // CLAUDE.md — 하이브리드(현재 상태 보존 + 병합). 레지스트리 밖이지만 같은 가드 적용.
  const claudePath = path.join(rootDir, 'CLAUDE.md')
  const claudeExists = fs.existsSync(claudePath)
  const existingClaude = claudeExists
    ? fs.readFileSync(claudePath, 'utf-8')
    : `# 기록 규칙 (${projectName})\n\n## 현재 상태\n- **Phase:** __FILL__\n- **블로커:** 없음\n- **다음 액션:** __FILL__\n- **마지막 업데이트:** ${new Date().toISOString().split('T')[0]}`
  const claudeNew = toClaudeMd(sections, existingClaude)
  const claudeDrift = claudeExists
    ? normalizeForCompare(existingClaude) !== normalizeForCompare(claudeNew)
    : false
  plan.push({
    path: 'CLAUDE.md',
    newContent: claudeNew,
    doneMessage: ko.sync.claudeDone,
    exists: claudeExists,
    drift: claudeDrift,
  })
  return plan
}

/**
 * sync 핵심 — fs 작업 + 안전 가드. **콘솔 출력 없이 결과만 반환**(테스트 가능 seam).
 * 절대 손실 금지: 덮어쓰기 전 (drift || 첫 sync) 파일을 무조건 백업.
 * confirmOverwrite: drift 파일을 덮어쓸지 결정 — TTY면 inquirer, 비대화형/--yes면 자동 true 를 호출부가 주입.
 * 백업이 먼저라 confirm 결과와 무관하게 원본은 항상 복구 가능.
 */
export async function syncCore(
  rootDir: string,
  opts: SyncOptions,
  confirmOverwrite: (drifted: SyncPlanItem[]) => Promise<boolean>
): Promise<SyncResult> {
  const rulesContent = fs.readFileSync(path.join(rootDir, 'RULES.md'), 'utf-8')
  const sections = parseRulesMd(rulesContent)
  const projectName = deriveProjectName(rulesContent)
  const plan = buildSyncPlan(rootDir, sections, projectName)
  const firstSync = !fs.existsSync(path.join(rootDir, SYNCED_MARKER_REL))

  // --dry-run — 어떤 디스크 변경도 하지 않는다(백업·쓰기·마커 전부 생략)
  if (opts.dryRun) {
    return {
      dryRun: true,
      firstSync,
      backupId: null,
      backedUp: [],
      written: [],
      skipped: [],
      truncated: [],
      plan,
    }
  }

  // 덮어쓰기 전 백업 — 존재 && (drift || 첫 sync)
  const toBackup = plan.filter((p) => p.exists && (p.drift || firstSync)).map((p) => p.path)
  let backupId: string | null = null
  let backedUp: string[] = []
  if (toBackup.length) {
    const info = saveBackup(toBackup, rootDir)
    pruneBackups(BACKUP_KEEP, rootDir)
    backupId = info.id
    backedUp = info.files
  }

  // drift 동의 — drift 있을 때만 묻는다(백업은 이미 저장됨)
  const drifted = plan.filter((p) => p.drift)
  const overwriteDrift = drifted.length ? await confirmOverwrite(drifted) : true

  const written: string[] = []
  const skipped: string[] = []
  const truncated: string[] = []
  for (const item of plan) {
    // drift 인데 덮어쓰기 거부 → 사용자 수정 보존(쓰기 스킵). 신규·무드리프트는 항상 쓴다.
    if (item.drift && !overwriteDrift) {
      skipped.push(item.path)
      continue
    }
    const fullPath = path.join(rootDir, item.path)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true }) // 중첩 경로(.github/·.agents/rules/) 보장
    fs.writeFileSync(fullPath, item.newContent, 'utf-8')
    written.push(item.path)
    // 절삭 마커는 antigravity 만 생성 — 전체 마커 문구로 한정(오탐 방지)
    if (item.newContent.includes('Antigravity 12,000자 제한으로 절삭됨')) {
      truncated.push(item.path)
    }
  }

  // 동기화 마커(로컬 전용) — 다음 실행 firstSync 판정용
  fs.mkdirSync(path.join(rootDir, '.vhk'), { recursive: true })
  fs.writeFileSync(path.join(rootDir, SYNCED_MARKER_REL), new Date().toISOString() + '\n', 'utf-8')
  ensureVhkIgnored(rootDir, '.synced')

  return { dryRun: false, firstSync, backupId, backedUp, written, skipped, truncated, plan }
}

export async function sync(opts: SyncOptions = {}): Promise<void> {
  console.log(chalk.bold(`\n${ko.sync.title}\n`))

  const cwd = process.cwd()
  const rulesPath = path.join(cwd, 'RULES.md')

  if (!fs.existsSync(rulesPath)) {
    console.log(chalk.yellow(ko.sync.noRules))
    console.log(chalk.dim('  RULES.md는 프로젝트 규칙의 Single Source of Truth입니다.'))
    console.log(chalk.dim('  생성하려면: vhk init 실행 후 RULES.md를 작성하세요.'))
    console.log('')
    console.log(chalk.dim('  RULES.md 기본 구조:'))
    console.log(chalk.dim('  ## 프로젝트 정체성'))
    console.log(chalk.dim('  ## 기술 스택'))
    console.log(chalk.dim('  ## 코딩 규칙'))
    console.log(chalk.dim('  ## 기록 규칙'))
    console.log(chalk.dim('  ## 커밋 컨벤션'))
    return
  }

  const sections = parseRulesMd(fs.readFileSync(rulesPath, 'utf-8'))
  console.log(chalk.dim(`  📄 RULES.md 파싱 완료 — ${sections.length}개 섹션`))

  // 비대화형(CI/MCP subprocess: isTTY=false)·--yes → 자동 덮어쓰기(멈춤 금지).
  // TTY → drift 시 inquirer 확인(기본 거부). 어느 쪽이든 백업이 먼저라 손실 0.
  const interactive = !!process.stdout.isTTY && !opts.yes
  const confirmOverwrite = async (drifted: SyncPlanItem[]): Promise<boolean> => {
    if (!interactive) return true
    for (const d of drifted) console.log(chalk.yellow(`  ${ko.sync.driftWarn(d.path)}`))
    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: 'confirm',
        name: 'confirm',
        message: ko.sync.driftConfirm(drifted.length),
        default: false,
      },
    ])
    return confirm
  }

  const result = await syncCore(cwd, opts, confirmOverwrite)

  if (result.dryRun) {
    console.log(chalk.cyan(`\n${ko.sync.dryRunHeader}`))
    for (const item of result.plan) {
      console.log(ko.sync.dryRunWouldWrite(item.path, item.exists && item.drift))
    }
    const wouldBackup = result.plan
      .filter((p) => p.exists && (p.drift || result.firstSync))
      .map((p) => p.path)
    if (wouldBackup.length) {
      console.log(chalk.dim(`\n  백업 예정(${wouldBackup.length}): ${wouldBackup.join(', ')}`))
    }
    return
  }

  if (result.backupId) {
    if (result.firstSync) console.log(chalk.cyan(`  ${ko.sync.firstSync}`))
    if (!process.stdout.isTTY) {
      console.log(chalk.yellow(`  ${ko.sync.nonTtyAuto(result.backedUp.length, result.backupId)}`))
    } else {
      console.log(chalk.cyan(`  ${ko.sync.backupSaved(result.backedUp.length, result.backupId)}`))
    }
  }
  for (const p of result.written) {
    const item = result.plan.find((i) => i.path === p)
    if (item) console.log(chalk.green(`  ${item.doneMessage}`))
  }
  for (const _ of result.truncated) {
    console.log(chalk.yellow(`    ⚠️  ${ko.sync.antigravityTruncated}`))
  }
  for (const p of result.skipped) {
    console.log(chalk.gray(`  ${ko.sync.skipped(p)}`))
  }

  console.log(chalk.bold.green(`\n${ko.sync.done}`))
  console.log(chalk.dim('  RULES.md (원본) → .cursorrules + CLAUDE.md + .windsurfrules'))
  console.log(chalk.dim('             + .github/copilot-instructions.md + .agents/rules/vhk-rules.md (자동 생성)'))
  console.log(chalk.dim('  규칙 변경은 항상 RULES.md에서만 하세요.'))

  printNextStep({
    message: '규칙 동기화 완료! 이제 Cursor가 새 규칙을 따릅니다.',
    command: 'vhk 점검',
    cursorHint: '규칙 점검해줘',
  })
}
