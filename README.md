---
id: vhk-readme
date: 2026-06-08
tags: [vhk, cli, readme, v2.15.0, mcp, proof, ai-coding]
---

<div align="center">

# VHK — Vibe Harness Kit

**v2.15.0**

**모델·에이전트를 뭘로 바꿔도 안 무너지는 풀사이클 AI 코딩 하네스.**

Claude Code든 Cursor든 그 위에 얹어 리뷰·검증·기억을 한 루프로 돌리고,
쓸수록 규칙이 쌓여 이 개발자에게 맞게 진화합니다. **한국어 우선.**

[![CI](https://github.com/byh3071-cpu/vhk/actions/workflows/ci.yml/badge.svg)](https://github.com/byh3071-cpu/vhk/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@byh3071/vhk?logo=npm)](https://www.npmjs.com/package/@byh3071/vhk)
![node](https://img.shields.io/node/v/@byh3071/vhk)
![license](https://img.shields.io/badge/license-MIT-blue)
![MCP](https://img.shields.io/badge/MCP-35_tools-8A2BE2)

**[v2.15 핵심](#v215-핵심) · [30초 시작](#30초-시작) · [VHK vs 맨 에이전트](#vhk-vs-맨-에이전트) · [핵심 루프](#핵심-루프) · [명령 전체](#명령-전체)**

</div>

> [!NOTE]
> VHK는 새 코딩 에이전트가 **아닙니다.** 이미 쓰는 에이전트를 감싸 "무엇을 하기로 했는지 · 정말 끝났는지 · 다음 세션이 어디서 이어질지"를 repo 안의 파일과 CLI 게이트로 고정하는 하네스입니다. 모델이 바뀌어도 규칙·기억·게이트는 repo에 남습니다.

명령어를 외우지 않아도 됩니다. `vhk`만 실행하면 한국어 메뉴가 열리고, `vhk 저장해줘`·`vhk 다음 목표`·`vhk 출고점검` 같은 자연어도 라우팅합니다.

### 이렇게 돌아갑니다 — `vhk doctor` (실제 출력)

<!-- 움직이는 데모(asciinema)는 준비 중 — 아래는 실제 실행 캡처 -->

```text
🩺 개발 환경 점검

  🟢 Node     v24.13.0 (shim-safe)
  🟢 pnpm     11.17.0
  🟢 git      2.53.0 (user configured)
  🟢 VHK      v2.15.0
  🟢 MCP      35 tools 등록

  📁 프로젝트 파일 확인:
    ✅ RULES.md   ✅ COMMANDS.md   ✅ package.json   ✅ .gitignore

  🔀 설정 불일치(drift) 점검 (규칙·맥락 어긋남):
    ✅ 규칙 파일이 RULES.md와 일치
    ⚠️ .vhk/context.md 가 현재 코드보다 낡았어요 — vhk context 로 갱신하세요

  🎉 개발 환경 준비 완료!

━━━ 다음에 이것만 하세요 ━━━
  vhk work
```

## v2.15 핵심

- **기본-off 안전 정책** — `vhk policy level/risk/show/check`로 권한 단계·위험도·허용목록·호출 수·시간 한도를 조회하고 판정합니다. 대상 명령을 실행하거나 자동 집행을 켜지는 않습니다.
- **증거 기준선 분리** — `vhk receipt --mark-start`는 intent/forbidden 대조용 변경 범위의 시작 SHA만 기록합니다. `receipt`는 발행 중 새 검증을 실행하고, 검증 시작 HEAD·dirty와 게이트 종료 후 상태를 비교해 stale 여부를 판정합니다.
- **안정적인 마감** — `vhk goal next`는 BLOCKED·DEFERRED·OBSERVING을 완료로 오인하지 않고, 미해결 Goal 없이 DONE/CANCELED만 남은 종결 상태를 반복 조회해도 완료 시각이나 백업을 다시 만들지 않습니다. 생성되는 gate skill은 모든 Goal이 정상 DONE인 branch closeout을 `review N/A`와 branch receipt 경로로 안내합니다.

자동 집행과 `enforce` 활성화는 2.15 범위가 아닙니다. 관찰 게이트를 충족하고 사람이 계속을 결정한 뒤 2.16에서 다룹니다.

<details>
<summary>목차</summary>

- [v2.15 핵심](#v215-핵심)
- [왜 VHK인가](#왜-vhk인가)
- [30초 시작](#30초-시작)
- [VHK vs 맨 에이전트](#vhk-vs-맨-에이전트)
- [핵심 루프](#핵심-루프)
- [오토파일럿 /vhk-auto](#-오토파일럿-스킬-vhk-auto-1단계-mvp)
- [명령 전체 (MCP 35 tools · 명령 표면)](#명령-전체)
- [자연어 예시](#자연어-예시)
- [보안과 개인정보](#보안과-개인정보)
- [요구 사항](#요구-사항)
- [개발 · 배포 · Pro · 라이선스](#개발)

</details>

## 왜 VHK인가

VHK는 AI 코딩에서 반복되는 문제를 repo 안의 파일과 게이트로 **고정**합니다.

| AI 코딩에서 자주 생기는 문제 | VHK가 고정하는 것 | 대표 명령 |
| --- | --- | --- |
| 도구마다 규칙 파일이 따로 논다 | `RULES.md` 한 벌을 여러 에이전트 규칙 파일로 동기화 | `vhk sync` |
| 세션이 끊기면 맥락이 사라진다 | `.vhk/context.md`, `brief`, `work` 프롬프트로 이어받기 | `vhk work` |
| AI가 "완료"라고 하지만 증거가 빈약하다 | verify/review/preflight/testmap으로 증거와 게이트 확인 | `vhk verify` |
| 목표가 많아지면 무엇부터 할지 흐려진다 | `goals/*.md`와 `docs/state/next-task.md`로 다음 목표 고정 | `vhk goal next` |
| 같은 실수가 반복된다 | memory/pattern/evolve로 교훈과 룰 후보 축적 | `vhk learn` |
| 위험한 상태에서 계속 진행한다 | blocker 3건 누적 시 `.vhk/HARD_STOP` 생성 | `vhk blocker` |
| AI 비용이 새는지 모른다 | cost 가드로 예산·사용량 추적 + 임계(80% 경고·100% 차단) | `vhk cost` |
| SEO·수익 확인이 콘솔 여러 개에 흩어져 있다 | 사이트 등록·자격증명 안전보관·오프라인 리포트로 한곳에 정리(실 제출·수집은 자격증명 연결 후 사람이 실행) | `vhk seo` |

## 30초 시작

```powershell
npm install -g @byh3071/vhk    # 또는 1회성: npx -y @byh3071/vhk
vhk --version

# 새 프로젝트: 기술 스택을 알면 바로 확정
vhk start --stack "Vite, React, TypeScript"

# 아직 모르면 후보로 시작하고 첫 세션에서 확정
vhk start

# 기존 프로젝트에 하네스와 PR 검사 얹기
vhk init -y --ci
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
vhk sync
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
vhk mcp-init
```

Node.js 22 이상이 필요합니다. `vhk start --stack "..."`은 지정한 기술 스택을 확정값으로 기록합니다. `--stack`을 생략하면 자동 감지·유형 프리셋은 후보로만 기록되고 기존 `NEEDS_CUSTOMIZATION` 첫 세션 인터뷰에서 먼저 확인합니다. 아이디어부터 검증하려면 `vhk gate`로 시작하세요.

`vhk init --ci`는 `.github/workflows/vhk-gate.yml`을 만들고 PR마다 검증·규칙·공개 경계 검사를 실행합니다. 기존 GitHub Actions 워크플로가 있으면 파일을 건드리지 않고 병합 방법을 안내합니다. GitHub에서 병합을 실제로 막으려면 저장소 **Settings → Rules**에서 상태 검사 `VHK Gate`를 필수로 지정하세요.

기존 프로젝트에서 `vhk init`을 실행하면 여러 규칙 파일의 같은 관리 구역은 한 번만 가져옵니다. 같은 이름인데 내용이 다르거나 `BEGIN/END` 표시가 깨진 구역은 자동으로 고르지 않고, 원본을 그대로 둔 채 복구 방법과 함께 중단합니다.

설치가 끝나면 규칙 파일 연결 수와 함께 핵심 규칙의 출처·버전을 따로 보여줍니다. `VHK 내장 기본 규칙`으로 대신한 경우에는 사용자 규칙 파일이 연결된 상태가 아님을 마지막 설치 점검에서 다시 경고합니다.

Cursor 기존 프로젝트는 `vhk bootstrap cursor`로 VHK 관리 skill을 설치할 수 있습니다. 수정되지 않은 구형 관리본은 안전하게 최신화하고, 사용자가 손댄 구형본은 덮어쓰지 않고 수동 병합을 안내합니다. 생성되는 검증 skill은 특정 `pnpm` 스크립트를 가정하지 않고 `vhk verify`가 프로젝트의 실제 스크립트를 판별하게 합니다.

### 선택: 사용자 규칙 YAML 연결

VHK는 다른 저장소 없이 독립 실행됩니다. 별도 규칙이 필요하면 YAML 파일을 직접 연결하세요.

```powershell
vhk config set-rules-file C:\rules\team-rules.yaml
# 또는 현재 프로세스 시작 전에 VHK_RULES_FILE 환경변수로 지정
```

## VHK vs 맨 에이전트

VHK는 에이전트를 **대체하지 않습니다** — 에이전트가 못 하는 반복·기억·게이트를 담당해 **그 위**를 채웁니다.

| | 맨 에이전트<br/>(Claude Code·Cursor 단독) | 일반 CI·eslint | **VHK** |
| --- | --- | --- | --- |
| 적대적 코드 리뷰 | 요청 시 1회·일관성 없음 | 정적 규칙만 | **반복 게이트** |
| 실행 기반 검증 | 부분(말로) | 테스트만 | **verify 실행·증거 기록** |
| 모델·에이전트 교체 시 규칙·기억 | 세션과 함께 휘발 | 해당 없음 | **규칙 포터·기억 이관** |
| 쓸수록 규칙 자가축적 | 없음 | 수동 설정 | **세션마다 자동 적립** |
| 한국어 우선 | 영어 기본 | 해당 없음 | **한국어 SoT·자연어 라우팅** |
| 릴리스 게이트 강제 | 없음 | 통과/실패 | **preflight·goal 게이트 루프** |

## 핵심 루프

### 1. 규칙 포터빌리티 — 에이전트를 갈아타도 규칙은 그대로

`RULES.md` 한 벌을 원천으로 두고 8개 타겟을 생성·갱신합니다: `.cursorrules`, `CLAUDE.md`, `.windsurfrules`, `.github/copilot-instructions.md`, `.agents/rules/vhk-rules.md`, `AGENTS.md`, `GEMINI.md`, `.clinerules/vhk-rules.md`.

```powershell
vhk sync
vhk sync --check   # 검사만 — 재생성 결과 차이와 필수 섹션 누락을 따로 확인 (문제 시 exit 1, 쓰기 0)
```

모든 도구가 반드시 읽어야 하는 안전 절은 제목에 표시합니다. 목록은 코드에 따로 적지 않고
`RULES.md`의 이 표시에서 가져옵니다. 파생 파일 하나에서 절이 빠지면 `sync --check`가 누락으로 잡습니다.

```markdown
## 안전 규칙 <!-- vhk:sync=all -->
```

`vhk sync --check`에서 미연결 섹션이 나오면 출력에 표시된 표준 말을 제목에 넣거나, 위처럼 제목 뒤에 `<!-- vhk:sync=all -->`을 붙이세요. 검사 결과가 실제 미연결 섹션명과 VHK가 인식하는 표준 제목을 함께 보여줍니다.

규칙 줄에 짧은 검사 ID를 붙이면 `vhk check`가 대응하는 스크립트를 실행하고 검사 비율을 보여줍니다.
ID는 영문 소문자·숫자·하이픈만 사용합니다. `.mjs`가 있으면 먼저 실행하고, 없을 때 `.sh`를 찾습니다.

```markdown
- execSync 신규 사용 금지 <!-- vhk:check=no-exec-sync -->
```

```text
scripts/check-rule-no-exec-sync.mjs
```

```powershell
vhk check
vhk check --json   # declaredRules·checkedRules·uncheckedRules·coveragePercent 포함
```

### 2. Goal과 HARD_STOP

Goal은 `goals/*.md`와 `scripts/check-goal-<id>.mjs`를 연결합니다. `vhk goal done`은 게이트를 다시 돌려 통과할 때만 DONE으로 전이합니다. 선택 필드 `depends_on: 1,2`를 쓰면 두 Goal이 모두 DONE이 되기 전에는 다음 작업이나 완료 대상으로 선택되지 않습니다. 블로커가 반복되면(3건 누적) `.vhk/HARD_STOP`으로 진행을 멈춥니다.

`vhk goal next`는 선택 가능한 Goal 없이 BLOCKED·DEFERRED·OBSERVING만 남으면 완료로 오인하지 않고 사람이 쓴 `next-task.md`를 보존합니다. VHK가 만든 과거 완료 스냅샷이 거짓 상태가 되면 완료 표시와 시각을 함께 무효화합니다. 미해결 Goal 없이 DONE/CANCELED만 남은 종결 상태에서는 기존 `next-task.md`가 있을 때만 백업 후 완료 스냅샷으로 갱신하며, 파일이 없으면 새로 만들지 않습니다. 이미 완료 스냅샷이면 아무것도 쓰지 않아 시각과 백업이 늘지 않습니다.

```powershell
vhk goal next
vhk goal done --id 42
vhk blocker "테스트가 같은 원인으로 계속 실패"
```

#### Goal Phase/Task를 읽기 전용으로 보기

Goal 본문을 아래 정확한 문법으로 나누면 `vhk context --json`이 상태와 Phase 장벽을 JSON으로
투영합니다. Phase와 Goal 전체의 Task 번호는 각각 양수·고유·오름차순이면 되고 결번을 허용합니다.
Phase/Task는 선택 사항이라 Phase가 없는 legacy Goal도 계속 읽습니다.

```markdown
### Phase 10
- [x] **Task 100** 구현 / 증거: sample-evidence
- [ ] **Task 105** `(na)` 제외 이유

### Phase 30
- [ ] **Task 220** 검증 / evidence: sample-report
```

`(na)`는 Task 라벨 직후의 정확한 backticked 토큰만 인정하며 `[x]`/`[X]`와 함께 쓰면 구조
오류입니다. `/ 증거:`와 `/ evidence:`는 같은 선택적 hint일 뿐 완료 증명이 아닙니다.
malformed Phase와 유효한 Phase 밖의 Task는 구조 오류입니다.
Phase가 없는 legacy Goal은 `valid: true`, `activeGoal.phases: []`, `activeGoal.tasks: []`로
투영하고 `NO_PHASES` warning을 담아 exit 0으로 끝납니다.
`completed`와 `notApplicable`은 `terminal`, 첫 Phase의 pending Task는 `ready`입니다. 이후 Phase의
pending Task는 직전 Phase의 모든 Task가 terminal이면 `ready`, 아니면 `waiting`입니다. 첫 Phase의
`dependsOn`은 비어 있고 이후 각 Task는 직전 Phase의 모든 `goal:N/task:N` string ID를 가집니다.
같은 Phase의 Task는 서로 의존하지 않아 함께 ready일 수 있지만 자동 병렬 실행을 보장하지 않습니다.

이 명령은 성공·실패 모두 파일을 쓰지 않습니다. 구조·flag·공개 경계 오류는 원문·절대경로·stack을
노출하지 않고 `valid: false`, `activeGoal: null`, 안정적인 `errors` JSON과 exit 1로 끝납니다.
`vhk context --compact --json`도 같은 안전한 오류 계약을 따릅니다.
공개 경계가 차단하는 입력은 시크릿·토큰·키, 홈 절대경로, 개인 이메일·실명·저장소명, 실제 외부
객체 ID입니다. 차단된 입력 원문은 오류에 다시 노출하지 않으며, 예시는 `sample-*`, `<HOME>`,
명백히 가짜 ID만 사용합니다. `--compact --json` 충돌은 `valid: false`와 exit 1인 flag 구조 오류입니다.

#### 기본 off 실행 정책 조회

실행 정책은 기본 off입니다. `vhk policy show`는 현재 `record`·`enforce` 플래그와 계산된 권한
단계·위험도를 읽기 전용으로 보여줄 뿐 설정을 켜거나 명령을 실행하지 않습니다.

판정 이력만 쌓으려면 사람이 `.vhk/policy.json`을 직접 만들거나 편집해 `record: true`로 둡니다.
VHK가 이 값을 자동으로 켜는 명령은 없으며, `enforce: false`에서는 판정을 기록해도 실행을 막지 않습니다.

```json
{
  "schemaVersion": 1,
  "record": true,
  "enforce": false
}
```

```powershell
vhk policy show
vhk 정책 보기
```

설정을 만든 뒤에는 현재 내용의 해시를 기준선으로 고정할 수 있습니다. 이 명령만 정책 조회와 달리
파일을 쓰는 고위험 작업이며, 사람이 `--confirm`을 붙여 명시적으로 실행해야 합니다. VHK는 기준선을
자동 생성하거나 자동 갱신하지 않습니다. 이후 자율 런 시작·종료 때 설정이 기준선과 달라졌는지 확인합니다.
정책 파일을 지워 기본 off로 돌아갈 때도 같은 명령을 실행하면 “설정 없음” 상태를 `hash: null`로
고정합니다. 그러면 정책 파일이 다시 생기는 것도 변경으로 탐지됩니다.

```powershell
vhk policy baseline --confirm
vhk 정책 기준선 --confirm
```

`policy.json`·`policy-baseline.json`·`run-state.json`·`cloud.json`과 구 잠금 예약 이름,
정책·런 상태·클라우드 포인터의 원자 저장 임시본 패턴은 새 프로젝트의 `.vhk/.gitignore`와
VHK cloud 제외 목록에 자동 등록됩니다.
구현 중 사용됐던 `run-state-recovery.lock` 이름도 호환 잔재가 노출되지 않도록 예약 제외합니다.
기존 프로젝트도 기준선 기록이나 런 상태 기록 시 보강합니다.
실행 중 비교용 정책 해시와 최초 종결의 종료 요청·당시 정책 무효화 상태·위험도 판정은 비추적 `run-state.json`에만 저장합니다.
종결·판정 원장이 모두 기록될 때까지 같은 작업 SHA의 재시도는 이 최초 요청과 판정을 그대로 이어 쓰며,
추적 가능한 실행 원장에는 정책 내용 해시를 남기지 않습니다.
공개 정책 의무 필드 도입 전에 남은 종료 기록을 보충할 때도 그 의무를 비공개 상태에 먼저 고정하며,
현대 종료 기록에서 공개 필드만 지워진 경우와 구분해 후자는 완료로 재사용하지 않습니다.
정책 무효화 상태에서 먼저 남은 수동 종료도 최초 요청을 비공개 상태에 고정하므로, 정책을 복구한 뒤
새 판단으로 덮어쓰지 않습니다. 종결 보충용으로 남은 상태는 새 `policy check`의 실행 한도에 섞이지 않습니다.
병렬 런의 실제 잠금은 Git·정책 상태와 무관한 사용자 전용 OS 임시 디렉터리에 두며 프로젝트에는 남기지 않습니다.

허용목록과 호출 수·시간 한도에 따라 특정 명령이 실행 가능한지만 미리 판정하려면 `--` 뒤에
명령을 argv 그대로 붙입니다. `check`는 대상 명령을 실행하지 않으며 `allow`는 exit 0,
`deny`는 exit 1, 사람 확인이 필요한 `require-human`은 exit 2로 끝납니다.

```powershell
vhk policy check -- pnpm typecheck
vhk 정책 검사 -- pnpm typecheck
```

단순 질문은 `vhk pnpm typecheck 실행 가능해?`처럼 자연어로도 검사할 수 있습니다. 명시형도 **단일 실행 파일과 argv만** 지원합니다. 파이프·연쇄(`&&`, `;`)·명령 치환을 붙이면 셸이 VHK 밖에서 실제 명령을 실행할 수 있으므로 절대 붙이지 말고, 각 명령을 따로 검사하세요.

활성화 설정이 없으면 조회 표면은 판정만 하고 실행 집행이나 정책 원장 기록을 시작하지 않습니다.

### 3. 증거와 자기검증 — "실행했다"와 "완료됐다"를 분리

```powershell
vhk verify     # 게이트 실행 → 확인이 필요한 항목의 경과 시간·숨긴 횟수 표시 + .vhk/reports/latest.json
vhk verify --dismiss lint-gate  # 현재 알림 숨기기(같은 문제가 다시 발생하면 다시 표시)
vhk review     # 최신 증거와 goal 완료조건 교차검증
vhk receipt    # 4대 기계증거(verify 5개 게이트·git dirty·verify SHA 신선도·diff-cover)로 완료 보고 검증 (LLM 0)
vhk preflight  # 2FA·shim·env·lint·type·test·git·branch·docs freshness 출고 전 점검
```

#### 허위 완료 보고 적발 데모 — 실제 출력

AI가 "구현 완료했습니다!"라고 말했지만 실제로는 테스트가 깨져 있고 커밋도 안 한 상황.
`vhk receipt` 한 번이면 기계증거로 잡힙니다 (2026-07-18 실캡처):

```text
🧾 검증 리포트 (receipt)
────────────────────────────────────────────
  판정: 🔴 BLOCK
  HEAD: adb79f9  ·  작업기준: adb79f9  ·  게이트: FAIL

   • 게이트 실패(실종료코드 ≠ 0): test — red
   • working tree 가 dirty — 미커밋/untracked 변경 있음(자기파일 제외 후에도)

  📄 영수증: .vhk\receipts\2026-07-18-block-025956.json

  🔴 기계증거가 "됐어요"와 모순 — 아직 완료 아님.
```

30초 재현: 아무 프로젝트에서 `vhk receipt --mark-start` → 코드 수정(커밋 X, 테스트 깨진 채) → `vhk receipt`.
`--mark-start`는 intent/forbidden 대조용 변경 범위의 시작 SHA만 기록합니다. `receipt`는 발행 중 `verify`를 새로 실행해 검증 시작 HEAD·dirty와 게이트 종료 후 현재 상태를 비교합니다. 어느 한쪽 커밋을 식별할 수 없어 stale 여부가 미상이면 CAUTION(exit 0), 식별된 상태가 실제로 어긋날 때만 BLOCK(exit 1)입니다.
판정은 종료코드·git dirty·SHA 같은 기계증거 기반이며 LLM 추론이 아닙니다 — 그래서 "그럴듯한 말"에 안 속습니다.
(한계도 정직하게: 게으른 허위 완료 보고를 잡는 도구지, 그럴듯하게 틀린 코드까지 잡지는 못합니다.)

### 4. 기억·패턴·자가진화 — 쓸수록 이 개발자에게 최적화

세션마다 도메인·맥락·의도·교훈이 `.vhk/memory.json`(repo-local)에 쌓이고, 그게 다시 규칙으로 승격돼 에이전트에 주입됩니다. 어떤 에이전트를 써도 프로젝트 맥락을 점점 더 정확히 이해하게 됩니다.

```powershell
vhk learn "비-TTY 명령은 프롬프트 없이 실패해야 한다"
vhk pattern detect      # 반복되는 실패/성공 신호와 새 규칙 후보를 바로 표시
vhk evolve suggest      # 현재 7일 후보 계산(저장 안 함) — apply는 사람 확인 필수
vhk stats               # 패스율/차단율/진화 적용율/자율 완주율/병목 계측 (읽기 전용, 병목은 gh 필요)
```

규칙 후보는 별도 큐에 쌓이지 않습니다. 패턴이 생긴 뒤 7일 동안만 표시되고, `apply`·`reject`·`undo`로 결정하거나 되돌린 결과만 로컬 로그에 남습니다. 조회·JSON·MCP 경로는 `RULES.md`를 자동으로 바꾸지 않습니다.

## 🤖 오토파일럿 스킬 `/vhk-auto` (1단계 MVP)

VHK 프로젝트에서 **active goal 1개를 혼자 한 바퀴 돌리고 멈춰 보고**하는 클로드 코드 스킬입니다.

- 하는 일: 앵커 재주입(`loop-brief`+`remind`) → 개발(TDD) → `vhk verify` 결정론 게이트 → `/code-review` 적대검증 → 합격 시 작은 commit → 끝나면 핵심 보고.
- **안전(1단계 한계)**: 외부 발송·이슈 등록·`gh` 호출을 **하지 않습니다.** commit만 자동(push·PR·publish 금지). 문제는 "이슈 초안 텍스트"로만 보고합니다.

> 2단계 로드맵: CLI `vhk auto` + MCP `vhk_auto`로 승격 시 이슈 자동등록(safeExecFile gh·dedupe·undo 승인 패턴·secure 강제)이 결정론 코드로 추가됩니다.

## 명령 전체

처음에는 `vhk --help` 또는 `vhk help`로 기본 명령만 보세요. 마케팅·커머스 명령까지 포함한 전체 명령은 `vhk help --all`에서 볼 수 있습니다. 기본 목록에서 숨긴 명령도 삭제되지 않아 이름을 직접 입력하면 그대로 실행됩니다.

<details>
<summary><b>MCP 35 tools</b> — <code>vhk mcp-init</code> 후 MCP 클라이언트가 <code>vhk mcp</code> stdio 서버로 호출</summary>

| 그룹 | 도구 |
| --- | --- |
| Git/세션 | `save`, `undo`, `status`, `diff`, `ship`, `recap` |
| 진단/품질 | `doctor`, `check`, `secure`, `audit`, `harness` |
| 환경/규칙 | `env`, `env-check`, `sync`, `mcp-init` |
| 컨텍스트/기억 | `context`, `context-show`, `brief`, `loop-brief`, `remind`, `memory-list`, `learn` |
| 풀사이클 뒷단 | `content`, `launch`, `ops`, `sell` |
| 배포/패키지 안내 | `deploy`, `publish`, `migrate`, `update` |
| 레퍼런스 | `ref-list` |
| 패턴/진화 | `pattern-detect`, `pattern-list`, `evolve-suggest`, `evolve-list` |

대화형 본질이 강하거나 상태 전이가 큰 명령은 CLI 전용입니다: `gate`, `start`, `init`, `goal`, `mission set`, `design`, `theme`, `evolve apply/reject/undo`.

</details>

<details>
<summary><b>명령 표면 (CLI 전체)</b></summary>

| 영역 | 명령 | 용도 |
| --- | --- | --- |
| 시작 | `vhk`, `vhk gate`, `vhk start [--stack "목록"]`, `vhk init [--ci]` | 메뉴, 아이디어 검증, 새 프로젝트 마법사(기술 스택 지정 시 확정·미지정 시 후보), 하네스 초기화(+선택적 GitHub PR 필수 검사) |
| 규칙/맥락 | `vhk sync`, `vhk context [--json]`, `vhk context-show`, `vhk brief`, `vhk loop-brief`, `vhk remind`, `vhk work`, `vhk work handoff` | 규칙 동기화, 프로젝트 맥락 생성, Goal Phase/Task 읽기 전용 JSON, 루프 1틱 의도 앵커, 치명 규칙 재주입, 세션 시작/인수인계 |
| 풀사이클 뒷단 | `vhk content`, `vhk launch`, `vhk ops`, `vhk sell` | 콘텐츠/런칭/운영/판매 초안 프롬프트 생성 (초안만, 게시·발송·결제는 사람이) · RULES.md 치명 규칙 자동 상속 · 과거 교훈(`.vhk/memory`) ≤3 자동 회상 주입 — 다음 사이클로 복리 |
| Goal | `vhk goal init/list/next/check/done/sync/drift` | 단계별 목표, 게이트, 상태 불일치(drift) 관리 |
| Trust | `vhk verify`, `vhk review`, `vhk receipt`, `vhk preflight`, `vhk testmap`, `vhk mission set/show/check/clear` | 증거 생성, 완료 보고 검증, 검증 리포트, 출고 전 점검, 테스트 매핑, 작업 범위 계약 |
| 안전 | `vhk blocker`, `vhk resume --confirm`, `vhk mode`, `vhk secure scan`, `vhk policy level/risk/show/check/baseline` | HARD_STOP, safety mode, 시크릿 스캔, 기본-off 실행 정책 조회·판정·기준선 |
| Git | `vhk status`, `vhk diff`, `vhk save`, `vhk undo`, `vhk restore`, `vhk recap` | 상태/변경 확인(아직 시작하지 않은 작업 수·가장 오래된 작업 포함), 커밋/푸시(save 는 high-risk 가드 — 비-TTY 는 `--yes`, 커밋만은 `--no-push`), 되돌리기, 세션 로그 |
| 환경/품질 | `vhk doctor`, `vhk check`, `vhk env`, `vhk env-check`, `vhk harness`, `vhk audit`, `vhk worktree check/add` | 개발환경, RULES 린트, env, 통합 품질, 보안 감사, worktree 가드 |
| 배포/패키지 | `vhk ship`, `vhk deploy`, `vhk publish`, `vhk update`, `vhk migrate` | 배포 체크, 배포 실행, npm 릴리스 자동화, 셀프 업데이트, 패키지 매니저 전환 |
| MCP/클라우드 | `vhk mcp`, `vhk mcp-init`, `vhk cloud push/pull` | MCP stdio 서버, 클라이언트 설정, `.vhk/` secret gist 백업/복원 |
| 기억/학습 | `vhk memory`, `vhk learn`, `vhk pattern`, `vhk evolve`, `vhk stats`, `vhk loop` | 결정/실패/성공 기억, 교훈, 반복 패턴, 룰 후보, 통계, 자가진화 조율 |
| 디자인/레퍼런스 | `vhk design`, `vhk design-palette`, `vhk theme`, `vhk ref add/list/open` | 디자인 토큰, 테마, 참고 링크 관리 |
| 일일 리듬 | `vhk standup`, `vhk today` | 아침 브리핑, 저녁 회고 |

</details>

## 자연어 예시

| 입력 | 라우팅 |
| --- | --- |
| `vhk 저장해줘` | `vhk save` 미리보기 — 실행은 `vhk save` 직접 (lite 모드는 경고 후 실행, ADR-021) |
| `vhk 뭐 바뀌었어` | `vhk diff` |
| `vhk 다음 목표` | `vhk goal next` |
| `vhk 출고점검` | `vhk preflight` |
| `vhk 보안 스캔` | `vhk secure scan` |
| `vhk 오늘 한 일 정리` | `vhk recap` |
| `vhk 인수인계` | `vhk work handoff` |

## 보안과 개인정보

> [!TIP]
> VHK에서 LLM은 **결정 경로가 아니라 검토·요약 보조**입니다. verify/receipt 같은 게이트 판정은 tsc·test·build 종료코드 등 기계 증거로 내리고, 되돌릴 수 없는 작업(발송·결제·publish)은 사람이 실행합니다.

- VHK는 기본 local-first입니다. 로그·맥락·기억은 repo와 `.vhk/`에 남습니다.
- `.env`와 민감 파일은 `.gitignore`·`secure scan`·`preflight`에서 계속 확인합니다.
- `vhk cloud push/pull`은 `public:false`가 확인된 Gist만 연결하며 토큰은 코드나 설정에 저장하지 않습니다.
- 신규 Gist 생성 뒤 공개 여부 확인이 실패하면 `cloud.json`에는 연결하지 않고, 상태 확인·삭제에 쓸 복구 ID를 출력합니다.
- `.vhk` 링크, 전송 대기 중 링크로 교체된 파일, 운영체제 비호환 파일명·정규화 충돌,
  원격 일부 읽기 실패는 로컬·원격 쓰기 전에 실패 폐쇄합니다.
- `memory.json`·`refs.json`·정책 상태와 그 잠금·원자 저장 임시본·`HARD_STOP` 같은 개인/상태 파일은 기본 백업 제외 대상입니다.
- 취약점은 공개 이슈에 세부 정보를 올리지 말고 [SECURITY.md](SECURITY.md)의 비공개 제보 절차를 이용하세요.

## 요구 사항

- Node.js >= 22, Git
- 선택: `gh` CLI (`vhk cloud push/pull` 사용 시), pnpm/yarn/npm 중 프로젝트 패키지 매니저

Windows PowerShell에서 실행 정책 때문에 `pnpm`이 막히면 `pnpm.cmd`를 사용하세요.

## 개발

```powershell
pnpm.cmd install
pnpm.cmd run build
pnpm.cmd run test:run
```

`prepublishOnly`는 publish 전에 빌드·테스트·npm 공개 경계 검사·High 이상 의존성 감사를 모두 실행합니다.

<details>
<summary>배포 담당자 메모</summary>

```powershell
npm.cmd login
pnpm.cmd run prepublishOnly
npm.cmd publish --access public
```

일반 개발 중에는 `vhk publish`나 `npm publish`를 실행하지 마세요. 릴리스 담당자가 version, changelog, tag, npm dist를 확인한 뒤 실행합니다.

</details>

## Pro (관심 실측 중)

VHK 코어는 MIT로 **영구 무료**입니다. 아래는 팀/다중 프로젝트용 Pro 후보이며, **수요를 먼저 확인하고 만듭니다.**

- 팀 규칙 레지스트리 — `RULES.md`를 여러 사람·레포에 클라우드 동기화
- 패턴/교훈 클라우드 — 여러 레포의 `memory`/`pattern`을 통합
- 비용 가드 대시보드 — 다중 프로젝트 예산·사용량 집계

필요하면 [이슈](https://github.com/byh3071-cpu/vhk/issues)에 `pro` 라벨로 남겨주세요. 관심 3건이면 만듭니다.

## 라이선스

MIT - [LICENSE](LICENSE)

Repository: https://github.com/byh3071-cpu/vhk · Site: https://yohanstudio.co/vhk
