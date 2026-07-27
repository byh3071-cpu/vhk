---
id: vhk-readme
date: 2026-06-08
tags: [vhk, cli, readme, v2.12.0, mcp, proof, ai-coding]
---

<div align="center">

# VHK — Vibe Harness Kit

**v2.12.0**

**모델·에이전트를 뭘로 바꿔도 안 무너지는 풀사이클 AI 코딩 하네스.**

Claude Code든 Cursor든 그 위에 얹어 리뷰·검증·기억을 한 루프로 돌리고,
쓸수록 규칙이 쌓여 이 개발자에게 맞게 진화합니다. **한국어 우선.**

[![CI](https://github.com/byh3071-cpu/vhk/actions/workflows/ci.yml/badge.svg)](https://github.com/byh3071-cpu/vhk/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@byh3071/vhk?logo=npm)](https://www.npmjs.com/package/@byh3071/vhk)
![node](https://img.shields.io/node/v/@byh3071/vhk)
![license](https://img.shields.io/badge/license-MIT-blue)
![MCP](https://img.shields.io/badge/MCP-35_tools-8A2BE2)

**[30초 시작](#30초-시작) · [VHK vs 맨 에이전트](#vhk-vs-맨-에이전트) · [핵심 루프](#핵심-루프) · [명령 전체](#명령-전체)**

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
  🟢 VHK      v2.12.0 (최신)
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

<details>
<summary>목차</summary>

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

# 새 프로젝트: git init + 문서 + MCP + 컨텍스트를 한 번에
vhk start

# 기존 프로젝트에 하네스만 얹기
vhk init -y && vhk sync && vhk mcp-init
```

Node.js 22 이상이 필요합니다. `vhk start`는 마법사로 초기 셋업 비용을 한 번에 제거하고, 아이디어부터 검증하려면 `vhk gate`로 시작하세요.

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
vhk sync --check   # 검사만 — 8개 타겟이 RULES.md 와 일치하는지 (drift 시 exit 1, 쓰기 0)
```

### 2. Goal과 HARD_STOP

Goal은 `goals/*.md`와 `scripts/check-goal-<id>.mjs`를 연결합니다. `vhk goal done`은 게이트를 다시 돌려 통과할 때만 DONE으로 전이합니다. 블로커가 반복되면(3건 누적) `.vhk/HARD_STOP`으로 진행을 멈춥니다.

```powershell
vhk goal next
vhk goal done --id 42
vhk blocker "테스트가 같은 원인으로 계속 실패"
```

### 3. 증거와 자기검증 — "실행했다"와 "완료됐다"를 분리

```powershell
vhk verify     # tsc/lint/test/build/secure 게이트 실행 → .vhk/reports/latest.json
vhk review     # 최신 증거와 goal 완료조건 교차검증
vhk receipt    # 4대 기계증거(tsc/test/build 종료코드·git dirty·stale SHA·diff-cover)로 완료 보고 검증 (LLM 0)
vhk preflight  # 2FA·shim·env·lint·type·test·git·branch·docs freshness 출고 전 점검
```

#### 허위 완료 보고 적발 데모 — 실제 출력

AI가 "구현 완료했습니다!"라고 말했지만 실제로는 테스트가 깨져 있고 커밋도 안 한 상황.
`vhk receipt` 한 번이면 기계증거로 잡힙니다 (2026-07-18 실캡처):

```text
🧾 검증 리포트 (receipt)
────────────────────────────────────────────
  판정: 🔴 BLOCK
  HEAD: adb79f9  ·  작업시작: adb79f9  ·  게이트: FAIL

   • 게이트 실패(실종료코드 ≠ 0): test — red
   • working tree 가 dirty — 미커밋/untracked 변경 있음(자기파일 제외 후에도)

  📄 영수증: .vhk\receipts\2026-07-18-block-025956.json

  🔴 기계증거가 "됐어요"와 모순 — 아직 완료 아님.
```

30초 재현: 아무 프로젝트에서 `vhk receipt --mark-start` → 코드 수정(커밋 X, 테스트 깨진 채) → `vhk receipt`.
판정은 종료코드·git dirty·SHA 같은 기계증거 기반이며 LLM 추론이 아닙니다 — 그래서 "그럴듯한 말"에 안 속습니다.
(한계도 정직하게: 게으른 허위 완료 보고를 잡는 도구지, 그럴듯하게 틀린 코드까지 잡지는 못합니다.)

### 4. 기억·패턴·자가진화 — 쓸수록 이 개발자에게 최적화

세션마다 도메인·맥락·의도·교훈이 `.vhk/memory.json`(repo-local)에 쌓이고, 그게 다시 규칙으로 승격돼 에이전트에 주입됩니다. 어떤 에이전트를 써도 프로젝트 맥락을 점점 더 정확히 이해하게 됩니다.

```powershell
vhk learn "비-TTY 명령은 프롬프트 없이 실패해야 한다"
vhk pattern detect      # 반복되는 실패/성공 신호 탐지
vhk evolve suggest      # 사람이 승인할 RULES.md 후보 생성 (자동 적용 아님 — diff·확인)
vhk stats               # 패스율/차단율/진화 적용율 집계 (읽기 전용)
```

## 🤖 오토파일럿 스킬 `/vhk-auto` (1단계 MVP)

VHK 프로젝트에서 **active goal 1개를 혼자 한 바퀴 돌리고 멈춰 보고**하는 클로드 코드 스킬입니다.

- 하는 일: 앵커 재주입(`loop-brief`+`remind`) → 개발(TDD) → `vhk verify` 결정론 게이트 → `/code-review` 적대검증 → 합격 시 작은 commit → 끝나면 핵심 보고.
- **안전(1단계 한계)**: 외부 발송·이슈 등록·`gh` 호출을 **하지 않습니다.** commit만 자동(push·PR·publish 금지). 문제는 "이슈 초안 텍스트"로만 보고합니다.

> 2단계 로드맵: CLI `vhk auto` + MCP `vhk_auto`로 승격 시 이슈 자동등록(safeExecFile gh·dedupe·undo 승인 패턴·secure 강제)이 결정론 코드로 추가됩니다.

## 명령 전체

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
| 시작 | `vhk`, `vhk gate`, `vhk start`, `vhk init` | 메뉴, 아이디어 검증, 새 프로젝트 마법사, 하네스 초기화(+기록 집행 커밋훅 배선 — 세션일지 없는 코드 커밋 차단, `[skip-record]` 우회) |
| 규칙/맥락 | `vhk sync`, `vhk context`, `vhk context-show`, `vhk brief`, `vhk loop-brief`, `vhk remind`, `vhk work`, `vhk work handoff` | 규칙 동기화, 프로젝트 맥락 생성, 루프 1틱 의도 앵커, 치명 규칙 재주입, 세션 시작/인수인계 |
| 풀사이클 뒷단 | `vhk content`, `vhk launch`, `vhk ops`, `vhk sell` | 콘텐츠/런칭/운영/판매 초안 프롬프트 생성 (초안만, 게시·발송·결제는 사람이) · RULES.md 치명 규칙 자동 상속 · 과거 교훈(`.vhk/memory`) ≤3 자동 회상 주입 — 다음 사이클로 복리 |
| Goal | `vhk goal init/list/next/check/done/sync/drift` | 단계별 목표, 게이트, 상태 불일치(drift) 관리 |
| Trust | `vhk verify`, `vhk review`, `vhk receipt`, `vhk preflight`, `vhk testmap`, `vhk mission set/show/check/clear` | 증거 생성, 완료 보고 검증, 검증 리포트, 출고 전 점검, 테스트 매핑, 작업 범위 계약 |
| 안전 | `vhk blocker`, `vhk resume --confirm`, `vhk mode`, `vhk secure scan` | HARD_STOP, safety mode, 시크릿 스캔 |
| Git | `vhk status`, `vhk diff`, `vhk save`, `vhk undo`, `vhk restore`, `vhk recap` | 상태/변경 확인, 커밋/푸시, 되돌리기, 세션 로그 |
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
| `vhk 저장해줘` | `vhk save` |
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
- `vhk cloud push`는 GitHub secret gist를 사용하며 토큰은 코드나 설정에 저장하지 않습니다.
- `memory.json`·`refs.json`·`HARD_STOP` 같은 개인/상태 파일은 기본 백업 제외 대상입니다.
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
