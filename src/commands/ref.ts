import { existsSync, mkdirSync } from 'node:fs'
import { atomicWriteFile } from '../lib/atomic-write.js'
import chalk from 'chalk'
import { t } from '../i18n/ko.js'
import { printNextStep } from '../lib/next-step.js'
import { safeExecFile } from '../lib/exec.js'
import { ensureNotHardStopped } from '../lib/hard-stop-guard.js'
import { readJsonFile } from '../lib/read-json.js'

interface RefEntry {
  url: string
  memo: string
  addedAt: string
}

const REFS_PATH = '.vhk/refs.json'

// 손상(파싱 실패·배열 아님)과 부재를 구분 — 손상본을 빈 배열 취급 후 덮어쓰면 전체 레퍼런스 영구 소실.
function loadRefsDetailed(): { refs: RefEntry[]; corrupted: boolean } {
  if (!existsSync(REFS_PATH)) return { refs: [], corrupted: false }
  try {
    const parsed = readJsonFile<unknown>(REFS_PATH)
    return Array.isArray(parsed)
      ? { refs: parsed as RefEntry[], corrupted: false }
      : { refs: [], corrupted: true }
  } catch {
    return { refs: [], corrupted: true }
  }
}

function warnCorruptedRefs(): void {
  console.log(chalk.red(`❌ ${REFS_PATH} 이(가) 손상돼 읽을 수 없습니다.`))
  console.log(chalk.gray('   파일을 열어 JSON 배열로 복구하거나, 비우려면 파일 삭제 후 다시 시도하세요.'))
  process.exitCode = 1
}

function saveRefs(refs: RefEntry[]): void {
  mkdirSync('.vhk', { recursive: true })
  atomicWriteFile(REFS_PATH, JSON.stringify(refs, null, 2) + '\n')
}

export async function refAdd(url: string, memo = ''): Promise<void> {
  if (!ensureNotHardStopped('ref add')) return // HARD_STOP 활성 시 refs.json 쓰기 차단
  console.log(chalk.bold('\n🔗 ' + t('ref.addTitle')))
  console.log(chalk.gray('─'.repeat(40)))

  if (!url) {
    console.log(chalk.red('❌ URL을 입력해주세요.'))
    console.log(chalk.gray('   예: vhk ref add https://example.com --memo "참고 사이트"'))
    return
  }

  const { refs, corrupted } = loadRefsDetailed()
  if (corrupted) {
    // 손상본 위에 새 배열을 덮어쓰지 않는다 — 기존 데이터 복구 여지 보존.
    warnCorruptedRefs()
    return
  }
  if (refs.some((r) => r.url === url)) {
    console.log(chalk.yellow('⚠️  이미 저장된 URL입니다.'))
    return
  }

  refs.push({ url, memo, addedAt: new Date().toISOString() })
  saveRefs(refs)

  console.log(chalk.green(`\n✅ 레퍼런스 추가됨 (#${refs.length})`))
  console.log(chalk.cyan(`   ${url}`))
  if (memo) console.log(chalk.gray(`   📝 ${memo}`))

  printNextStep({
    message: '레퍼런스 저장 완료!',
    command: 'vhk ref list',
    cursorHint: '레퍼런스 목록 보여줘',
  })
}

export async function refList(): Promise<void> {
  console.log(chalk.bold('\n📚 ' + t('ref.listTitle')))
  console.log(chalk.gray('─'.repeat(40)))

  const { refs, corrupted } = loadRefsDetailed()
  if (corrupted) {
    warnCorruptedRefs()
    return
  }
  if (refs.length === 0) {
    console.log(chalk.yellow('\n📭 저장된 레퍼런스가 없습니다.'))
    console.log(chalk.gray('   vhk ref add <url> --memo "메모"로 추가하세요.'))
    return
  }

  console.log(chalk.cyan(`\n총 ${refs.length}개의 레퍼런스:\n`))
  refs.forEach((ref, index) => {
    const date = new Date(ref.addedAt).toLocaleDateString('ko-KR')
    console.log(chalk.white(`  [${index + 1}] ${ref.url}`))
    if (ref.memo) console.log(chalk.gray(`      📝 ${ref.memo}`))
    console.log(chalk.gray(`      📅 ${date}`))
    console.log('')
  })
}

export async function refOpen(indexStr: string): Promise<void> {
  const { refs, corrupted } = loadRefsDetailed()
  if (corrupted) {
    warnCorruptedRefs()
    return
  }
  const idx = parseInt(indexStr, 10) - 1

  if (Number.isNaN(idx) || idx < 0 || idx >= refs.length) {
    console.log(chalk.red(`❌ 유효하지 않은 번호입니다. (1~${refs.length || 0})`))
    return
  }

  const ref = refs[idx]

  // http(s) 외 프로토콜 거부 — javascript:, file:, data: 등 차단
  let parsed: URL
  try {
    parsed = new URL(ref.url)
  } catch {
    console.log(chalk.red(`❌ 유효하지 않은 URL: ${ref.url}`))
    return
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    console.log(chalk.red(`❌ http(s) URL만 열 수 있습니다 (${parsed.protocol})`))
    return
  }

  console.log(chalk.cyan(`\n🌐 열기: ${ref.url}`))

  // safeExecFile — shell 없이 argv 분리 호출 → URL injection 차단.
  // Windows: cmd.exe /c start 는 url 의 cmd metachar (`&`, `|`, `>`, `<`, `%`, `^`)
  // 가 명령 분리자로 해석되어 인젝션 위험. rundll32 url.dll,FileProtocolHandler 는
  // 쉘 없이 직접 ShellExecute 호출 → cmd 파싱 자체가 없음. argv 분리 + 비-쉘 = 이중 차단.
  let result
  if (process.platform === 'darwin') {
    result = safeExecFile('open', [ref.url])
  } else if (process.platform === 'win32') {
    result = safeExecFile('rundll32.exe', ['url.dll,FileProtocolHandler', ref.url])
  } else {
    result = safeExecFile('xdg-open', [ref.url])
  }

  if (result.ok) {
    console.log(chalk.green('✅ 브라우저에서 열었습니다.'))
  } else {
    console.log(chalk.yellow('⚠️  브라우저를 열 수 없습니다. URL을 직접 방문해주세요.'))
  }
}
