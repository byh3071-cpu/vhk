export function extractPageId(urlOrId: string): string {
  const trimmed = urlOrId.trim()

  const uuidMatch = trimmed.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  )
  if (uuidMatch) return uuidMatch[1]!

  const hex32 = trimmed.replace(/-/g, '').match(/([0-9a-f]{32})$/i)
  if (hex32) {
    const id = hex32[1]!
    return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`
  }

  throw new Error(`Notion page ID를 URL에서 찾을 수 없습니다: ${urlOrId}`)
}
