export const ECOSYSTEM_MDC_VERSION = '3'

const START = `<!-- ECOSYSTEM-MDC:START v${ECOSYSTEM_MDC_VERSION} (vhk template — 직접 편집 금지) -->`
const END = '<!-- ECOSYSTEM-MDC:END -->'

export function ECOSYSTEM_MDC_TEMPLATE(): string {
  return [
    '---',
    'description: VHK project boundaries (Cursor-only)',
    'alwaysApply: true',
    '---',
    '',
    '# VHK Project Boundaries (Cursor-only)',
    '',
    START,
    '',
    '1. **실행 계층(vhk 명령)은 에이전트 무관** — 어떤 AI 에이전트가 실행해도 vhk 명령 자체는 동일하게 동작.',
    '2. **트리거 계층은 도구별 기능을 따른다** — 자동 훅이 없는 에이전트에서는 `vhk context`와 `vhk verify`를 명시적으로 실행한다.',
    '3. **Cursor** — Composer batch/repeat 보조; 코딩·반복 작업용.',
    '4. **Project rules** — 이 저장소의 `AGENTS.md`와 `RULES.md`를 우선한다. 별도 사용자 규칙 파일은 `VHK_RULES_FILE` 또는 `vhk config set-rules-file`로 연결한다.',
    '5. **Concurrency** — same repo + same branch에 에이전트 2개 금지; parallel은 worktree (`vhk worktree` / Cursor `--worktree`).',
    '6. **Derived files** — `AGENTS.md`·`.cursorrules` 손수 편집 금지 → `RULES.md` 수정 후 `vhk sync`. `.cursor/agents/`에 `.claude/agents/` 중복 금지.',
    '',
    END,
    '',
  ].join('\n')
}
