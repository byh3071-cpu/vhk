/** check-rule-patterns.mjs 의 타입 — 게이트 스크립트는 .mjs 로 두고 선언만 붙인다. */

export declare const LEGACY_FILES: Set<string>
export declare const REQUIRED_FIELDS: string[]
export declare const LEGACY_REQUIRED_FIELDS: string[]
export declare const PATTERN_FILE_RE: RegExp

export declare function frontmatterKeys(content: string): string[] | null
export declare function frontmatterValue(content: string, key: string): string | null
export declare function judge(
  files: { name: string; content: string }[],
  references: string[],
): string[]
