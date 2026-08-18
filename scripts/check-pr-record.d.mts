/** check-pr-record.mjs 의 타입 — 게이트 스크립트는 런타임 의존이 없어 .mjs 로 두고 선언만 붙인다. */

export declare const CODE_PATTERNS: RegExp[]
export declare const RECORD_PATTERNS: RegExp[]
export declare const BYPASS_TOKEN: string

export declare function classify(files: string[]): { code: string[]; records: string[] }

export declare function judge(
  files: string[],
  commitMessages: string[],
): { ok: boolean; reason: string }
