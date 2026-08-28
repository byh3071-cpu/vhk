# 📋 한국어 명령어 가이드

이 프로젝트에서 자주 쓰는 명령어입니다.
Cursor에게 한국어로 말해도 됩니다.

## 새 프로젝트 시작

| 하고 싶은 것 | 터미널 명령 | 결과 |
|-------------|-----------|------|
| 기술 스택을 바로 확정 | `vhk start --stack "Vite, React, TypeScript"` | 지정한 기술 스택을 확정값으로 기록 |
| 기술 스택을 나중에 확정 | `vhk start` | 자동 감지·유형 프리셋을 후보로 기록하고 첫 세션에서 확인 |
| GitHub PR 검사까지 생성 | `vhk init -y --ci` | 검증·규칙·공개 경계가 묶인 `.github/workflows/vhk-gate.yml` 생성 |

> `--stack`의 값은 쉼표로 구분합니다. 비어 있거나 공백뿐이면 확정으로 기록하지 않고 후보 흐름으로 돌아갑니다.
>
> 기존 `.github/workflows/*.yml` 또는 `*.yaml`이 있으면 `--ci`는 아무 파일도 덮어쓰지 않고 병합을 안내합니다. 생성 후 GitHub **Settings → Rules**에서 상태 검사 `VHK Gate`를 필수로 지정해야 실패한 PR의 병합이 실제로 막힙니다.
>
> 기존 규칙을 가져올 때 같은 관리 구역은 하나로 정리합니다. 같은 이름의 내용이 다르거나 `BEGIN/END` 표시가 깨졌으면 원본을 바꾸지 않고 중단하며, 표시를 고친 뒤 `vhk init`을 다시 실행하도록 안내합니다.
>
> 설치 점검은 `규칙 파일 9/9`와 핵심 규칙의 출처를 구분합니다. 사용자 규칙 파일을 읽으면 그 버전을, VHK 내장 기본 규칙을 사용하면 경고와 `vhk config set-rules-file <HOME>/sample-rules.yaml` 복구 명령을 표시합니다.

## 도움말

| 범위 | 명령 | 표시 내용 |
|------|------|----------|
| 기본 명령 | `vhk --help` 또는 `vhk help` | 코딩 하네스 중심 명령 |
| 전체 명령 | `vhk help --all` | 기본 명령 + 마케팅·커머스 8종(`content`·`launch`·`ops`·`sell`·`seo`·`cost`·`design-palette`·`theme`) |

> 기본 목록에서 숨긴 8종도 삭제되거나 비활성화된 것이 아닙니다. 이름을 직접 입력하면 그대로 실행됩니다.

## 매일 쓰는 명령어

| 하고 싶은 것 | 터미널 명령 | Cursor에게 말하기 |
|-------------|-----------|------------------|
| 저장 | `git add . && git commit -m "메시지"` | "저장해" |
| 오늘 정리 | `vhk 정리` | "오늘 한 일 정리해" |
| 규칙 점검 | `vhk 점검` | "규칙 점검해" |
| 규칙 동기화 | `vhk 규칙` | "규칙 동기화해" |
| 보안 스캔 | `vhk 보안 scan` | "보안 스캔 돌려" |

> 🤖 **헤드리스/AI 실행:** `vhk recap`(오늘 정리)은 비-TTY(파이프·AI 에이전트 셸)에서도 동작합니다 — `--summary` · `--next` · `--decisions` · `--blockers` 로 내용을 넘기거나 `--yes` 로 기본값을 씁니다. 미지정 항목은 "미입력"으로 기록되고, ADR/트러블슈팅 문서 **생성**은 대화형(터미널)에서만 진행돼요(비-TTY 에서는 후보만 보고). (#288)

> `vhk sync` 대상(7): `.cursorrules` · `.windsurfrules` · `.github/copilot-instructions.md` · `.agents/rules/vhk-rules.md` · `AGENTS.md` · `GEMINI.md`(Gemini CLI) · `.clinerules/vhk-rules.md`(Cline) + `CLAUDE.md`(하이브리드). 모두 RULES.md 단일소스에서 생성.
>
> `vhk sync --check`가 미연결 섹션을 찾으면 실제 섹션명, 인식하는 표준 제목, 두 해결 방법을 함께 보여줍니다. 제목에 맞는 표준 말을 넣거나 제목 뒤에 `<!-- vhk:sync=all -->`을 붙이세요. 미연결 경고만으로는 기존 종료 코드를 실패로 바꾸지 않습니다.

## Cursor bootstrap (#467)

| 하고 싶은 것 | 터미널 명령 | Cursor에게 말하기 |
|-------------|-----------|------------------|
| Cursor 독푸딩 (설치+배선) | `vhk bootstrap cursor` (`-y`, `--skip-verify`) | "VHK 독푸딩 해줘" |

> doctor → goal migrate --dry-run → inject-bootstrap → mcp-init → sync → `.cursor/skills/vhk-*` 5종 → verify(선택). brownfield Cursor 마이그레이션용. VHK가 그대로 생성했던 구형 skill은 버전 확인 후 안전하게 갱신하고, 사용자가 고친 구형 skill은 덮어쓰지 않은 채 수동 병합 경고를 냅니다. 검증 skill은 프로젝트별 패키지 명령을 추측하지 않고 `vhk verify`에 위임합니다.

| 빌드+테스트 | `pnpm build; pnpm test --run` | "빌드하고 테스트 돌려" |
| 배포 | `vhk 배포` | "배포해" |

## Goal 단계별 미션 (v1.2+)

| 하고 싶은 것 | 터미널 명령 | Cursor에게 말하기 |
|-------------|-----------|------------------|
| goals/ 스캐폴딩 | `vhk goal init` | (대상 프로젝트에서 직접) |
| goal frontmatter 마이그레이션 | `vhk goal migrate` (`--dry-run`) | "goal 스키마 맞춰줘" |
| goal 목록 | `vhk goal list` | "목표 목록" |
| 다음 goal | `vhk goal next` | "다음 목표" |
| 다음 goal 미리보기(읽기전용) | `vhk goal peek` | "목표 미리보기" |
| Goal Phase/Task JSON(읽기전용) | `vhk context --json` | — |
| 게이트 검증 | `vhk goal check --id 0` 또는 `vhk check --goal 0` | "목표 점검" |
| 완료 처리 | `vhk goal done --id 0` | "목표 완료" |

Goal frontmatter에 `depends_on: 1,2`를 선택적으로 쓰면 선행 Goal이 모두 `DONE`일 때만 `next/peek/done` 대상이 됩니다. 잘못된 ID·자기 참조·순환 참조는 설정 오류로 표시됩니다.

`goal next`는 선택 가능한 Goal 없이 BLOCKED·DEFERRED·OBSERVING만 남으면 “모두 완료”로 쓰지 않고 사람이 쓴 `next-task.md`를 보존합니다. VHK가 만든 과거 완료 스냅샷이 거짓 상태가 되면 완료 표시와 시각을 함께 무효화합니다. 미해결 Goal 없이 DONE/CANCELED만 남으면 기존 `next-task.md`가 있을 때만 백업 후 완료 스냅샷으로 갱신하고, 파일이 없으면 만들지 않습니다. 이미 완료 스냅샷이면 시각·백업을 다시 만들지 않습니다.

### Goal 본문 Phase/Task JSON

코드 펜스 밖의 정확한 `### Phase N`과 `- [ ] **Task N** 설명`만 읽습니다. Phase 번호와 Goal
전체의 Task 번호는 각각 양수·고유·오름차순이어야 하며 결번은 허용합니다.
Phase/Task는 선택 사항이며, Phase가 없는 legacy Goal도 호환됩니다.

```markdown
### Phase 10
- [x] **Task 100** 구현 / 증거: sample-evidence
- [ ] **Task 105** `(na)` 제외 이유

### Phase 30
- [ ] **Task 220** 검증 / evidence: sample-report
```

- `[ ]`은 `pending`, `[x]`/`[X]`는 `completed`입니다. Task 라벨 직후의 정확한 backticked `(na)`를
  쓴 `[ ]` Task만 `notApplicable`이며 checked+`(na)`는 구조 오류입니다.
- malformed Phase와 Phase 밖 Task는 구조 오류입니다. Phase가 없는 legacy Goal은 `valid: true`,
  `activeGoal.phases: []`, `activeGoal.tasks: []`, `NO_PHASES` warning, exit 0을 반환합니다.
- `/ 증거:`와 `/ evidence:`는 같은 선택적 `evidenceHint`이며 완료 증거가 아닙니다.
- `completed`·`notApplicable`은 `terminal`입니다. 첫 Phase pending은 `ready`, 이후 Phase pending은
  직전 Phase의 모든 Task가 terminal일 때만 `ready`, 아니면 `waiting`입니다.
- 첫 Phase의 `dependsOn`은 `[]`입니다. 이후 Phase의 각 Task는 직전 Phase의 모든
  `goal:N/task:N` string ID를 문서 순서대로 가집니다. 같은 Phase Task끼리는 서로 의존하지 않지만
  자동 병렬 실행을 보장하지 않습니다.
- `vhk context --json`은 성공·실패 모두 파일을 쓰지 않습니다. 구조·flag·공개 경계 오류는
  원문·절대경로·stack 없이 `valid: false`, `activeGoal: null`, 안정적인 `errors` JSON과 exit 1로
  끝납니다. `--compact --json` 조합도 같은 안전한 오류입니다.
- 공개 경계는 시크릿·토큰·키, 홈 절대경로, 개인 이메일·실명·저장소명, 실제 외부 객체 ID를 차단하고
  차단된 입력 원문을 노출하지 않습니다. 예시는 `sample-*`, `<HOME>`, 명백히 가짜 ID만 사용합니다.
- `--compact --json` 충돌은 `valid: false`와 exit 1인 flag 구조 오류입니다.

## 적대적 자기검증 (review)

| 하고 싶은 것 | 터미널 명령 | Cursor에게 말하기 |
|-------------|-----------|------------------|
| 거짓완료 심문 | `vhk review` (또는 `--id <n>`) | "거짓완료 없는지 검토해" |

> `review` 는 증거(latest.json)와 goal 완료조건을 교차검증해 "거짓완료 의심"을 찾습니다. 판정은 신뢰도 신호이며 보장이 아닙니다(미검증·stale 증거는 통과로 취급하지 않음).

> `vhk review` 자체는 active Goal이 없으면 exit 1입니다. 다만 모든 Goal이 정상 DONE인 branch closeout은 Goal 손상이 아니므로, 생성되는 `vhk-gate` skill은 이를 `review N/A`와 branch receipt 경로로 안내합니다. `goal-health`는 Goal 파일이 깨졌거나 무시된 경우에만 사용합니다.

## 증거 영수증 (receipt — RFC 0056 T1)

| 하고 싶은 것 | 터미널 명령 | Cursor에게 말하기 |
|-------------|-----------|------------------|
| 영수증 떼기 (4대 기계증거) | `vhk receipt` | "증거 영수증 떼줘" |
| 변경·의도 대조 기준선 기록 | `vhk receipt --mark-start` | "작업 시작점 찍어줘" |
| 기계용 JSON 출력 | `vhk receipt --json` | — |

> `receipt` 는 에이전트가 "됐어요"라고 한 순간 검증을 새로 실행하고, **4대 기계증거**(① verify 5개 게이트 — typecheck/lint/test/build 실종료코드 + secure scan 결과 ② git dirty ③ 검증 시작 SHA·dirty와 게이트 종료 후 HEAD·dirty의 stale 대조 ④ 변경라인 diff-cover)를 모아 `.vhk/receipts/<날짜-decision-시각>.{json,md}` 영수증 1장으로 굳힙니다. `--mark-start`는 stale 복구가 아니라 작업 이후의 커밋된 변경까지 intent/forbidden 검사에 포함할 시작 SHA만 기록합니다. `decision = block|caution|pass` 는 **기계증거로만(LLM 추론 0)** — 실차단(red·dirty·known stale·mission forbidden 위반) 중 하나라도면 block, stale 판정에 필요한 커밋을 식별하지 못하면 caution(exit 0), ④ diff-cover 는 advisory(약신호)라 차단시키지 못합니다. block 이면 exit 1. **이 영수증은 게으른 거짓완료(빌드 깨짐·미커밋·낡은 증거)를 잡지, 미묘한 오류(그럴듯하게 틀린 코드)는 못 잡습니다.**

## 미션 계약 (mission)

| 하고 싶은 것 | 터미널 명령 | Cursor에게 말하기 |
|-------------|-----------|------------------|
| 작업 범위 선언 | `vhk mission set --objective "..." --scope "src/**" --forbidden "**/*.env"` | "미션 정해줘" |
| 현재 계약 보기 | `vhk mission` (또는 `vhk mission show`) | "미션 보여줘" |
| 변경이 계약 안인지 검증 | `vhk mission check` | "미션 검증해" |
| 계약 삭제 | `vhk mission clear` | — |

> `mission` 은 작업의 목표·허용/금지 범위를 `.vhk/mission.json` 계약으로 선언하고, 변경 파일이 계약(scope/forbidden glob) 안인지 검증합니다. **경로 glob 기준**이며 objective 의미 부합은 검증하지 않습니다(보장 아님). forbidden 위반 시 exit 1.

## 비용·예산 가드 (cost — Goal 56)

| 하고 싶은 것 | 터미널 명령 | 설명 |
|-------------|-----------|------|
| 월 예산 설정 | `vhk cost budget 100` | `.vhk/config.json` 에 예산($) 저장 |
| 사용량 기록 | `vhk cost add --usd 5` (또는 `--in N --out N --model M`) | `.vhk/cost.jsonl` append. 환경변수 `VHK_COST_*` 주입도 가능 |
| 상태 조회 | `vhk cost` | 예산·누적 사용량·임계(%) |
| 임계 집행 | `vhk cost check` | 80% 경고 · 100% **이상** 차단(비대화형+미승인 exit 1, `--yes` 로 승인) |

> ⚠️ vhk 는 Claude API 를 직접 호출하지 않아 비용을 **자동 추적하지 못합니다**. 사용량은 외부 입력(수동 `cost add` / 환경변수)으로 먹이는 **자문형** 가드입니다 — `check` 는 신호(exit code)로 CI/agent 가 멈추게 합니다. 요율(pricing)은 `.vhk/config.json` 에 주입(코드 하드코딩 0).

## 기억 v2 (memory — 4버킷)

| 하고 싶은 것 | 터미널 명령 | Cursor에게 말하기 |
|-------------|-----------|------------------|
| 결정 기록 | `vhk memory add "tRPC 채택" --type decision` | "이거 기억해" |
| 실패+교훈 기록 | `vhk memory add "테스트 미커버" --type failure --why "..." --lesson "회귀 가드 먼저"` | "이 실수 기억해" |
| 성공 기록 | `vhk memory add "롤백 빨랐다" --type success --why "백업 먼저"` | "이 성공 기억해" |
| 교훈만 빠르게 | `vhk learn "PowerShell 은 && 미지원"` | "교훈 남겨" |
| 성공만 빠르게 | `vhk win "worktree 병렬로 충돌 0 머지"` | "성공 남겨" |
| 목록 | `vhk memory list [--type failure] [--all]` | "기억 보여줘" |
| 보관(선순환) | `vhk memory archive <번호>` | "이거 보관해" |
| 삭제 / 해결 / 보관해제 | `vhk memory remove <번호>` · `vhk memory resolve <번호>` · `vhk memory unarchive <번호>` | "이 기억 지워/해결/복원" |
| recall 품질 평가 | `vhk memory eval [--init]` | "기억 검색 평가해" (RFC 0049 · #488: 후보 0 쿼리도 전체 기억에서 정답 지정 가능 — 히트 밖 정답은 miss 라벨) |
| v1→v2 변환 | `vhk memory migrate` | — |

> **v2.0 BREAKING**: 평면 memory.json → 4버킷(결정/실패/성공/패턴). **조회 명령(`vhk memory list`·`context`·`brief`) 첫 실행 시에도 v1→v2 자동 마이그레이션 + `.v1.bak` 원본 백업**(어느 명령으로 먼저 실행해도 동일). **교훈은 `vhk learn`·`vhk memory add --type failure --lesson` 단일 SoT** (구 `docs/state/learnings.md` 분리 폐지·흡수). 보관(archive)된 항목은 패턴·진화에서 제외(선순환).

## 출고 전 안전점검 (preflight)

| 하고 싶은 것 | 터미널 명령 | Cursor에게 말하기 |
|-------------|-----------|------------------|
| 출고 전 일괄 점검 | `vhk preflight` | "출고 전 점검해" |
| publish 직전 점검 | `vhk preflight --publish` | "출시 전 점검해" |
| PR 직전 점검 | `vhk preflight --pr` | "PR 전 점검해" |
| 테스트 전체 실행 | `vhk preflight --full` | "전체 테스트로 점검해" |

> `preflight` 는 publish/PR 직전 **2FA·shim·worktree env·lint·타입·테스트·git·브랜치·문서신선도 9개**를 한 번에 점검합니다. 치명(🔴: env/lint/타입/테스트) 실패가 1개라도 있으면 `--force` 없이 차단(exit 1). 문서신선도(`docs/state/next-task.md` 7일 이상 미갱신)는 경고만, 차단 안 함. 기본 테스트는 `vitest --changed`(통과분 캐시 스킵), `--full` 로 전체 실행. (읽기 전용 — 자동 수정은 후속)

## worktree 가드 (worktree)

| 하고 싶은 것 | 터미널 명령 | Cursor에게 말하기 |
|-------------|-----------|------------------|
| 새 worktree 생성 + env 복사 | `vhk worktree add feat/login` | "worktree 만들어줘" |
| 생성 + pnpm install까지 | `vhk worktree add feat/login --install` | "worktree 만들고 설치까지" |
| 현재 worktree env 점검 | `vhk worktree check` | "worktree env 점검해" |

> `worktree add` 는 `git worktree add` 로 새 worktree를 만들고 필수 env/설정(`.env*` + `.vhk/config.json`의 `worktreeCopy`)을 **파일 복사**(심볼릭 링크 X — Windows 안정)로 채웁니다. 비밀값은 **절대 출력 안 함**(env는 키 개수만). 대상 경로가 이미 있으면 덮어쓰지 않고 중단. git 훅은 건드리지 않습니다. `worktree check` 는 현재 worktree의 필수 env 누락을 개수로 점검(Goal 29 `worktree-env` 모듈 재사용).

## 패턴 → 진화 (pattern / evolve)

| 하고 싶은 것 | 터미널 명령 | Cursor에게 말하기 |
|-------------|-----------|------------------|
| 반복 패턴 감지 + 새 규칙 후보 즉시 표시 | `vhk pattern detect` | "패턴 찾아줘" |
| 현재 7일 룰 후보 확인(저장 없음) | `vhk evolve suggest` | "규칙 제안해" |
| 부정 예시 후보 수집 | `vhk evolve negatives` | "실패에서 하지 말 것 뽑아줘" |
| cold-start 역채굴(PAT·failures·TS → patterns) | `vhk evolve seed` (미리보기) · `vhk evolve seed --write` (실반영) | "과거 기록으로 패턴 채워줘" |
| 현재 후보·결정 목록 / 사람 확인 반영 / 기각 / 되돌리기 | `vhk evolve list` · `vhk evolve apply <id>` · `vhk evolve reject <id> [reason]` · `vhk evolve undo` | "규칙 반영해" |
| 현재 후보 묶음(신뢰도별·읽기전용) | `vhk evolve digest` | "후보 묶어서 초안 보여줘" |

> 새 후보는 `queue.json`에 저장되지 않고 패턴 생성 후 7일 동안만 계산됩니다. `suggest --json`과 MCP 조회는 읽기 전용이며, RULES 반영은 TTY에서 `apply`를 확인한 경우에만 실행됩니다.

## SEO·수익 대시보드 (seo — Goals 21~26)

| 하고 싶은 것 | 터미널 명령 | 설명 |
|-------------|-----------|------|
| 사이트 등록 + 자격증명 | `vhk seo init` | `.vhk/seo/`(로컬 전용)에 설정 — 값은 `.env`, 설정엔 `$이름` 참조만 |
| 사이트맵 제출 | `vhk seo submit` | 사이트맵 + IndexNow 핑 |
| 색인/수익 점검 | `vhk seo check` | GSC·GA4·AdSense 조회 (자격증명 필요) |
| 리포트 | `vhk seo report` | 기간 요약 |
| 자동화 | `vhk seo automate` | 주기 실행 스캐폴드 |

## 사용자 설정 (config)

| 하고 싶은 것 | 터미널 명령 | 설명 |
|-------------|-----------|------|
| 사용자 규칙 YAML 등록 | `vhk config set-rules-file <HOME>/sample-rules.yaml` | 유효성을 확인한 뒤 `~/.vhk/config.json`의 `rulesFile`에 저장 — 다음 명령부터 즉시 반영, 한글 별칭 `vhk 설정 규칙파일` |

## 환경 점검

```bash
vhk doctor
```

## 전체 명령 카탈로그 (Goal 64 — registry 와 1:1)

> 이 표는 `src/lib/command-registry.ts` TOP_LEVEL_COMMANDS 와 테스트
> (tests/commands-doc.test.ts)로 **전수 일치가 강제**됩니다 — 새 명령을 등록하면
> 여기에도 행을 추가해야 CI 가 통과합니다. 상세 사용법은 위 섹션·`vhk <명령> --help`.

| 명령 | 하는 일 |
|------|---------|
| `vhk gate` | 아이디어 검증 |
| `vhk start` | 새 프로젝트 시작 마법사 (`--stack "Vite, React, TypeScript"` = 기술 스택 확정, 미지정 = 후보) |
| `vhk bootstrap` | Cursor/에이전트 배선 bootstrap (서브: `cursor`) |
| `vhk init` | 하네스 파일 생성 + 기록 집행 커밋훅 배선. `--ci`를 붙이면 GitHub PR 필수 검사 워크플로 생성(기존 워크플로 보존) |
| `vhk recap` | 오늘 한 일 정리 + ADR 분리 (비-TTY/헤드리스: `--summary/--next/--decisions/--blockers/--yes`) |
| `vhk sync` | RULES.md → 규칙 파일 동기화. `<!-- vhk:sync=all -->` 절은 8개 타겟 필수. `--check`는 재생성 결과 불일치와 필수 섹션 누락을 별도 집계하고, 문서-실측 drift는 경고로 표시 |
| `vhk check` | RULES.md 규칙 점검. 규칙 줄의 `<!-- vhk:check=no-exec-sync -->`를 `scripts/check-rule-no-exec-sync.mjs`에 연결하며 검사 비율 출력 (`--json` = 선언·검사·미검사 수와 비율 포함) |
| `vhk policy` | 자율 실행 권한 정책. `level`·`risk`·`show`·`check -- <실행파일 argv...>`은 읽기 전용(원장 기록·대상 실행 없음, allow 0·require-human 2·deny 1). `check`에는 파이프·연쇄·치환을 붙이지 않고 각 명령을 따로 전달. `policy baseline --confirm`만 현재 설정 또는 설정 없는 기본 off 상태를 사람이 고정하는 고위험 쓰기 명령이며 자동 생성·갱신하지 않음. 한글: `정책 단계`·`정책 위험도`·`정책 보기`·`정책 검사`·`정책 기준선` |
| `vhk secure` | 보안 스캔 (시크릿 유출 검사). `secure scan <파일...>` = 발행물 초안 등 특정 파일만(.md 포함) — 게시 전 게이트(#457), CRITICAL/HIGH 시 exit 1 |
| `vhk cloud` | .vhk 비공개 Gist 백업·복원 (push/pull). 공개 Gist·링크 경계·비호환/충돌 파일명·부분 fetch는 쓰기 전에 실패 폐쇄 |
| `vhk ship` | 배포 체크리스트 + 회고 |
| `vhk doctor` | 개발 환경 점검 + 최신 변경사항이 빠진 안내·아직 시작하지 않은 작업 알림 (`--strict` 설정 불일치 검사 포함) |
| `vhk save` | git 저장 (add → commit → push) · 커밋 메시지 미지정 시 변경 파일 기반 자동 생성, `-m "메시지"` 로 직접 지정 |
| `vhk undo` | 최근 커밋 되돌리기 |
| `vhk restore` | sync 백업 복원 |
| `vhk status` | 프로젝트 상태 대시보드 |
| `vhk stats` | 통계 대시보드 — 패스율/차단율/진화 채택률/자율 완주율/병목 계측 (읽기 전용). 병목 섹션은 `gh` 로 GitHub PR 을 조회한다(수 초 소요) — `gh` 미설치·미인증이면 그 섹션만 "측정 불가"로 표기 |
| `vhk stats --trend` | receipt-log 시계열 추세(거짓완료 판정 추이) + evolve 채택률·RULES.md 위반수 추세 (#374, 읽기 전용) |
| `vhk loop` | 자가진화 조율 1틱 — 닫힌 것/다음 한 수 (읽기 전용, 집행 0) |
| `vhk diff` | Git 변경사항 한국어 요약 |
| `vhk diff-cover` | 이번 변경이 테스트로 커버됐는지 측정 (자문형) |
| `vhk mcp` | MCP 서버 시작 (stdio) |
| `vhk mcp-init` | Cursor·Claude Desktop MCP 설정 생성 |
| `vhk inject-bootstrap` | tier S harness (ecosystem.mdc · CORE-RULES · context seed · mcp.json.example) |
| `vhk deploy` | 프로덕션 배포 (자동 감지) |
| `vhk env` | .env → .env.example 동기화 |
| `vhk env-check` | 필수 환경변수 누락 검사 |
| `vhk publish` | npm 배포 (버전 범프 → 빌드 → 테스트) |
| `vhk design` | 디자인 토큰 생성 (팔레트 선택은 별도 `vhk design-palette` 명령) |
| `vhk design-palette` | 컬러 팔레트 프리셋 선택 (별도 top-level 명령 — `design palette` 아님) |
| `vhk theme` | 다크/라이트 모드 CSS 생성 |
| `vhk ref` | 레퍼런스 URL 관리 (add/list/open) |
| `vhk harness` | 통합 품질 점검 (lint+type+test+build) |
| `vhk audit` | 보안 취약점 감사 (npm audit) |
| `vhk migrate` | 패키지 매니저 전환 (npm/yarn/pnpm) |
| `vhk update` | VHK CLI 셀프 업데이트 |
| `vhk context` | 프로젝트 맥락 파일 생성 (.vhk/context.md) · `--json`은 Goal Phase/Task 읽기 전용 투영 |
| `vhk mode` | Safety Mode 조회/변경 (lite\|standard\|strict) |
| `vhk verify` | 검증 실행 + 확인이 필요한 항목의 경과 시간·숨긴 횟수 + 증거·행동 기록 (`--dismiss <id>`) |
| `vhk cost` | 비용·예산 가드 — add/check/budget (자문형) |
| `vhk preflight` | 출고 전 안전점검 (치명 실패 시 차단) |
| `vhk testmap` | test-first 매핑 점검 (변경 기능 ↔ 테스트 누락 경고) |
| `vhk worktree` | worktree 가드 — env/설정 자동 복사·누락 점검 (add/check) |
| `vhk standup` | 아침 브리핑 (어제 한 일 + 오늘 추천 goal + 미해결) |
| `vhk today` | 저녁 자축·회고 (오늘 커밋·완료 goal 카운트 + 격려) |
| `vhk review` | 적대적 자기검증 (거짓완료 의심 탐지) |
| `vhk receipt` | 증거 영수증 — 4대 기계증거로 거짓완료 판정 (block/caution/pass) |
| `vhk mission` | 미션 계약 — 작업 목표·허용/금지 범위 선언·검증 |
| `vhk context-show` | 컨텍스트 파일 내용 출력 |
| `vhk memory` | 기억 관리 v2 (decisions/failures/successes) |
| `vhk recall` | 기억 회상 (자연어 키워드 검색 — RFC 0049) |
| `vhk brief` | 프로젝트 요약 보고서 생성 |
| `vhk loop-brief` | 루프 1틱 앵커 생성 (의도+goal1+교훈+STOP → `.vhk/loop-brief.md`) |
| `vhk remind` | 치명 규칙 재주입 (RULES.md NON-NEGOTIABLE/Forbidden 압축 → `.vhk/remind.md`) |
| `vhk content` | 콘텐츠 초안 프롬프트 생성 (풀사이클 뒷단 — 콘텐츠/마케팅 → `.vhk/content-prompt.md`) · RULES.md 치명 규칙 상속 · 과거 교훈 ≤3 자동 회상 주입(#458) |
| `vhk launch` | 런칭 게시물 프롬프트 생성 (풀사이클 뒷단 — 런칭 → `.vhk/launch-prompt.md`) · `ship`=코드 npm 배포와 구분 · RULES.md 치명 규칙 상속 · 과거 교훈 ≤3 자동 회상 주입 + `vhk learn/win` 기록 지시(#458) |
| `vhk ops` | 운영 회고 프롬프트 생성 (풀사이클 뒷단 — 운영 → `.vhk/ops-prompt.md`) · 유지/피벗/아카이브 회고, 중단·삭제는 사람이 · RULES.md 치명 규칙 상속 · 과거 교훈 ≤3 자동 회상 주입 + `vhk learn/win` 기록 지시(#458) |
| `vhk sell` | 판매 카피 프롬프트 생성 (풀사이클 뒷단 — 판매 → `.vhk/sell-prompt.md`) · 가격 페이지·FAQ 초안, 결제·과금은 사람이 · RULES.md 치명 규칙 상속 · 과거 교훈 ≤3 자동 회상 주입(#458) |
| `vhk work` | AI 작업 시작/이어하기 (+ handoff) |
| `vhk goal` | Goal 단계별 미션 관리 |
| `vhk blocker` | 블로커 기록 (3건 누적 시 HARD_STOP) |
| `vhk learn` | 교훈 기록 → memory v2 단일 SoT |
| `vhk win` | 성공 기록 → memory successes (reinforce evolve 입력) |
| `vhk autonomy-log` | 자율 루프 런(run) 시작/종결 기록 (`--event start\|complete\|hardstop\|blocked` `--goal` `--run-id` `--ticks` `--interventions` `--review-rejected` `--failure-kind infra\|product`) — 완주율 계측 (#373). HEAD SHA·작업 유형은 CLI 가 직접 재고, 완주 인정은 같은 SHA 의 `vhk receipt` 기계 판정이 정한다 (작업 단위 110). `--failure-kind infra` 는 종결 실패에서만 유효하며 해당 런을 분모에서 뺀다. 종결 SHA 는 작업 단위 111 의 PR cohort 조인 1차 신호이기도 하다 |
| `vhk watch` | 무인 세션 정지 감시 — 세션 로그 idle 초과 시 텔레그램·콘솔 알림 (`--idle-min` `--interval` `--window` `--once`) |
| `vhk resume` | .vhk/HARD_STOP 해제 (`--confirm` 필요) |
| `vhk pattern` | 반복 패턴 감지·목록 (`pattern detect` · `pattern list` · `pattern dismiss`) |
| `vhk evolve` | 패턴 → 룰 후보 제안·반영·undo |
| `vhk seo` | SEO·수익 대시보드 (init: 사이트 등록 + 자격증명 보관) |
| `vhk help` | 기본 명령 도움말 (`--all` = 전체 명령) |

> `policy-baseline`은 위 `policy baseline` 하위 명령의 구현 모듈명이며 별도 최상위 명령이 아닙니다.

> 내부 구현 파일(verify-report·memory-eval)은 독립 명령이 아님 — 각각 `vhk verify --report`,
> `vhk memory eval` 로 노출됩니다.

---
*Generated by `vhk init` — 수정해도 됩니다*
