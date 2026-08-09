export interface NamedPublicBoundaryPattern {
  name: string
  pattern: RegExp
}

export const PRIVATE_TEXT_PATTERNS: readonly NamedPublicBoundaryPattern[]
export const EXTERNAL_OBJECT_ID_PATTERNS: readonly NamedPublicBoundaryPattern[]
export const UUID_PATTERN: RegExp
export const ZERO_UUID: RegExp
