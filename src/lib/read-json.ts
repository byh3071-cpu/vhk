import { readFileSync } from 'node:fs'

/** UTF-8 BOM 제거 (PowerShell Set-Content -Encoding utf8 등) */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/** 이미 읽은 동일 바이트로 해시와 JSON 의미를 함께 검사해야 할 때 쓰는 BOM-safe 파서. */
export function parseJsonText<T>(text: string): T {
  return JSON.parse(stripBom(text)) as T
}

export function readJsonFile<T>(filePath: string): T {
  return parseJsonText<T>(readFileSync(filePath, 'utf-8'))
}
