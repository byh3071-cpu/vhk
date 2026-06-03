/**
 * RULES.md — 프로젝트 규칙의 단일 소스(Single Source of Truth).
 * `vhk sync` 가 이 파일을 파싱해 .cursorrules · .windsurfrules ·
 * .github/copilot-instructions.md · .agents/rules/vhk-rules.md · CLAUDE.md 를 생성한다.
 *
 * 섹션 제목은 sync.ts 의 CURSORRULES_KEYS / CLAUDE_MD_KEYS 와 정렬되어야
 * 각 도구 산출물에 본문이 실린다 (## 기술 스택 / ## 코딩 규칙 / ## 커밋 / ## 기록 등).
 */
export function RULES_MD_TEMPLATE(name: string, description: string, stack: string): string {
  const stackList = stack.split(' + ').map((s) => '- ' + s).join('\n')
  return [
    '# ' + name + ' — Rules',
    '',
    '> 프로젝트 규칙의 단일 소스(SoT). 규칙 변경은 항상 이 파일에서만.',
    '> `vhk sync` 가 Cursor·Claude·Windsurf·Copilot·Antigravity 규칙으로 전파합니다.',
    '',
    '## 프로젝트 정체성',
    '- 한 줄 설명: ' + description,
    '- 스택: ' + stack,
    '',
    '## 기술 스택',
    stackList,
    '',
    '## 코딩 규칙',
    '- TypeScript strict (any 금지)',
    '- try-catch 필수, 빈 catch 금지',
    '- console.log 프로덕션 제거',
    '- 파일명은 kebab-case',
    '',
    '## 커밋 컨벤션',
    '- feat: / fix: / refactor: / docs: / chore:',
    '',
    '## 기록 규칙',
    '- 세션 종료 시 docs/log/YYYY-MM-DD-{작업명}.md 생성',
    '- 기술 선택 시 docs/adr/ADR-{번호}-{제목}.md 생성',
    '- 기능 완성 / 에러 해결 / ADR / 세션 종료 시 Notion "바이브코딩 Dev Log" DB에 1행 적재 (Notion MCP)',
    '- 적재 직전 Dev Log DB 상단 "AI 적재 규칙" 콜아웃 확인 — 제목: (YYYY-MM-DD) 프로젝트명 - 제목',
    '- 태그는 기존 옵션만 사용, 같은 작업 중복 적재 금지(SoT Key)',
  ].join('\n')
}
