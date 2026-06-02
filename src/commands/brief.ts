import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import chalk from 'chalk'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { safeExecFile } from '../lib/exec.js'
import { readJsonFile } from '../lib/read-json.js'
import { readMemory, activeMemoryLines } from './memory.js'

const BRIEF_PATH = '.vhk/brief.md'

/**
 * VHK-004: init 의 --name/--description 은 RULES.md/CLAUDE.md/PRD 에 들어가지 package.json 엔 안 들어감.
 * brief 가 package.json name 만 봐서 틀린 이름 표시 → 문서(SoT)에서 먼저 도출.
 */
function readProjectIdentity(): { name?: string; description?: string } {
  const out: { name?: string; description?: string } = {}
  try {
    if (existsSync('RULES.md')) {
      const r = readFileSync('RULES.md', 'utf-8')
      const m = r.split('\n')[0].match(/^#\s*(.+?)(?:\s*—.*)?$/)
      if (m) out.name = m[1].trim()
      const d = r.match(/한 줄 설명:\s*(.+)/)
      if (d) out.description = d[1].trim()
    }
    if (!out.name && existsSync('CLAUDE.md')) {
      const m = readFileSync('CLAUDE.md', 'utf-8').match(/#\s*기록 규칙\s*\((.+?)\)/)
      if (m) out.name = m[1].trim()
    }
  } catch {
    /* 문서 없음/읽기 실패 → package.json 폴백 */
  }
  return out
}

function git(args: string[]): string {
  const result = safeExecFile('git', args)
  return result.ok ? result.out : ''
}

export async function brief(): Promise<void> {
  console.log(chalk.bold('\n📋 ' + t('brief.title')))
  console.log(chalk.gray('─'.repeat(40)))

  const lines: string[] = []
  lines.push('# 프로젝트 브리핑')
  lines.push('')
  lines.push(`> 생성: ${new Date().toLocaleString('ko-KR')}`)
  lines.push('')

  // 1. 프로젝트 정보 — readJsonFile로 BOM 안전 처리
  try {
    const pkg = readJsonFile<{
      name?: string
      version?: string
      description?: string
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }>('package.json')
    const id = readProjectIdentity()
    lines.push('## 프로젝트 정보')
    lines.push('')
    lines.push(`- **이름**: ${id.name ?? pkg.name ?? '미정'}`)
    lines.push(`- **버전**: ${pkg.version ?? '미정'}`)
    lines.push(`- **설명**: ${id.description ?? pkg.description ?? '없음'}`)
    const deps = Object.keys(pkg.dependencies ?? {}).length
    const devDeps = Object.keys(pkg.devDependencies ?? {}).length
    lines.push(`- **의존성**: ${deps}개 (dev: ${devDeps}개)`)
    lines.push('')
  } catch {
    lines.push('## 프로젝트 정보')
    lines.push('')
    lines.push('⚠️ package.json을 찾을 수 없습니다.')
    lines.push('')
  }

  // 2. Git 상태 — safeExecFile로 .cmd shim 안전 호출
  const branch = git(['branch', '--show-current'])
  const lastCommit = git(['log', '-1', '--pretty=format:%h %s (%cr)'])
  const uncommitted = git(['status', '--porcelain'])
  const totalCommits = git(['rev-list', '--count', 'HEAD'])

  lines.push('## Git 상태')
  lines.push('')
  lines.push(`- **현재 브랜치**: ${branch || '알 수 없음'}`)
  lines.push(`- **마지막 커밋**: ${lastCommit || '없음'}`)
  lines.push(`- **총 커밋 수**: ${totalCommits || '알 수 없음'}`)
  lines.push(
    `- **미커밋 변경**: ${
      uncommitted ? `${uncommitted.split('\n').length}개 파일` : '없음 ✅'
    }`
  )
  lines.push('')

  // 3. 기억 (memory v2 4버킷 — active 만)
  if (existsSync('.vhk/memory.json')) {
    try {
      const memLines = activeMemoryLines(readMemory(process.cwd()))
      if (memLines.length > 0) {
        lines.push('## 저장된 기억 (memory v2)')
        lines.push('')
        lines.push(...memLines)
      }
    } catch {
      // 무시
    }
  }

  // 4. 레퍼런스
  if (existsSync('.vhk/refs.json')) {
    try {
      const refs = readJsonFile<Array<{ url: string; memo?: string }>>('.vhk/refs.json')
      if (Array.isArray(refs) && refs.length > 0) {
        lines.push(`## 레퍼런스 (${refs.length}개)`)
        lines.push('')
        for (const r of refs.slice(-3)) {
          const label = r.memo && r.memo.length > 0 ? r.memo : r.url
          lines.push(`- [${label}](${r.url})`)
        }
        lines.push('')
      }
    } catch {
      // 무시
    }
  }

  // 5. 다음 단계 제안 — 동적 번호 매기기 (uncommitted 유무에 따라 1~4단계)
  lines.push('## 다음 단계 제안')
  lines.push('')
  const steps: string[] = []
  if (uncommitted) steps.push('미커밋 변경 사항을 커밋하세요: `vhk save`')
  steps.push('품질 점검 실행: `vhk harness`')
  steps.push('보안 감사: `vhk audit`')
  steps.push('컨텍스트 갱신: `vhk context`')
  steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`))
  lines.push('')

  lines.push('---')
  lines.push('')
  lines.push('_VHK CLI 브리핑_')
  lines.push('')

  mkdirSync('.vhk', { recursive: true })
  writeFileSync(BRIEF_PATH, lines.join('\n'), 'utf-8')

  console.log('\n' + lines.join('\n'))
  console.log(chalk.green(`\n✅ ${BRIEF_PATH} 저장 완료`))

  printNextStep({
    message: '브리핑 생성 완료!',
    command: 'vhk context',
    cursorHint: '컨텍스트 업데이트해줘',
  })
}
