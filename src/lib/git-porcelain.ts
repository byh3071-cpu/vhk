/** git status --porcelain — leading space 보존 (trim 금지) */
export function normalizePorcelain(raw: string): string {
  return raw.replace(/\r\n/g, '\n').trimEnd()
}

export function parsePorcelainLines(raw: string): string[] {
  return normalizePorcelain(raw).split('\n').filter(Boolean)
}
