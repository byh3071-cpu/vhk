// RFC 0057 §7 — Cursor 세션시작 훅 배선. `.claude/settings.json` SessionStart 와 대칭:
// Cursor 는 `.cursor/hooks.json` `sessionStart` 로 같은 customization-check.mjs 를 --format cursor 로 호출.
// 공식 스키마: cursor.com/docs/agent/hooks (version 1 · hooks.sessionStart[].command · stdout additional_context).
// ⚠️ 훅 스키마가 최근 출시(Cursor 1.7)라 변동 위험 → 배출 스크립트는 fail-open 유지(customization-hook.ts).
import * as fs from 'node:fs'
import * as path from 'node:path'
import { readJsonFile } from './read-json.js'

// Cursor 는 프로젝트 훅을 project root 에서 실행(공식 예시가 상대경로) → 상대 command.
// 스크립트 내부의 .vhk 마커 조회도 process.cwd() 기반이라 정합.
export const CURSOR_HOOK_COMMAND = 'node .vhk/hooks/customization-check.mjs --format cursor'

export type CursorHookResult = 'created' | 'merged' | 'unchanged' | 'skipped'

interface CursorHookEntry {
  command?: string
}

/**
 * `.cursor/hooks.json` 의 sessionStart 에 vhk 커스터마이징 훅을 배선한다.
 * - 없으면 생성(version 1). 있으면 다른 훅·기존 sessionStart 항목 보존하며 우리 것만 추가.
 * - 우리 커맨드가 이미 있으면 unchanged(멱등). 손상 JSON 이면 skip(파일 불가침, fail-soft).
 * ensureSessionStartHook(Claude) 와 동일한 병합-보존 규율.
 */
export function ensureCursorSessionStartHook(projectDir: string): CursorHookResult {
  const file = path.join(projectDir, '.cursor', 'hooks.json')

  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(
      file,
      JSON.stringify({ version: 1, hooks: { sessionStart: [{ command: CURSOR_HOOK_COMMAND }] } }, null, 2) + '\n',
      'utf-8'
    )
    return 'created'
  }

  let parsed: unknown
  try {
    parsed = readJsonFile(file)
  } catch {
    return 'skipped'
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return 'skipped'

  const root = parsed as Record<string, unknown>
  if (root.hooks !== undefined && (typeof root.hooks !== 'object' || root.hooks === null || Array.isArray(root.hooks))) {
    return 'skipped'
  }
  const hooks = (root.hooks as Record<string, unknown> | undefined) ?? {}
  const ss = hooks.sessionStart
  if (ss !== undefined && !Array.isArray(ss)) return 'skipped'
  const arr = (Array.isArray(ss) ? ss : []) as CursorHookEntry[]

  if (arr.some((e) => e?.command === CURSOR_HOOK_COMMAND)) return 'unchanged'

  arr.push({ command: CURSOR_HOOK_COMMAND })
  const next = {
    ...root,
    version: typeof root.version === 'number' ? root.version : 1,
    hooks: { ...hooks, sessionStart: arr },
  }
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n', 'utf-8')
  return 'merged'
}
