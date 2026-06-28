# 📋 한국어 명령어 가이드

이 프로젝트에서 자주 쓰는 명령어입니다.
Cursor에게 한국어로 말해도 됩니다.

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

| 빌드+테스트 | `pnpm build; pnpm test --run` | "빌드하고 테스트 돌려" |
| 배포 | `vhk 배포` | "배포해" |

## Goal 단계별 미션 (v1.2+)

| 하고 싶은 것 | 터미널 명령 | Cursor에게 말하기 |
|-------------|-----------|------------------|
| goals/ 스캐폴딩 | `vhk goal init` | (대상 프로젝트에서 직접) |
| goal 목록 | `vhk goal list` | "목표 목록" |
| 다음 goal | `vhk goal next` | "다음 목표" |
| 다음 goal 미리보기(읽기전용) | `vhk goal peek` | "목표 미리보기" |
| 게이트 검증 | `vhk goal check --id 0` 또는 `vhk check --goal 0` | "목표 점검" |
| 완료 처리 | `vhk goal done --id 0` | "목표 완료" |

## 적대적 자기검증 (review)

| 하고 싶은 것 | 터미널 명령 | Cursor에게 말하기 |
|-------------|-----------|------------------|
| 거짓완료 심문 | `vhk review` (또는 `--id <n>`) | "거짓완료 없는지 검토해" |

> `review` 는 증거(latest.json)와 goal 완료조건을 교차검증해 "거짓완료 의심"을 찾습니다. 판정은 신뢰도 신호이며 보장이 아닙니다(미검증·stale 증거는 통과로 취급하지 않음).

## 증거 영수증 (receipt — RFC 0056 T1)

| 하고 싶은 것 | 터미널 명령 | Cursor에게 말하기 |
|-------------|-----------|------------------|
| 영수증 떼기 (4대 기계증거) | `vhk receipt` | "증거 영수증 떼줘" |
| 작업시작 기준선 기록 | `vhk receipt --mark-start` | "작업 시작점 찍어줘" |
| 기계용 JSON 출력 | `vhk receipt --json` | — |

> `receipt` 는 에이전트가 "됐어요"라고 한 순간, **4대 기계증거**(① tsc/test/build 실종료코드 ② git dirty ③ 작업시작 SHA≠HEAD stale ④ 변경라인 diff-cover)를 모아 `.vhk/receipts/<날짜-decision-시각>.{json,md}` 영수증 1장으로 굳힙니다. `decision = block|caution|pass` 는 **기계증거로만(LLM 추론 0)** — 실차단(red·dirty·stale·mission forbidden 위반) 중 하나라도면 block, ④ diff-cover 는 advisory(약신호)라 차단시키지 못합니다. block 이면 exit 1. **이 영수증은 게으른 거짓완료(빌드 깨짐·미커밋·낡은 증거)를 잡지, 미묘한 오류(그럴듯하게 틀린 코드)는 못 잡습니다.**

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
| 목록 | `vhk memory list [--type failure] [--all]` | "기억 보여줘" |
| 보관(선순환) | `vhk memory archive <번호>` | "이거 보관해" |
| 삭제 / 해결 / 보관해제 | `vhk memory remove <번호>` · `vhk memory resolve <번호>` · `vhk memory unarchive <번호>` | "이 기억 지워/해결/복원" |
| recall 품질 평가 | `vhk memory eval [--init]` | "기억 검색 평가해" (RFC 0049) |
| v1→v2 변환 | `vhk memory migrate` | — |

> **v2.0 BREAKING**: 평면 memory.json → 4버킷(결정/실패/성공/패턴). **조회 명령(`vhk memory list`·`context`·`brief`) 첫 실행 시에도 v1→v2 자동 마이그레이션 + `.v1.bak` 원본 백업**(어느 명령으로 먼저 실행해도 동일). **교훈은 `vhk learn`·`vhk memory add --type failure --lesson` 단일 SoT** (구 `docs/state/learnings.md` 분리 폐지·흡수). 보관(archive)된 항목은 패턴·진화에서 제외(선순환).

## 출고 전 안전점검 (preflight)

| 하고 싶은 것 | 터미널 명령 | Cursor에게 말하기 |
|-------------|-----------|------------------|
| 출고 전 일괄 점검 | `vhk preflight` | "출고 전 점검해" |
| publish 직전 점검 | `vhk preflight --publish` | "출시 전 점검해" |
| PR 직전 점검 | `vhk preflight --pr` | "PR 전 점검해" |
| 테스트 전체 실행 | `vhk preflight --full` | "전체 테스트로 점검해" |

> `preflight` 는 publish/PR 직전 **2FA·shim·worktree env·lint·타입·테스트·git·브랜치 8개**를 한 번에 점검합니다. 치명(🔴: env/lint/타입/테스트) 실패가 1개라도 있으면 `--force` 없이 차단(exit 1). 기본 테스트는 `vitest --changed`(통과분 캐시 스킵), `--full` 로 전체 실행. (읽기 전용 — 자동 수정은 후속)

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
| 반복 패턴 감지 | `vhk pattern detect` | "패턴 찾아줘" |
| 룰 후보 제안 | `vhk evolve suggest` | "규칙 제안해" |
| 부정 예시 후보 수집 | `vhk evolve negatives` | "실패에서 하지 말 것 뽑아줘" |
| 후보 목록 / 반영 / 기각 / 되돌리기 | `vhk evolve list` · `vhk evolve apply <id>` · `vhk evolve reject <id>` · `vhk evolve undo` | "규칙 반영해" |

## SEO·수익 대시보드 (seo — Goals 21~26)

| 하고 싶은 것 | 터미널 명령 | 설명 |
|-------------|-----------|------|
| 사이트 등록 + 자격증명 | `vhk seo init` | `.vhk/seo/`(로컬 전용)에 설정 — 값은 `.env`, 설정엔 `$이름` 참조만 |
| 사이트맵 제출 | `vhk seo submit` | 사이트맵 + IndexNow 핑 |
| 색인/수익 점검 | `vhk seo check` | GSC·GA4·AdSense 조회 (자격증명 필요) |
| 리포트 | `vhk seo report` | 기간 요약 |
| 자동화 | `vhk seo automate` | 주기 실행 스캐폴드 |

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
| `vhk start` | 새 프로젝트 시작 마법사 |
| `vhk init` | 하네스 파일 생성 |
| `vhk recap` | 오늘 한 일 정리 + ADR 분리 (비-TTY/헤드리스: `--summary/--next/--decisions/--blockers/--yes`) |
| `vhk sync` | RULES.md → 규칙 파일 동기화 (`--check` = drift 검사만, Goal 63) |
| `vhk check` | RULES.md 규칙 점검 |
| `vhk secure` | 보안 스캔 (시크릿 유출 검사) |
| `vhk cloud` | .vhk 클라우드 백업·복원 (push/pull) |
| `vhk ship` | 배포 체크리스트 + 회고 |
| `vhk doctor` | 개발 환경 점검 (+ `--strict` 드리프트 게이트) |
| `vhk save` | git 저장 (add → commit → push) · 커밋 메시지 미지정 시 변경 파일 기반 자동 생성, `-m "메시지"` 로 직접 지정 |
| `vhk undo` | 최근 커밋 되돌리기 |
| `vhk restore` | sync 백업 복원 |
| `vhk status` | 프로젝트 상태 대시보드 |
| `vhk stats` | 통계 대시보드 — 패스율/차단율/진화 적용율 (읽기 전용) |
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
| `vhk context` | 프로젝트 맥락 파일 생성 (.vhk/context.md) |
| `vhk mode` | Safety Mode 조회/변경 (lite\|standard\|strict) |
| `vhk verify` | 검증 게이트 실행 + 증거 기록 |
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
| `vhk content` | 콘텐츠 초안 프롬프트 생성 (풀사이클 뒷단 — 콘텐츠/마케팅 → `.vhk/content-prompt.md`) |
| `vhk launch` | 런칭 게시물 프롬프트 생성 (풀사이클 뒷단 — 런칭 → `.vhk/launch-prompt.md`) · `ship`=코드 npm 배포와 구분 |
| `vhk ops` | 운영 회고 프롬프트 생성 (풀사이클 뒷단 — 운영 → `.vhk/ops-prompt.md`) · 유지/피벗/아카이브 회고, 중단·삭제는 사람이 |
| `vhk sell` | 판매 카피 프롬프트 생성 (풀사이클 뒷단 — 판매 → `.vhk/sell-prompt.md`) · 가격 페이지·FAQ 초안, 결제·과금은 사람이 |
| `vhk work` | AI 작업 시작/이어하기 (+ handoff) |
| `vhk goal` | Goal 단계별 미션 관리 |
| `vhk blocker` | 블로커 기록 (3건 누적 시 HARD_STOP) |
| `vhk learn` | 교훈 기록 → memory v2 단일 SoT |
| `vhk resume` | .vhk/HARD_STOP 해제 (`--confirm` 필요) |
| `vhk pattern` | 반복 패턴 감지·목록 (`pattern detect` · `pattern list` · `pattern dismiss`) |
| `vhk evolve` | 패턴 → 룰 후보 제안·반영·undo |
| `vhk seo` | SEO·수익 대시보드 (init: 사이트 등록 + 자격증명 보관) |
| `vhk help` | 도움말 |

> 내부 구현 파일(verify-report·memory-eval)은 독립 명령이 아님 — 각각 `vhk verify --report`,
> `vhk memory eval` 로 노출됩니다.

---
*Generated by `vhk init` — 수정해도 됩니다*