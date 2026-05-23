import fs from 'node:fs'

/** UTF-8 BOM 제거 (PowerShell Set-Content -Encoding utf8 등) */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

export function readJsonFile<T>(filePath: string): T {
  const raw = stripBom(fs.readFileSync(filePath, 'utf-8'))
  return JSON.parse(raw) as T
}
