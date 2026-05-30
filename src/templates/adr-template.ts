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
    '**FILL**',
    '',
    '## 결정 (Decision)',
    '**FILL**',
    '',
    '## 대안 (Alternatives)',
    '**FILL**',
    '',
    '## 결과 (Consequences)',
    '**FILL**',
  ].join('\n');
}
