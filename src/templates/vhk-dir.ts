/**
 * `.vhk/` 디렉토리 씨앗(seed) 템플릿.
 * 규격: docs/spec.md (spec_version 1.1) — 평면 파일 구조.
 * vhk init 이 프로젝트 시작 시 README.md + context.md 를 미리 채운다.
 */

/** `.vhk/README.md` — 폴더 안내 + 트래킹 정책 */
export function VHK_README_TEMPLATE(): string {
  return [
    '# `.vhk/` — VHK runtime state',
    '',
    '이 디렉토리는 VHK가 프로젝트별 상태를 저장하는 곳입니다.',
    // VHK-006: 생성 프로젝트엔 docs/spec.md 가 없음 → vhk 저장소의 규격 문서를 외부 링크로 참조.
    '전체 규격은 [vhk 규격 문서](https://github.com/byh3071-cpu/vhk/blob/main/docs/spec.md) (spec_version 1.1) 참조.',
    '',
    '## 트래킹 정책',
    '',
    '| 파일 | 트래킹 | 용도 |',
    '| --- | --- | --- |',
    '| `README.md` | ✅ | 본 안내 |',
    '| `context.md` | ✅ | 프로젝트 맥락 (`vhk context` 로 갱신) |',
    '| `brief.md` | ✅ | 상태 요약 브리핑 (`vhk brief`) |',
    '| `loop-brief.md` | ❌ 로컬 전용 | 루프 1틱 앵커 — 블로커·교훈 평문 (`vhk loop-brief`) |',
    '| `remind.md` | ❌ 로컬 전용 | 치명 규칙 재주입 — RULES.md 파생 재생성물 (`vhk remind`) |',
    '| `negative-candidates.md` | ❌ 로컬 전용 | 부정 예시 후보 — failures 파생 (`vhk evolve negatives`) |',
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
 * `.vhk/.gitignore` — 로컬 전용 파일을 폴더 단위로 자기방어.
 * init 으로 만든 프로젝트 어디서나 docs/spec.md 의 트래킹 정책을 자동 이행한다.
 */
export function VHK_GITIGNORE_TEMPLATE(): string {
  return [
    '# VHK 로컬 전용 — 개인 메모/참고링크/안전신호 (.vhk/README.md 트래킹 정책)',
    'memory.json',
    'refs.json',
    'HARD_STOP',
    '# 루프 1틱 앵커 — 블로커·교훈 평문 포함 → 원천(memory.json)과 동일 보호등급.',
    'loop-brief.md',
    '# 치명 규칙 재주입 — RULES.md 파생 재생성물(매 실행 갱신, 추적 불필요).',
    'remind.md',
    '# 부정 예시 후보 — failures 버킷(개인 메모) 파생 → 원천과 동일 보호등급.',
    'negative-candidates.md',
    '# secret gist 포인터 (gistId). 공개 repo 에 커밋되면 백업 gist 가 노출됨 (VHK-022).',
    'cloud.json',
    '# sync 덮어쓰기 전 자동 백업 (로컬 복구용 — vhk restore). 추적/클라우드 제외.',
    'backups/',
    '',
  ].join('\n')
}

/**
 * 루트 `.vhkignore` 씨앗 — `vhk cloud push` 백업에서 제외할 .vhk/ 파일 지정.
 * 기본 제외(memory.json·refs.json·HARD_STOP·cloud.json·.gitignore)는 코드에 내장되어
 * 있으므로, 이 파일은 사용자가 추가로 제외할 항목을 적는 용도다.
 */
export function VHK_IGNORE_TEMPLATE(): string {
  return [
    '# vhk cloud push 백업에서 제외할 .vhk/ 파일 (한 줄에 하나)',
    '# 기본 제외(자동): memory.json, refs.json, HARD_STOP, cloud.json, .gitignore',
    '# 예) 아래 주석을 풀면 brief.md 도 백업에서 제외됩니다.',
    '# brief.md',
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
