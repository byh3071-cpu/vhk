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
    '## 안전 규칙',
    '- 고위험 작업(매매·송금·발송·삭제·배포·publish)은 LLM 결정경로에서 제외 — 룰+하드리밋으로 구현 (PAT-003)',
    '- MCP 고위험 도구(save/undo 등 상태변경)는 confirm:true 명시 전 실제 실행 금지 (기본 미리보기 — 옵트인)',
    '- publish · main 직접 push 는 사람 승인 후에만',
    '',
    '## 커밋 컨벤션',
    '- feat: / fix: / refactor: / docs: / chore:',
    '',
    '## 기록 규칙',
    '- 세션 종료 시 docs/log/YYYY-MM-DD-{작업명}.md 생성',
    '- 세션 종료 시 `vhk work handoff` 실행 — 미기록 ADR·트러블슈팅 후보를 자동 수확(자문형)',
    '- 기록 집행 3겹(RFC 0061): 규칙 선언 + 커밋훅(세션일지 없는 src 커밋 차단 — 훅이 막으면 AI 가 일지 작성 후 재커밋, 사소한 변경은 커밋 메시지 `[skip-record]` 로 우회) + 세션종료 수확',
    '- 기술 선택 시 docs/adr/ADR-{번호}-{제목}.md 생성',
    '- 기능 완성 / 에러 해결 / ADR / 세션 종료 시 Notion "바이브코딩 Dev Log" DB에 1행 적재 (Notion MCP)',
    '- 적재 직전 Dev Log DB 상단 "AI 적재 규칙" 콜아웃 확인 — 제목: (YYYY-MM-DD) 프로젝트명 - 제목',
    '- 태그는 기존 옵션만 사용, 같은 작업 중복 적재 금지(SoT Key)',
  ].join('\n')
}
