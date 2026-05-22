export function ADR_TEMPLATE(): string {
  return [
    '---',
    'id: ADR-000',
    'date: YYYY-MM-DD',
    'status: proposed',
    'tags: []',
    '---',
    '',
    '# ADR-000: 제목',
    '',
    '## 맥락 (Context)',
    '__FILL__',
    '',
    '## 결정 (Decision)',
    '__FILL__',
    '',
    '## 대안 (Alternatives)',
    '__FILL__',
    '',
    '## 결과 (Consequences)',
    '__FILL__',
  ].join('\n');
}
