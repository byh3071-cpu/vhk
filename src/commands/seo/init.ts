import chalk from 'chalk'
import { prompt } from '../../lib/prompt.js'
import { ko } from '../../i18n/ko.js'
import { isInteractive, TTY_REQUIRED_EXIT_CODE } from '../../lib/interactive.js'
import {
  readSeoConfig,
  writeSeoConfig,
  upsertSite,
  siteFromDomain,
  normalizeDomain,
  resolveSecretPresence,
  envNameOf,
  SEO_CONFIG_REL,
  SEO_SERVICE_KEYS,
  type SeoConfig,
} from '../../lib/seo-config.js'

export interface SeoInitOptions {
  domain?: string
  /** 비대화형(--yes) — 프롬프트 없이 진행. 도메인은 --domain 필수. */
  yes?: boolean
}

/**
 * `vhk seo init` — SEO 대시보드 진입점. 대상 사이트(도메인)를 `.vhk/seo/config.json` 에 등록하고,
 * 5개 서비스 자격증명의 **환경변수 참조 이름**을 보관한다(값은 .env 에, config 엔 참조만).
 *
 * 외부 API 호출 없음 — 키 없이 100% 동작. 비대화형(MCP/CI/스케줄러)에선 --domain 필수.
 *
 * @param root 테스트·멀티루트용 작업 디렉터리 (기본 process.cwd()).
 */
export async function seoInit(opts: SeoInitOptions = {}, root: string = process.cwd()): Promise<void> {
  console.log(chalk.bold(`\n${ko.seo.init.title}\n`))

  let domain = opts.domain?.trim()

  if (!domain) {
    // 비대화형(--yes 또는 비-TTY)인데 도메인 미지정 → 자동진행 불가. 친절 안내 + exit 2(사람 개입 필요).
    if (!isInteractive(opts)) {
      console.error(chalk.yellow(`  ⚠️  TTY_REQUIRED — ${ko.seo.init.domainRequired}`))
      console.error(chalk.dim(`     ${ko.seo.init.domainHint}`))
      process.exitCode = TTY_REQUIRED_EXIT_CODE
      return
    }
    const ans = await prompt<{ domain: string }>([
      { type: 'input', name: 'domain', message: ko.seo.init.domainPrompt },
    ])
    domain = ans.domain?.trim()
    if (!domain) {
      console.log(chalk.dim(`  ${ko.seo.init.cancelled}`))
      return
    }
  }

  const normalized = normalizeDomain(domain)
  if (!normalized || !normalized.includes('.')) {
    console.error(chalk.red(`  ✖ ${ko.seo.init.invalidDomain}`))
    process.exitCode = 1
    return
  }

  const cfg = upsertSite(readSeoConfig(root), siteFromDomain(normalized))
  writeSeoConfig(cfg, root)

  console.log(chalk.green(`  ✓ ${ko.seo.init.registered(normalized)}`))
  console.log(chalk.dim(`    → ${SEO_CONFIG_REL}`))
  console.log('')

  printSecretGuide(cfg)
  console.log(chalk.dim(`  ${ko.seo.init.nextStep}`))
  console.log('')
}

/** 자격증명 상태 안내 — 환경변수 존재 여부만(boolean), 값은 절대 출력하지 않는다. */
function printSecretGuide(cfg: SeoConfig): void {
  console.log(chalk.bold(`  ${ko.seo.init.secretGuideHeader}`))
  const present = resolveSecretPresence(cfg.secrets)
  for (const k of SEO_SERVICE_KEYS) {
    const envName = envNameOf(cfg.secrets[k])
    if (present[k]) console.log(chalk.green(`    ✓ ${ko.seo.init.secretPresent(envName)}`))
    else console.log(chalk.dim(`    · ${ko.seo.init.secretMissing(envName)}`))
  }
  console.log(chalk.yellow(`  ${ko.seo.init.secretWarn}`))
  console.log('')
}
