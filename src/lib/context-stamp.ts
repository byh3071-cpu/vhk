const GENERATED_AT_LINE = /^_생성: .+_$/u

/** `_생성:` 시각만 다른 context.md 는 같은 스냅샷으로 본다 (#603). */
export function contextFingerprint(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => !GENERATED_AT_LINE.test(line))
    .join('\n')
}

export function shouldRewriteContext(existing: string | null, next: string): boolean {
  if (existing === null) return true
  return contextFingerprint(existing) !== contextFingerprint(next)
}
