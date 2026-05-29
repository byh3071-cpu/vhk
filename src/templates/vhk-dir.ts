/**
 * `.vhk/` 디렉토리 씨앗(seed) 템플릿.
 * 규격: docs/spec.md (spec_version 1.0) — 평면 파일 구조.
 * vhk init 이 프로젝트 시작 시 README.md + context.md 를 미리 채운다.
 */

/** `.vhk/README.md` — 폴더 안내 + 트래킹 정책 */
export function VHK_README_TEMPLATE(): string {
  return [
    '# `.vhk/` — VHK runtime state',
    '',
    '이 디렉토리는 VHK가 프로젝트별 상태를 저장하는 곳입니다.',
    '전체 규격은 `docs/spec.md` (spec_version 1.0) 참조.',
    '',
    '## 트래킹 정책',
    '',
    '| 파일 | 트래킹 | 용도 |',
    '| --- | --- | --- |',
    '| `README.md` | ✅ | 본 안내 |',
    '| `context.md` | ✅ | 프로젝트 맥락 (`vhk context` 로 갱신) |',
    '| `brief.md` | ✅ | 상태 요약 브리핑 (`vhk brief`) |',
    '| `memory.json` | ❌ 로컬 전용 | 의사결정 메모 (`vhk memory add`) |',
    '| `refs.json` | ❌ 로컬 전용 | 참고 URL (`vhk ref add`) |',
    '| `HARD_STOP` | ❌ 로컬 전용 | 존재하면 모든 자동화 즉시 중단 |',
    '',
    '> `memory.json`·`refs.json` 은 개인 메모 노출 방지를 위해 `.gitignore` 에 등록됩니다.',
    '> `HARD_STOP` 해제는 `vhk resume --confirm` 으로만 가능합니다.',
    '',
  ].join('\n')
}

/**
 * `.vhk/context.md` 씨앗 — 유형별 스택 정보를 담아 처음부터 의미 있게 채운다.
 * 이후 `vhk context` 가 git/디렉토리 스캔으로 갱신한다.
 */
export function VHK_CONTEXT_SEED(
  name: string,
  type: string,
  stack: string[]
): string {
  const stackList = stack.map(s => '- ' + s).join('\n')
  return [
    '# ' + name + ' — 프로젝트 맥락',
    '',
    '> ⚡ 이 파일은 vhk init 이 생성한 씨앗입니다. `vhk context` 로 갱신하세요.',
    '',
    '## 프로젝트 유형',
    '- ' + type,
    '',
    '## 기술 스택',
    stackList,
    '',
    '## 주요 결정사항',
    '- (아직 없음 — `vhk memory add` 로 기록)',
    '',
    '## 다음 단계',
    '- docs/PRD.md 작성',
    '',
  ].join('\n')
}
