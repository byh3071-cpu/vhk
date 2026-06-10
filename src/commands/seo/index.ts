import chalk from 'chalk'
import { seoInit, type SeoInitOptions } from './init.js'

export { seoInit, type SeoInitOptions }
export { seoSubmit } from './submit.js'
export { seoCheck } from './check.js'
export { seoReport } from './report.js'
export { seoAutomate } from './automate.js'

/**
 * bare `vhk seo` — 서브커맨드 라우터 fallback. 사용법을 안내한다.
 */
export function runSeo(): void {
  console.log(chalk.bold('\n🔍 vhk seo — SEO·수익 대시보드\n'))
  console.log('  사용법:')
  console.log('    ' + chalk.cyan('vhk seo init') + chalk.dim('     사이트 등록 + 자격증명 보관'))
  console.log('    ' + chalk.cyan('vhk seo submit') + chalk.dim('   사이트맵·IndexNow 제출'))
  console.log('    ' + chalk.cyan('vhk seo check') + chalk.dim('    색인·트래픽·수익 수집'))
  console.log('    ' + chalk.cyan('vhk seo report') + chalk.dim('   무빌드 HTML 대시보드'))
  console.log('    ' + chalk.cyan('vhk seo automate') + chalk.dim(' Notion 적재·스케줄러·확장슬롯'))
  console.log('')
  console.log(chalk.dim('  먼저 시작: vhk seo init --domain <도메인>'))
  console.log(chalk.dim('  ⚠️ submit/check/automate 실 연동은 자격증명(.env $VHK_SEO_*) 필요'))
  console.log('')
}
