import fs from 'node:fs'
import path from 'node:path'

export function writeFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, content, 'utf-8')
}

export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath)
}
