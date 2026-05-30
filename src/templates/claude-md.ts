import { localDate } from '../lib/date.js'

export function CLAUDE_MD_TEMPLATE(name: string, _stack: string): string {
  const d = localDate(); // VHK-019
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  return [
    '---',
    'id: claude-md-' + slug,
    'date: ' + d,
    'tags: [process, documentation]',
    '---',
    '',
    '# 기록 규칙 (' + name + ')',
    '',
    '> 이 파일은 기록/운영 전용. 코딩/디자인 → .cursorrules 참조.',
    '> See also: AGENTS.md (`vhk sync` 로 생성 — Codex/OpenAI 계열 호환).',
    '',
    '## 현재 상태',
    '- **Phase:** Phase 1 — MVP',
    '- **블로커:** 없음',
    '- **다음 액션:** **FILL**',
    '- **마지막 업데이트:** ' + d,
    '',
    '## ADR',
    '기술/라이브러리 선택 시 docs/adr/ADR-{번호}-{제목}.md 생성.',
    '',
    '## 작업 로그',
    '세션 종료 시 docs/log/YYYY-MM-DD-{작업명}.md 생성.',
    '',
    '## 트러블슈팅',
    '에러 해결 시 docs/troubleshooting/TS-{번호}-{증상}.md',
    '',
    '## TIL',
    '새로 배운 개념 → docs/til.md 한 줄 추가',
    '',
    '## /done 커맨드',
    '세션 종료 → /done → 요약 자동 생성 → docs/log/ 저장',
    '',
    '## 종료 전 체크리스트',
    '1. ADR 2. 작업 로그 3. 트러블슈팅 4. TIL 5. /done',
  ].join('\n');
}
