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
    '| `content-prompt.md` | ❌ 로컬 전용 | 콘텐츠 초안 프롬프트 — 재생성물 (`vhk content`) |',
    '| `launch-prompt.md` | ❌ 로컬 전용 | 런칭 게시물 프롬프트 — 재생성물 (`vhk launch`) |',
    '| `ops-prompt.md` | ❌ 로컬 전용 | 운영 회고 프롬프트 — 재생성물 (`vhk ops`) |',
    '| `sell-prompt.md` | ❌ 로컬 전용 | 판매 카피 프롬프트 — 재생성물 (`vhk sell`) |',
    '| `recall-log.jsonl` | ❌ 로컬 전용 | recall 사용 로그 — 검색어 원문(프라이버시) (`vhk recall`) |',
    '| `eval/recall-eval.json` | ❌ 로컬 전용 | recall 평가셋 — 라벨 쿼리(프라이버시) (`vhk memory eval --init`) |',
    '| `memory.json` | ❌ 로컬 전용 | 의사결정 메모 (`vhk memory add`) |',
    '| `refs.json` | ❌ 로컬 전용 | 참고 URL (`vhk ref add`) |',
    '| `HARD_STOP` | ❌ 로컬 전용 | 존재하면 모든 자동화 즉시 중단 |',
    '| `hooks/` | ✅ | SessionStart 커스터마이징 트리거 스크립트 |',
    '| `NEEDS_CUSTOMIZATION` | ❌ 로컬 전용 | 존재하면 첫 세션에서 도메인 인터뷰 트리거 |',
    '| `customization-done` | ❌ 로컬 전용 | 인터뷰 완료 마커 (재트리거 방지) |',
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
    '# 커스터마이징 트리거 마커 — 로컬 전용(존재-여부 신호, 내용 없음). hooks/ 스크립트 자체는 커밋(제외 아님).',
    'NEEDS_CUSTOMIZATION',
    'customization-done',
    '# 루프 1틱 앵커 — 블로커·교훈 평문 포함 → 원천(memory.json)과 동일 보호등급.',
    'loop-brief.md',
    '# 치명 규칙 재주입 — RULES.md 파생 재생성물(매 실행 갱신, 추적 불필요).',
    'remind.md',
    '# 부정 예시 후보 — failures 버킷(개인 메모) 파생 → 원천과 동일 보호등급.',
    'negative-candidates.md',
    '# 콘텐츠 초안 프롬프트 — 재생성물(매 실행 갱신, 추적 불필요).',
    'content-prompt.md',
    '# 런칭 게시물 프롬프트 — 재생성물(매 실행 갱신, 추적 불필요).',
    'launch-prompt.md',
    '# 운영 회고 프롬프트 — 재생성물(매 실행 갱신, 추적 불필요).',
    'ops-prompt.md',
    '# 판매 카피 프롬프트 — 재생성물(매 실행 갱신, 추적 불필요).',
    'sell-prompt.md',
    // #331: 사용자 검색어 원문 = 프라이버시. 공개 repo 에 커밋되면 개인 쿼리가 노출된다.
    // ⚠️ ledger.jsonl·events/ 는 의도적으로 추적(repo 영속 증거 — goal 45/82/85)이라 절대 여기 넣지 말 것.
    '# recall 사용 로그 — 사용자 검색어 원문 포함(프라이버시). 추적/유출 방지.',
    'recall-log.jsonl',
    '# recall 평가셋 — 라벨 쿼리(검색어) 포함(프라이버시). 추적/유출 방지.',
    'eval/recall-eval.json',
    '# secret gist 포인터 (gistId). 공개 repo 에 커밋되면 백업 gist 가 노출됨 (VHK-022).',
    'cloud.json',
    '# sync 덮어쓰기 전 자동 백업 (로컬 복구용 — vhk restore). 추적/클라우드 제외.',
    'backups/',
    // Goal 86 (RFC 0056 T1): 증거 영수증은 로컬 산출물. 추적하면 영수증 자신이 작업트리를
    // dirty 만들어 다음 receipt 의 증거 ②(dirty)를 오염(자기모순=늘 block). ledger/events 와 달리
    // repo 영속 증거가 아니므로 제외한다(.base-sha 기준선도 함께).
    '# 증거 영수증 — 로컬 산출물(추적하면 자기 dirty 증거 오염). vhk receipt.',
    'receipts/',
    '',
  ].join('\n')
}

/**
 * `.vhk/.gitattributes` — 증거 원장(events·ledger)에 merge=union 부여.
 * 멀티PC 에서 양쪽이 각자 append 한 커밋이 분기됐을 때, union 드라이버가 양쪽 줄을 모두
 * 보존해 자동 병합한다(충돌·줄 손실 0). events/ledger 는 추적 유지(untrack 금지) 전제 —
 * RFC0056·#315 증거 영속. 이 파일은 dirty-block(외부 pull fast-forward 차단)의 A축 해소.
 */
export function VHK_GITATTRIBUTES_TEMPLATE(): string {
  return [
    '# VHK 증거 원장(events·ledger) — 멀티PC 양쪽 append 분기 커밋 시 양쪽 줄 보존.',
    '# merge=union 은 git 내장 드라이버(별도 .gitconfig/merge driver 등록 불필요). untrack 금지(RFC0056·#315).',
    'events/*.jsonl merge=union',
    'ledger.jsonl merge=union',
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
  stack: string[],
  core: { source: 'live' | 'bundled'; version: string }
): string {
  const stackList = stack.map(s => '- ' + s).join('\n')
  const versionLabel = core.version === 'unknown' ? '버전 미상' : `v${core.version}`
  const coreLine =
    core.source === 'live'
      ? `- live — PRIVATE_RULES_ROOT 라이브 상속 (${versionLabel})`
      : `- bundled — 번들 스냅샷 (${versionLabel}) · PRIVATE_RULES_ROOT 미설정 또는 라이브 파일 읽기 실패, 최신 아닐 수 있음`
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
    '## 헌법(core-rules) 소스',
    coreLine,
    '',
    '## 주요 결정사항',
    '- (아직 없음 — `vhk memory add` 로 기록)',
    '',
    '## 다음 단계',
    '- docs/PRD.md 작성',
    '',
  ].join('\n')
}
