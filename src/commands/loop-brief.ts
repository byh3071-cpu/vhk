import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import chalk from 'chalk'
import { printNextStep } from '../lib/next-step.js'
import { readMemory, recallForAction } from './memory.js'
import { listGoals } from '../lib/goal-frontmatter.js'
import { selectActiveId } from './goal.js'
import { isHardStopActive, getActiveBlockers } from '../lib/state-files.js'

const LOOP_BRIEF_PATH = '.vhk/loop-brief.md'

function readVisionWhat(): { what?: string; loopAnchor?: string } {
  try {
    if (!existsSync('VISION.md')) return {}
    const text = readFileSync('VISION.md', 'utf-8')
    const whatM = /## What \(한 줄\)\s*\n([^\n#]+)/.exec(text)
    const anchorM = /## Loop Anchor[^\n]*\n([\s\S]*?)(?:\n##|$)/.exec(text)
    const what = whatM?.[1]?.trim()
    const loopAnchor = anchorM?.[1]
      ?.split('\n')
      .map(l => l.trim())
      .filter(l => l.startsWith('-'))
      .join('\n') || undefined
    return { what, loopAnchor }
  } catch {
    return {}
  }
}

export function loopBrief(): void {
  console.log(chalk.bold('\n🔁 루프 브리핑 (1틱 앵커)'))
  console.log(chalk.gray('─'.repeat(40)))

  const lines: string[] = []
  lines.push('# Loop Brief — 1틱 앵커')
  lines.push('')
  lines.push(`> 생성: ${new Date().toLocaleString('ko-KR')}`)
  lines.push('')

  // 1. 의도 (VISION)
  lines.push('## 의도 (VISION)')
  lines.push('')
  const { what, loopAnchor } = readVisionWhat()
  if (what) {
    lines.push(`**What:** ${what}`)
    lines.push('')
  }
  if (loopAnchor) {
    lines.push('**Loop Anchor:**')
    lines.push(loopAnchor)
    lines.push('')
  }
  if (!what && !loopAnchor) {
    lines.push('⚠️ VISION.md 없음 — `vhk init` 후 What/Loop Anchor 채우기')
    lines.push('')
  }

  // 2. 지금 할 일 (활성 goal 1개)
  lines.push('## 지금 할 일 (활성 goal 1개)')
  lines.push('')
  try {
    const goals = listGoals('goals')
    const activeId = selectActiveId(goals)
    const active = activeId != null ? goals.find(g => g.frontmatter.id === activeId) : null
    if (active) {
      const fm = active.frontmatter
      lines.push(`- **goal ${fm.id}**: ${fm.title ?? '(제목 없음)'} \`[${fm.status ?? '?'}]\``)
      lines.push(`  파일: goals/${fm.id}-*.md`)
    } else {
      lines.push('- 활성 goal 없음 — `vhk goal next` 로 다음 goal 확인')
    }
  } catch {
    lines.push('- goals/ 읽기 실패 — 디렉토리 확인')
  }
  lines.push('')

  // 3. 관련 교훈 (recall top 2)
  lines.push('## 관련 교훈 (recall)')
  lines.push('')
  try {
    const goals = listGoals('goals')
    const activeId = selectActiveId(goals)
    const active = activeId != null ? goals.find(g => g.frontmatter.id === activeId) : null
    const query = active?.frontmatter.title ?? 'goal'
    const mem = readMemory(process.cwd())
    const recalled = recallForAction(mem, query).slice(0, 2)
    if (recalled.length) {
      recalled
        .map(r => r.entry.content.split('\n')[0].trim())
        .filter(text => text.length > 0)
        .forEach(text => lines.push(`- ${text}`))
    } else {
      lines.push('- 관련 교훈 없음 (`vhk recall "<쿼리>"` 로 직접 검색)')
    }
  } catch {
    lines.push('- 교훈 로드 실패')
  }
  lines.push('')

  // 4. STOP 조건
  lines.push('## STOP 조건')
  lines.push('')
  const hardStop = isHardStopActive()
  lines.push(`- HARD_STOP: ${hardStop ? '🛑 **활성** — 작업 중단 필수**' : '✅ 비활성'}`)
  try {
    const blockers = getActiveBlockers()
    if (blockers.length) {
      lines.push('- **활성 블로커:**')
      blockers.forEach(b => lines.push(`  - ${b}`))
    } else {
      lines.push('- 블로커: 없음')
    }
  } catch {
    lines.push('- 블로커 확인 실패')
  }
  lines.push('- 위험 작업(publish·push·삭제)은 사람 확인 후 실행')
  lines.push('')

  const content = lines.join('\n')

  // .vhk/ 디렉토리 보장
  try {
    if (!existsSync('.vhk')) mkdirSync('.vhk', { recursive: true })
    writeFileSync(LOOP_BRIEF_PATH, content, 'utf-8')
  } catch {
    /* 쓰기 실패 → stdout 만 */
  }

  console.log(content)
  console.log(chalk.gray(`\n📄 저장: ${LOOP_BRIEF_PATH}`))

  printNextStep({ message: '루프 매 틱 시작 전 .vhk/loop-brief.md 를 컨텍스트에 주입하세요. `vhk brief` — 상태 스냅샷' })
}
