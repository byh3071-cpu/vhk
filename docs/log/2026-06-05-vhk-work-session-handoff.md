---
date: 2026-06-05
project: VHK
version: Unreleased (버전 범프·발행 대기)
type: 세션로그
---

# 2026-06-05 — `vhk work` / `vhk work handoff` (AI 작업 세션 이어받기·인수인계)

## 요약

Claude CLI/Claude Code 가 컴퓨터 재시작으로 **세션 대화 기억이 휘발돼도**, repo 파일(CLAUDE.md·
next-task.md)과 VHK 상태로 빠르게 이어가도록 하는 진입점 2개를 CLI 제품 기능으로 추가.
**CLI 는 상태 수집 + Claude 에게 줄 프롬프트 준비만** 하고, 실제 판단·개발·커밋은 Claude 가 한다.
PowerShell 개인 함수가 아니라 VHK CLI 명령으로 넣어 PC-독립 제품 가치로 만듦.

- `vhk work` — 작업 시작/이어하기. git status + active goal + `.vhk/context.md` 갱신 → "시작 프롬프트" 생성 → 클립보드 복사.
- `vhk work handoff` — 중단 정리. git status 수집 → "인수인계 프롬프트"(완료/미완료 분리·테스트 기록·next-task 갱신·커밋 판단 요청) 생성 → 클립보드 복사.

별칭 `작업`/`인수인계`. 자연어 `이어서 작업`·`이어하기`·`인수인계` 라우팅. 1차는 **CLI 전용**(MCP 노출은 2차).

## 왜 (배경)

- 사용자는 비개발자. Claude Code 가 메인 엔진, Codex 보조. 세션 기억 휘발 시 "어디까지 했지"를 사람이 매번 설명하는 비효율.
- VHK 는 이미 기억을 파일에 둠: `CLAUDE.md`(메인 규칙·1순위) · `AGENTS.md`(Codex/보조 에이전트 참고) · `docs/context/agent-compact.md`(빠른 요약) · `docs/state/next-task.md`(다음 작업) · `.vhk/`(HARD_STOP·memory·context).
- 빠진 것 = **흩어진 상태를 한 번에 모아 Claude 에게 줄 시작/인계 프롬프트로 만드는 진입점**. 그걸 채움.
- 이름: `vhk resume --confirm` 은 HARD_STOP 해제 전용이라 충돌 회피 → `vhk work` 채택. `vhk start`(새 프로젝트 마법사)와도 별개.

## 무엇을 만들었나

### 신규 파일

- **`src/commands/work.ts`** — 핵심. `work()` / `workHandoff()` + 프롬프트 빌더(`buildStartPrompt`/`buildHandoffPrompt`, 테스트 위해 export).
  - 재사용 헬퍼 조합: `isHardStopActive`/`readHardStopReason`([src/lib/state-files.ts](../../src/lib/state-files.ts)), `listGoals`([src/lib/goal-frontmatter.ts](../../src/lib/goal-frontmatter.ts)) + `selectActiveId`([src/commands/goal.ts](../../src/commands/goal.ts)), `context({compact:true})`([src/commands/context.ts](../../src/commands/context.ts)), `safeExecFile`로 `git status --short`([src/lib/exec.ts](../../src/lib/exec.ts)), `printNextStep`([src/lib/next-step.ts](../../src/lib/next-step.ts)).
  - `refreshContextQuietly()` — `context()` 자체 콘솔 출력(헤더·printNextStep)이 work 흐름에 끼지 않게 `console.log` 를 잠시 억제 후 finally 복원.
  - `emitPrompt()` — 클립보드 복사 + 항상 `.vhk/work-prompt.md`·`.vhk/handoff-prompt.md` 사본 저장. 실패 시 화면에 프롬프트 전문 출력(폴백).
- **`src/lib/clipboard.ts`** — 외부 의존성 0 클립보드. `copyToClipboard(text): boolean`.
  - Windows: `powershell Set-Clipboard` 에 base64(UTF-8)를 **stdin 경유** 전달(한글 보존 + 명령줄 32K 한계 우회).
  - mac `pbcopy`, linux `wl-copy`→`xclip`→`xsel`. 어느 것도 실패하면 false → 호출자가 파일/화면 폴백.
- **`tests/work.test.ts`** (work/handoff 동작·프롬프트 내용·HARD_STOP 중단·폴백·git mutation 미호출) + **`tests/clipboard.test.ts`** (spawnSync mock 성공/실패/ENOENT/throw 분기).

### 수정 파일 (명령 등록은 4곳 정합 필수 — drift 가드가 강제)

- **`src/index.ts`** — `import { work, workHandoff }`, `KO_ALIASES.work='작업'`, `program.command('work').alias('작업')` + `.command('handoff').alias('인수인계')` (goal 서브명령 패턴).
- **`src/lib/nlp-router.ts`** — `NlpCommand` 에 `'work'`, `NLP_KEYWORDS.work=['이어서','이어하기','work']`, RULES 2개(handoff 먼저, 그다음 work 기본; work 기본 test 가 `matchesKeywords` 도 호출).
- **`src/lib/nlp-run.ts`** — `dispatchNlpRoute` switch 에 `case 'work'`(args[0]==='handoff' → workHandoff, 아니면 work).
- **`src/lib/command-registry.ts`** — `CONTAINER_SUBCOMMANDS.work=['handoff']` + `CONTAINER_ALIASES.작업='work'` (R1 드리프트 가드 단일 소스).
- **`src/lib/cli-args.ts`** — `KNOWN_COMMAND_TOKENS` 에 `'work','작업'` (없으면 `work handoff` 가 자연어로 둔갑).
- **`src/i18n/ko.ts`** — `ko.work.workTitle`/`handoffTitle`.

### 문서·기타

- `CHANGELOG.md` [Unreleased] Added · `CLAUDE.md`(테스트 852→868, 현재 상태에 진행중 명시) · `docs/context/agent-compact.md`("세션 이어받기" 섹션) · `.vhk/.gitignore`(`work-prompt.md`/`handoff-prompt.md` 추적 제외).

## 흐름 (실제 사용)

```
시작:   PowerShell 에서  vhk work       → 프롬프트 클립보드 복사 → claude → Ctrl+V → 이어서 작업
중단:   vhk work handoff               → 인수인계 프롬프트 복사 → claude → Ctrl+V → Claude 가 정리·next-task 갱신
```

## 안전 원칙 (전부 코드 반영·검증)

- `.vhk/HARD_STOP` 활성 시 두 명령 모두 즉시 중단(작업 전).
- git 은 `status --short` 읽기만 — commit/stash/reset/add/checkout/clean 0.
- 자동 커밋·자동 `vhk goal done` 0. 테스트 통과/완료 판정은 CLI 가 안 함 → Claude 가 판단(프롬프트에 "테스트 전 완료 금지" 명시).
- CLI 는 수집·프롬프트 준비만. 실제 판단·개발은 Claude.

## 검증

- 타입체크 `tsc --noEmit` 0 · 빌드 `tsup` OK · 테스트 **868 pass**(852 + 신규 16).
- E2E: `vhk work`/`vhk work handoff` 출력 + 클립보드 복사 성공. `Get-Clipboard` 로 한글 보존 확인.
- 자연어 `이어서 작업`→work, `인수인계`→work handoff, `이어하기`(단독)→work.
- 적대 리뷰(cavecrew-reviewer + 직접): 심각 버그 0. LOW 2건 발견·수정 — ① clipboard base64 32K 한계 → stdin 경유로 우회, ② NLP_KEYWORDS.work 죽은 데이터 → work 기본 규칙 test 에 `matchesKeywords` 추가.

## 교훈

- **신규 명령 등록은 4곳 정합 필수**: `index.ts` + `nlp-router.ts`(+`nlp-run.ts`) + `command-registry.ts` + `cli-args.ts`. 컨테이너(서브커맨드 보유) 명령은 누락 시 `command-registry.test.ts` 드리프트 가드가 실패시켜 R1(자연어가 명령 가로채기) 재발을 사전 차단.
- **Windows 클립보드 한글**: `clip.exe` 는 콘솔 코드페이지로 한글 깨짐 → PowerShell `Set-Clipboard` + base64(UTF-8) **stdin 경유**가 안전(한글 보존 + 32K 우회).
- **재사용 함수의 콘솔 출력 격리**: 통짜 함수(`context()`)를 흐름 중간에 부르면 그 출력(헤더·printNextStep)이 섞임 → `console.log` 임시 억제 + finally 복원.

## 다음 액션

- (사람) 커밋 — `main` 직접 금지, feature 브랜치 권장. `.vhk/context.md`(기존부터 untracked)는 제외하고 work 관련 파일만 add.
- 버전 범프 + 발행은 별도 라인 — 항상 `main` 에서만, 2FA 사람이.
- 2차: MCP tool 노출(`work` — TTY 없어 클립보드 스킵·텍스트만 반환), `work handoff --check`(원할 때만 goal check 실행), 프롬프트 커스터마이즈(`.vhk/work-template.md`).
