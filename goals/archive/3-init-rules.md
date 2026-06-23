---
vhk_format: 1
type: goal
id: 3
title: 배치1 — init adopt + RULES.md 항상 생성 + 5-tool sync 검증
status: DONE
priority: P1
version: v1.7
completed: 2026-05-30
---

# [배치 1] init adopt 모드 + RULES.md 항상 생성 + 5-tool sync 검증 (완치)

배치 0(sync 안전 가드)이 머지된 뒤 진행한다. RULES.md 생성은 여기서 단 한 번만 구현한다(§11 Phase2 == 프롬프트2-4 동일 작업).

## 공통 가드 (반드시 준수)
- Windows PowerShell 기준. bash heredoc/sh 금지. 게이트는 pnpm.cmd.
- 한국어 UX/별칭/문서 톤 유지. 사용자-facing 한국어를 영어로 바꾸지 마라.
- 사용자 변경 revert 금지. git status --short 먼저 확인, 기존 수정 보존, 최소 범위 패치.
- docs/state/blockers.md, learnings.md append-only.
- 기존 컨벤션 준수(safeExecFile, inquirer, chalk, ora, printNextStep, t()). 신규 의존성 금지.
- TDD. 이 배치 별도 커밋/PR. ko.ts 는 이 배치 문자열만.

## 먼저 읽을 것
- src/commands/init.ts (generateFiles — 현재 RULES.md 키 없음), sync.ts (RULES.md 파싱/생성, SYNC_TARGETS)
- src/lib/ 의 파일 생성 헬퍼, templates/ (vhk-dir 등)
- 기존 .cursorrules/CLAUDE.md/AGENTS.md/.windsurfrules/copilot 포맷

## 구현
### A. RULES.md 생성 흐름 (한 번만 — 중복 주의)
- greenfield init 도 RULES.md 템플릿을 항상 생성(init↔sync 흐름 연결). 현재 init 은 RULES.md 를 안 만드는데 sync 는 원본으로 요구 → 이 단절을 해소.
- RULES.md 가 없으면 현재 프로젝트용 기본 RULES.md 생성 흐름 보강(프롬프트2-4와 동일 작업).

### B. init adopt 모드 (브라운필드)
- src/lib/rules-import.ts 신규: 기존 .cursorrules/CLAUDE.md/AGENTS.md/.windsurfrules/copilot 를 섹션 파싱 → RULES.md 표준 섹션(## 기술 스택 / ## 코딩 규칙 / ## 기록 규칙 등)으로 병합(출처 주석 포함).
- init.ts: 기존 설정 파일 감지되면 "기존 규칙 N개 발견, RULES.md로 가져올까요?" → adopt. 충돌/중복 섹션은 사용자에게 보여주고 keep/merge 선택.
- 신규 모드와 자동 분기(설정 파일·.vhk/ 유무로 감지).

### C. 5-tool sync 산출 검증 (프롬프트2-4)
- vhk sync 로 .github/copilot-instructions.md, .agents/rules/vhk-rules.md, .windsurfrules 가 실제 생성되는지 테스트 추가.
- README 에 "Cursor/Copilot/Antigravity 에서 이렇게 말하세요" 섹션을 짧게 추가(자연어로 vhk 를 부르는 예시 문구).

## 테스트
- adopt: 기존 3개 파일 → RULES.md 섹션 병합 결과 스냅샷.
- greenfield: 빈 디렉터리 → RULES.md 포함 scaffold.
- sync 산출: copilot-instructions / vhk-rules / windsurfrules 실제 생성 확인.

## 게이트 (이 배치 끝)
- pnpm.cmd exec tsc --noEmit / pnpm.cmd run test:run / pnpm.cmd run build (모두 통과, 번들 급증 없음)
