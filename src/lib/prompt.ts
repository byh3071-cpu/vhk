import type { Answers, QuestionCollection } from 'inquirer'

/**
 * inquirer 지연 로딩 래퍼 (RFC 0047 — 콜드스타트).
 * inquirer 는 단일 최대 무게(실측 ~212ms net = 콜드스타트 절반). top-level import 면
 * `vhk --version` 같은 비대화형 핫패스도 매번 로드 → 여기서 `await import()` 로 *프롬프트 실제 호출 시점*까지 미룬다.
 * 모든 호출부가 async(await prompt(...)) 라 안전. inquirer.prompt 외 API(Separator 등)는 미사용이라 이 래퍼로 충분.
 */
export async function prompt<T extends Answers = Answers>(questions: QuestionCollection): Promise<T> {
  const inquirer = (await import('inquirer')).default
  return inquirer.prompt<T>(questions)
}
