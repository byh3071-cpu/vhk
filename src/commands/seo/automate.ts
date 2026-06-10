import chalk from 'chalk'
import { log } from '../../utils/logger.js'
import { readSeoConfig } from '../../lib/seo-config.js'

/**
 * Goal 26: `vhk seo automate` — report 결과 Notion 적재 + 스케줄러 도우미 + 확장 슬롯.
 *
 * 철학: ① SoT Key 멱등 동기화(재실행 중복 0) ② 스케줄러 비대화형 ③ 확장 슬롯 자리만 ④ secret=vhk secure.
 * 무인 구현 범위: 확장 슬롯 인터페이스 + SoT Key 멱등 키(순수) + 스케줄러 명령 생성(문서, 순수).
 * Notion 실 적재·스케줄러 실 등록은 자격증명/OS 권한 필요 → 정직 안내(blocker).
 */

// ── 확장 슬롯 인터페이스(자리만 — 구현은 후속) ───────────────────────────────────
export interface SeoAdapter {
  /** 슬롯 식별자. */
  name: string
  /** 자동 커버 여부(얀덱스=IndexNow 포함 → 별도 코드 X). */
  autoCovered: boolean
  /** 구현 여부(자리만이면 false). */
  implemented: boolean
}

/** 확장 슬롯 — 얀덱스는 IndexNow(Goal 22)에 이미 포함(자동), 나머지는 자리만. */
export const SEO_ADAPTER_SLOTS: SeoAdapter[] = [
  { name: 'yandex', autoCovered: true, implemented: true }, // IndexNow 에 포함(자동)
  { name: 'daum-kakao', autoCovered: false, implemented: false },
  { name: 'gbp', autoCovered: false, implemented: false }, // Google Business Profile
]

// ── SoT Key 멱등(순수) — 같은 (도메인, 날짜) 재실행 시 동일 키 → Notion 중복 적재 방지. ──────────
export function sotKey(domain: string, dateIso: string): string {
  const day = dateIso.slice(0, 10) // YYYY-MM-DD
  return `seo:${domain}:${day}`
}

// ── 스케줄러 명령 생성(순수, 문서용) — Windows 작업 스케줄러 등록 도우미 문자열. ────────────────
export function buildSchedulerCommand(taskName: string, time = '09:00'): string {
  // submit → check → report 체인을 매일 지정 시각에 비대화형 실행.
  return `schtasks /Create /TN "${taskName}" /TR "vhk seo submit & vhk seo check & vhk seo report" /SC DAILY /ST ${time} /F`
}

// ── 커맨드 핸들러 ──────────────────────────────────────────────────────────────

export async function seoAutomate(_opts: { yes?: boolean } = {}, root: string = process.cwd()): Promise<void> {
  log.bold('\n⚙️  vhk seo automate — Notion 적재 + 스케줄러 + 확장 슬롯\n')

  const cfg = readSeoConfig(root)
  const domain = cfg.sites[0]?.domain ?? '(미등록)'

  log.plain(chalk.cyan('  확장 슬롯:'))
  for (const a of SEO_ADAPTER_SLOTS) {
    const tag = a.autoCovered ? chalk.green('자동(IndexNow 포함)') : a.implemented ? chalk.green('구현됨') : chalk.dim('자리만(후속)')
    log.plain(`    · ${a.name} — ${tag}`)
  }

  log.plain(chalk.cyan('\n  스케줄러(Windows) 등록 명령:'))
  log.plain(chalk.dim('    ' + buildSchedulerCommand('vhk-seo-daily')))

  log.warn('\nNotion 실 적재는 자격증명·연동이 필요합니다 — 무인 배치 범위 밖(운영 단계).')
  log.plain(chalk.dim(`    SoT Key(멱등): ${sotKey(domain, '2026-06-10T00:00:00Z')} — 재실행 중복 0`))
}
