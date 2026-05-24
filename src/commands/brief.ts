import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import chalk from 'chalk'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { safeExecFile } from '../lib/exec.js'

const BRIEF_PATH = '.vhk/brief.md'

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

  // 1. 프로젝트 정보
  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8')) as {
      name?: string
      version?: string
      description?: string
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    lines.push('## 프로젝트 정보')
    lines.push('')
    lines.push(`- **이름**: ${pkg.name ?? '미정'}`)
    lines.push(`- **버전**: ${pkg.version ?? '미정'}`)
    lines.push(`- **설명**: ${pkg.description ?? '없음'}`)
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

  // 3. 결정사항
  if (existsSync('.vhk/memory.json')) {
    try {
      const memories = JSON.parse(readFileSync('.vhk/memory.json', 'utf-8')) as Array<{
        content: string
      }>
      if (Array.isArray(memories) && memories.length > 0) {
        lines.push(`## 저장된 결정사항 (${memories.length}개)`)
        lines.push('')
        for (const m of memories.slice(-5)) {
          lines.push(`- ${m.content}`)
        }
        if (memories.length > 5) {
          lines.push(`- ... 외 ${memories.length - 5}개`)
        }
        lines.push('')
      }
    } catch {
      // 무시
    }
  }

  // 4. 레퍼런스
  if (existsSync('.vhk/refs.json')) {
    try {
      const refs = JSON.parse(readFileSync('.vhk/refs.json', 'utf-8')) as Array<{
        url: string
        memo?: string
      }>
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
