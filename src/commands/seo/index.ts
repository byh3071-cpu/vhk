import chalk from 'chalk'
import { seoInit, type SeoInitOptions } from './init.js'

export { seoInit, type SeoInitOptions }

/**
 * bare `vhk seo` — 서브커맨드 라우터 fallback. 사용법을 안내한다.
 * (submit/check/report 는 후속 goal 22~26 에서 추가.)
 */
export function runSeo(): void {
  console.log(chalk.bold('\n🔍 vhk seo — SEO·수익 대시보드\n'))
  console.log('  사용법:')
  console.log('    ' + chalk.cyan('vhk seo init') + chalk.dim('     사이트 등록 + 자격증명 보관'))
  console.log('    ' + chalk.dim('vhk seo submit   사이트맵·IndexNow 제출 (후속 goal)'))
  console.log('    ' + chalk.dim('vhk seo check    색인·트래픽·수익 수집 (후속 goal)'))
  console.log('    ' + chalk.dim('vhk seo report   무빌드 HTML 대시보드 (후속 goal)'))
  console.log('')
  console.log(chalk.dim('  먼저 시작: vhk seo init --domain <도메인>'))
  console.log('')
}
