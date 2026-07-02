export function RFC_README_TEMPLATE(): string {
  return [
    '# docs/rfc/ — Request for Comments (설계 문서)',
    '',
    '구현 전에 설계를 글로 검증하는 곳. 동기·아키텍처·범위(IN/OUT)·위험을 먼저 적고',
    '코드는 그 다음이다. ADR이 "결정의 기록"이라면 RFC는 "설계의 전개"다.',
    '',
    '- **네이밍**: `NNNN-슬러그.md` (4자리 zero-pad, 예: `0001-first-design.md`)',
    '- **언제 쓰나**: 여러 파일/단계에 걸친 기능 설계 · 실험 설계 · PR 분할 계획.',
    '- **유지 정책**: 상태(제안/수락/구현됨)를 머리에 표기. 구현 후에도 삭제하지 않는다 —',
    '  "왜 이 모양인가"의 원본 근거.',
  ].join('\n');
}

export function PATTERNS_README_TEMPLATE(): string {
  return [
    '# docs/patterns/ — 범용 패턴 사전',
    '',
    '이 프로젝트를 넘어 재사용 가능한 패턴만 모은다. 기준 3가지를 모두 만족할 때:',
    '①다른 프로젝트에서도 발생 가능 ②반복 가능 ③해결책 명확.',
    '',
    '- **네이밍**: `PAT-NNN-영문명.md` (3자리 zero-pad, 예: `PAT-001-example-pattern.md`).',
    '- **frontmatter**: id(PAT-NNN)·패턴명·증상·원인·해결·적용조건·태그·발견일 정도를 머리에 적는다.',
    '- **유지 정책**: 중복 생성 금지 — 만들기 전에 이 폴더를 먼저 확인한다.',
  ].join('\n');
}
