import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripBom } from '../lib/read-json.js'
import type { DateRange, DevLogEntry } from './types.js'

// Goal 32·33 Phase 2 — 로컬 dev log(docs/log/YYYY-MM-DD-*.md) 연동(공유).
// Notion 아님 — 레포 실제 dev log 위치(CLAUDE.md). 결정적·인증 불요.

// frontmatter date: 우선, 없으면 파일명 'YYYY-MM-DD' 접두사.
export function devLogDate(filename: string, content: string): string | null {
  const fm = content.match(/^date:\s*(\d{4}-\d{2}-\d{2})/m)
  if (fm) return fm[1]
  const fn = filename.match(/(\d{4}-\d{2}-\d{2})/)
  return fn ? fn[1] : null
}

// 첫 '# ' 제목 — 앞의 'YYYY-MM-DD — ' 접두사 제거.
export function devLogTitle(content: string): string {
  const m = content.match(/^#\s+(.+)$/m)
  if (!m) return '(제목 없음)'
  return m[1].replace(/^\d{4}-\d{2}-\d{2}\s*[—-]\s*/, '').trim()
}

// '## 교훈' 섹션 첫 비어있지 않은 줄(있으면).
export function devLogLesson(content: string): string | undefined {
  const m = content.match(/^#{2,}\s*교훈[^\n]*\n+([^\n#]+)/m)
  return m ? m[1].trim() : undefined
}

export function parseDevLog(filename: string, content: string, fallbackDate: string): DevLogEntry {
  const text = stripBom(content)
  return {
    date: devLogDate(filename, text) ?? fallbackDate,
    title: devLogTitle(text),
    lesson: devLogLesson(text),
  }
}

// docs/log/ 에서 range 안의 dev log 읽기. 디렉터리 없거나 읽기 실패 → 빈 배열(폴백).
export function readDevLogs(logDir: string, range: DateRange): DevLogEntry[] {
  let names: string[]
  try {
    names = readdirSync(logDir)
  } catch {
    return []
  }
  const out: DevLogEntry[] = []
  for (const name of names) {
    if (!name.endsWith('.md')) continue
    const dm = name.match(/(\d{4}-\d{2}-\d{2})/)
    if (!dm) continue
    const date = dm[1]
    if (date < range.start || date > range.end) continue
    try {
      out.push(parseDevLog(name, readFileSync(join(logDir, name), 'utf-8'), date))
    } catch {
      // 읽기 실패한 항목은 건너뜀(나머지 계속)
    }
  }
  return out
}
