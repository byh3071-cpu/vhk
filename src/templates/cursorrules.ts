export function CURSORRULES_TEMPLATE(
  name: string, desc: string, stack: string
): string {
  const stackList = stack.split(' + ').map(s => '- ' + s).join('\n');
  return [
    '# ' + name + ' — Cursor Rules',
    '',
    '> 코딩/디자인 전용. 기록/운영 → CLAUDE.md 참조.',
    '',
    '## 프로젝트 정체성',
    '- 한 줄 설명: ' + desc,
    '- 스택: ' + stack,
    '',
    '## 필수 참조',
    '- docs/PRD.md · docs/ARCHITECTURE.md · CLAUDE.md',
    '',
    '## 기술 스택 (변경 시 ADR 필수)',
    stackList,
    '',
    '## 코딩 규칙',
    '- TypeScript strict (any 금지)',
    '- try-catch 필수, 빈 catch 금지',
    '- console.log 프로덕션 제거',
    '- 커밋: feat: / fix: / refactor: / docs: / chore:',
    '',
    '## 디자인 Anti-patterns',
    '- 보라-파랑 기본 그라디언트 금지',
    '- 과도한 둥근 모서리 (>16px) 금지',
    '- 그림자 중첩 · 장식 SVG 남발 금지',
  ].join('\n');
}
