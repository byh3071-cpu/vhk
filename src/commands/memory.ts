import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import chalk from 'chalk'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { readJsonFile } from '../lib/read-json.js'

interface MemoryEntry {
  content: string
  addedAt: string
  tags?: string[]
}

const MEMORY_PATH = '.vhk/memory.json'

function loadMemories(): MemoryEntry[] {
  if (!existsSync(MEMORY_PATH)) return []
  try {
    const parsed = readJsonFile<unknown>(MEMORY_PATH)
    return Array.isArray(parsed) ? (parsed as MemoryEntry[]) : []
  } catch {
    return []
  }
}

function saveMemories(memories: MemoryEntry[]): void {
  mkdirSync('.vhk', { recursive: true })
  writeFileSync(MEMORY_PATH, JSON.stringify(memories, null, 2) + '\n', 'utf-8')
}

export async function memoryAdd(content: string, tags?: string[]): Promise<void> {
  console.log(chalk.bold('\n🧠 ' + t('memory.addTitle')))
  console.log(chalk.gray('─'.repeat(40)))

  if (!content) {
    console.log(chalk.red('❌ 기억할 내용을 입력해주세요.'))
    console.log(chalk.gray('   예: vhk memory add "API는 tRPC 사용하기로 결정"'))
    return
  }

  const memories = loadMemories()
  memories.push({
    content,
    addedAt: new Date().toISOString(),
    tags: tags && tags.length > 0 ? tags : [],
  })
  saveMemories(memories)

  console.log(chalk.green(`\n✅ 기억 저장됨 (#${memories.length})`))
  console.log(chalk.cyan(`   📝 ${content}`))

  printNextStep({
    message: '기억 저장 완료!',
    command: 'vhk memory list',
    cursorHint: '기억 목록 보여줘',
  })
}

export async function memoryList(): Promise<void> {
  console.log(chalk.bold('\n🧠 ' + t('memory.listTitle')))
  console.log(chalk.gray('─'.repeat(40)))

  const memories = loadMemories()
  if (memories.length === 0) {
    console.log(chalk.yellow('\n📭 저장된 기억이 없습니다.'))
    console.log(chalk.gray('   vhk memory add "내용"으로 추가하세요.'))
    return
  }

  console.log(chalk.cyan(`\n총 ${memories.length}개의 기억:\n`))
  memories.forEach((m, index) => {
    const date = new Date(m.addedAt).toLocaleDateString('ko-KR')
    console.log(chalk.white(`  [${index + 1}] ${m.content}`))
    if (m.tags && m.tags.length > 0) {
      console.log(chalk.blue(`      🏷️  ${m.tags.join(', ')}`))
    }
    console.log(chalk.gray(`      📅 ${date}`))
    console.log('')
  })
}

export async function memoryRemove(indexStr: string): Promise<void> {
  const memories = loadMemories()
  const idx = parseInt(indexStr, 10) - 1

  if (Number.isNaN(idx) || idx < 0 || idx >= memories.length) {
    console.log(chalk.red(`❌ 유효하지 않은 번호입니다. (1~${memories.length || 0})`))
    return
  }

  const removed = memories.splice(idx, 1)[0]
  saveMemories(memories)

  console.log(chalk.green('\n✅ 기억 삭제됨:'))
  console.log(chalk.gray(`   ${removed.content}`))
}
