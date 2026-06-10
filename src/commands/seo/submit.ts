import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import { log } from '../../utils/logger.js'
import { atomicWriteFile } from '../../lib/atomic-write.js'
import { readSeoConfig, resolveSecretPresence } from '../../lib/seo-config.js'

/**
 * Goal 22: `vhk seo submit` — 사이트맵(GSC·Bing) 제출 + IndexNow 한 방 핑(빙·네이버·얀덱스).
 *
 * 철학: ① IndexNow 하나로 빙·네이버·얀덱스 동시 ② **구글 Indexing API 사용 금지**(일반페이지 페널티)
 *       ③ 실패 시 exit≠0 + 친절 에러 ④ 비대화형 1급.
 *
 * 무인 구현 범위: IndexNow 키 생성/검증/키파일(오프라인) + 페이로드 빌드(순수) + 로그 스키마.
 * 실 네트워크 제출(GSC Sitemaps API·Bing·IndexNow 핑)은 자격증명 필요 → 미설정 시 정직 안내(blocker).
 */

export const INDEXNOW_KEY_REL = join('.vhk', 'seo', 'indexnow-key.txt')

// ⚠️ 구글 Indexing API(indexing.googleapis.com) 금지 — 채용공고·라이브영상 전용. 일반 페이지에 쓰면 페널티.
// 이 모듈은 해당 엔드포인트를 절대 호출하지 않는다(check-goal-22 가 미사용을 단언).
export const GOOGLE_INDEXING_API_FORBIDDEN = true

// ── 순수 로직 ──────────────────────────────────────────────────────────────────

/** IndexNow 키 생성 — 32 hex(IndexNow 규격 8~128자, [a-f0-9]). */
export function generateIndexNowKey(): string {
  return randomBytes(16).toString('hex')
}

/** IndexNow 키 형식 검증. */
export function isValidIndexNowKey(key: string): boolean {
  return /^[a-f0-9]{8,128}$/i.test(key)
}

/** 키파일 이름 — `${key}.txt` (사이트 루트에 올라가야 함). */
export function indexNowKeyFileName(key: string): string {
  return `${key}.txt`
}

export interface IndexNowPayload {
  host: string
  key: string
  keyLocation: string
  urlList: string[]
}

/** IndexNow 핑 페이로드(순수) — 빙/네이버/얀덱스 공통 규격. */
export function buildIndexNowPayload(host: string, key: string, urls: string[]): IndexNowPayload {
  return { host, key, keyLocation: `https://${host}/${key}.txt`, urlList: urls }
}

export interface SubmitLogEntry {
  ts: string
  target: 'indexnow' | 'gsc' | 'bing'
  ok: boolean
  status?: number
  note?: string
}

/** 기존 키파일에서 키 읽기(없으면 null). */
export function readIndexNowKey(root: string = process.cwd()): string | null {
  const p = join(root, INDEXNOW_KEY_REL)
  if (!existsSync(p)) return null
  const key = readFileSync(p, 'utf-8').trim()
  return isValidIndexNowKey(key) ? key : null
}

/** 키파일 보장 — 없으면 생성(오프라인 동작). 기존 유효 키는 보존. 키 반환. */
export function ensureIndexNowKey(root: string = process.cwd()): string {
  const existing = readIndexNowKey(root)
  if (existing) return existing
  const key = generateIndexNowKey()
  mkdirSync(join(root, '.vhk', 'seo'), { recursive: true })
  atomicWriteFile(join(root, INDEXNOW_KEY_REL), key + '\n')
  return key
}

// ── 커맨드 핸들러 ──────────────────────────────────────────────────────────────

export async function seoSubmit(_opts: { yes?: boolean } = {}, root: string = process.cwd()): Promise<void> {
  log.bold('\n🚀 vhk seo submit — 사이트맵 + IndexNow 제출\n')

  const cfg = readSeoConfig(root)
  if (cfg.sites.length === 0) {
    log.error('등록된 사이트가 없습니다. 먼저 `vhk seo init --domain <도메인>` 실행.')
    process.exitCode = 1
    return
  }
  const site = cfg.sites[0]

  // 1) IndexNow 키 보장(오프라인 — 키파일 생성/검증). 키파일은 사이트 루트에 배포해야 핑이 인증됨.
  // 기존 키파일이 손상/형식불일치이면 새 키로 교체되므로 재배포 경고(멱등성 깨짐 방지).
  const hadInvalidKey = existsSync(join(root, INDEXNOW_KEY_REL)) && readIndexNowKey(root) === null
  const key = ensureIndexNowKey(root)
  if (hadInvalidKey) {
    log.warn('기존 IndexNow 키파일이 손상/형식불일치 — 새 키로 교체됨. 사이트 루트에 새 키파일 재배포 필요(옛 keyLocation 404 방지).')
  }
  log.plain(chalk.green(`  ✓ IndexNow 키 준비: ${INDEXNOW_KEY_REL}`))
  log.plain(chalk.dim(`    → 사이트 루트에 https://${site.domain}/${indexNowKeyFileName(key)} 로 배포 필요`))

  // 2) 구글 Indexing API 미사용 명시(일반 페이지 페널티 회피).
  log.plain(chalk.dim('  · 구글 Indexing API 미사용 (일반 페이지 페널티 회피 — 정책)'))

  // 3) 실 네트워크 제출 = 자격증명 필요 → 미설정 시 정직 안내(blocker).
  const present = resolveSecretPresence(cfg.secrets)
  const ready = present.bing || present.indexnow || present.gsc
  if (!ready) {
    log.warn('실 제출(GSC Sitemaps·Bing·IndexNow 핑)은 자격증명이 필요합니다 — 현재 미설정.')
    log.plain(chalk.dim('    .env 에 $VHK_SEO_* 키 추가 후 재실행하면 실제 제출됩니다. (무인 배치 범위: 키 생성·검증·페이로드까지)'))
    process.exitCode = 1
    return
  }

  // 자격증명이 있어도 실 HTTP 제출 연동은 후속(운영) 단계 — 무인 배치에선 미수행(정직).
  log.warn('자격증명 감지 — 단, 실 HTTP 제출 연동은 운영 단계에서 활성화됩니다(무인 배치 미수행).')
}
