# 2026-07-13 — 트리거 계층 에이전트 불가지론화 선행 조사 스파이크 (RFC 0057 §7)

> 성격: Phase 4 선행 조사. 코드 변경 0 — 조사 결과·권고·스코프 추정만 기록.
> 발단: RFC 0057 §7 이 "Cursor/Codex 용 SessionStart/Stop 대응물은 설계 자체가 없음 — 조사 선행"으로 유보(§9-3(a) 성립 조건). 이 문서가 그 (a) 조건 — "다른 에이전트의 훅/자동화 메커니즘이 조사·문서화된다" — 를 충족시키는 산출물이다.

## 핵심 판정 (두괄식)

**조사한 4개 도구(Cursor·Codex CLI·Gemini CLI·Cline) 전부 SessionStart 대응 훅 + 컨텍스트 주입 메커니즘이 공식 문서로 확인됐다 (2026-07 현재).** RFC 0057 §7 작성 시점(2026-07-04)의 전제 "대응물 설계 자체가 없다/제공 여부 미조사"는 더 이상 사실이 아니다 — 격차는 "메커니즘 부재"가 아니라 "VHK가 배선 코드를 아직 안 짠 것"으로 재정의된다. **권고: 구현 착수 가능** (상세 §3).

## §1. 조사 결과 표 — 도구 × 트리거 대응물

출처 등급: ◎ = 공식 문서 원문 직접 확인 / ○ = 공식 출처 확인(검색 요약 경유, 원문 정밀 열람 안 함) / △ = 미확인.

| 도구 | SessionStart 대응 | Stop 대응 | 설정 위치 | 컨텍스트 주입 | 자동 실행 조건 | 등급·출처 |
|------|------------------|-----------|----------|--------------|---------------|-----------|
| Claude Code (기준선) | `SessionStart` (matcher `startup`/`resume`) | `Stop` | `.claude/settings.json` | `hookSpecificOutput.additionalContext` / `systemMessage` | 자동 (현행) | ◎ 현행 코드 (`src/commands/init.ts:565-572`) |
| **Cursor** (v1.7.2+) | `sessionStart` | `stop`·`sessionEnd`·`afterAgentResponse` | 프로젝트 `.cursor/hooks.json` (전역 `~/.cursor/hooks.json`) | `sessionStart` 훅이 `additional_context`(+`env`) 반환 지원 | trusted workspace 에서 자동 로드·실행 (승인 프롬프트 없음) | ◎ [cursor.com/docs/hooks](https://cursor.com/docs/hooks) |
| **Codex CLI** | `SessionStart` | `Stop` (외 `UserPromptSubmit`·`PreToolUse` 등 10종) | `<repo>/.codex/hooks.json` 또는 `config.toml [hooks]` (유저 `~/.codex/`) | 훅 stdout plain text 가 developer context 로 주입 | **`/hooks` 로 사람이 훅 정의를 1회 신뢰 승인해야 실행** (미승인 훅은 skip) | ◎ [developers.openai.com/codex/hooks](https://developers.openai.com/codex/hooks) (→ learn.chatgpt.com/docs/hooks) |
| **Gemini CLI** | `SessionStart` | `SessionEnd`·`AfterAgent` | `settings.json` `hooks` 객체 (프로젝트 `.gemini/settings.json`) | `hookSpecificOutput.additionalContext` — **Claude Code 와 사실상 동일 스키마** | 자동 (env: `GEMINI_PROJECT_DIR` 제공) | ◎ [gemini-cli docs/hooks/reference.md](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md) · ○ [geminicli.com/docs/hooks](https://geminicli.com/docs/hooks/) |
| **Cline** (v3.36+) | `TaskStart` (세션 아닌 task 단위) | 미확인 (brief 범위) | `.clinerules/hooks/` (전역 `~/Documents/Cline/Rules/Hooks/`) | stdout JSON `contextModification` 필드 | 스크립트 실행권한 필요, 승인 절차 미확인 | ○ [cline.bot/blog/cline-v3-36-hooks](https://cline.bot/blog/cline-v3-36-hooks) |

보조 트리거(수동적 규칙 주입 — 명령 실행 아님):

| 도구 | 메커니즘 | 시점 | 등급·출처 |
|------|---------|------|-----------|
| Cursor | `.cursor/rules/*.mdc` `alwaysApply: true` | 매 세션 컨텍스트 주입 | ◎ 현행 자산(`ecosystem.mdc` 기배출) · [cursor.com/docs/context/rules](https://cursor.com/docs/context/rules) |
| Codex CLI | `AGENTS.md` — cwd 에서 상향 탐색 로딩 (`project_doc_fallback_filenames` 로 CLAUDE.md 폴백 가능) | 세션 시작 | ○ [openai/codex docs/config.md](https://github.com/openai/codex/blob/main/docs/config.md) |
| Gemini CLI | `GEMINI.md` 컨텍스트 파일 | 세션 시작 | ○ (통설 — 이번 스파이크에서 원문 미열람) |

## §2. vhk 현 자산 × 재현 경로 매트릭스

| vhk 트리거 자산 | 현 구현 (Claude Code) | Cursor | Codex CLI | Gemini CLI | Cline |
|----------------|----------------------|--------|-----------|------------|-------|
| **커스터마이징 인터뷰** — `.vhk/hooks/customization-check.mjs` + `init.ts ensureSessionStartHook`(`.claude/settings.json` SessionStart, `${CLAUDE_PROJECT_DIR}` 치환) | 자동 | **가능** — `.cursor/hooks.json` `sessionStart` + `additional_context` 반환. 경로 치환은 stdin `workspace_roots` 또는 "프로젝트 훅은 project root 에서 실행" 보장으로 대체 | **가능(조건부)** — `.codex/hooks.json` `SessionStart` + stdout 주입. 단 1회 trust 승인 필요 → "완전 무인 온보딩"은 약속 불가, "1회 승인 후 자동"으로 문서화해야 정직 | **가능(최저비용)** — `.gemini/settings.json` `SessionStart` + `hookSpecificOutput.additionalContext` = 현행 출력 스키마 그대로 재사용 가능성 높음 | **가능(추정)** — `.clinerules/hooks/TaskStart` + `contextModification`. task 단위 재발동은 기존 `customization-done` 마커가 이미 방어 |
| **record-reminder** — `scripts/record-reminder.mjs` (Stop, `systemMessage` 로 사용자 화면 경고) | 자동 | **부분 가능** — `stop`/`afterAgentResponse` 이벤트는 있으나 "사용자 화면 경고" 대응 출력 필드(`user_message` 가 permission 계열 훅 외에도 유효한지) 미확인 → 구현 시 확인 필요 | **부분 가능** — `Stop` 이벤트 존재. stdout developer-context 주입은 확인, 사용자-표시 채널은 미확인 | **가능(추정)** — `AfterAgent`/`SessionEnd` 존재, additionalContext 주입 확인. 사용자-표시 채널 미확인 | △ 미확인 (task 종료 이벤트 유무 brief 범위 밖) |
| **check-records 훅 게이트** — `.claude/settings.json` `PreToolUse`(`Bash\|PowerShell`) | 자동 차단 | 가능 — `beforeShellExecution` 이 `permission: deny` 지원 | 가능 — `PreToolUse` + exit 2 차단 | 가능 — `BeforeTool` | △ | 
| **record-net 커밋훅** (RFC 0061 T1, `installRecordCommitMsgHook`) | — | **이미 도구 무관** (git 이 실행 — 어떤 에이전트 커밋도 잡음). 트리거 불가지론의 기존 착지 사례이자 백업 그물 | ← 동일 | ← 동일 | ← 동일 |
| **ecosystem.mdc** (`inject-bootstrap`) | — | **이미 재현됨** — Cursor rules 가 곧 재현 경로 | 해당 없음 (AGENTS.md 가 대응) | 해당 없음 (GEMINI.md 가 대응) | `.clinerules` 가 대응 |

부수 관찰(스코프 밖, 기록만): 이 레포 자신의 `.cursor/rules/ecosystem.mdc` 는 아직 `v1` 블록(구 "Claude Code = primary" 문구)이다 — 템플릿(`src/templates/ecosystem-mdc.ts`)은 `v2` 로 수정 완료(goal 93) 상태이므로, 레포 자체에 `vhk inject-bootstrap`(또는 sync 경로) 재실행이 한 번 필요해 보인다.

## §3. 권고 — 구현 착수 가능 (택1 판정)

**판정: ① 구현 착수 가능.** (② 폴백 문서화 종결 아님 — 대응물이 전부 존재 / ③ 추가 조사 필요 아님 — 착수 판단에 충분한 근거 확보. 단 record-reminder 의 "사용자 화면 경고" 채널 등 세부는 구현 단계에서 도구별 실측 확인.)

근거:
1. 4개 도구 전부 SessionStart 급 훅 + 컨텍스트 주입이 공식 문서로 확인 — "메커니즘 존재 여부"라는 선결 질문이 해소됐다.
2. Gemini CLI 는 출력 스키마(`hookSpecificOutput.additionalContext`)까지 Claude Code 와 동형 — 이식 비용이 사실상 직렬화 어댑터 0에 수렴.
3. `customization-check.mjs` 자체가 이미 도구 무관(Node + 파일시스템 마커만 사용, fail-open) — 도구별로 달라지는 건 (a) 훅 **배선 파일 포맷**과 (b) **출력 직렬화** 두 겹뿐이다.

**무엇부터**: Cursor `sessionStart` 배선(`vhk init` 이 `.cursor/hooks.json` 도 생성)부터. 이유 — 생태계에서 실사용 중인 2순위 도구(ecosystem.mdc 의 Cursor 항목)이고, trusted workspace 자동 실행이라 "자동 온보딩" 약속을 그대로 지킬 수 있다. 다음 Gemini CLI(스키마 동형·최저비용), 그다음 Codex(trust 승인 전제를 문서에 정직 표기). Cline 은 사용 실적이 생기면.

**주의(설계 제약)**:
- 각 도구 훅 스키마는 최근 출시(Cursor 1.7 = 2025-09)라 변동 위험 → 훅 스크립트는 지금처럼 fail-open 유지 + 배선 파일에 스키마 버전 주석. PAT-003(추론 문법으로 훅 배선 금지 — 공식 문서 확인 후 배선) 그대로 적용.
- Codex 는 "1회 사람 승인" 전제를 숨기면 §2.3(ecosystem.mdc)류 과장 재발 — 안내문·문서에 명시.
- 기존 `ensureSessionStartHook` 의 병합-보존(fail-soft) 패턴을 도구별 배선 함수에 동일 적용 — 사용자의 기존 hooks.json/settings.json 을 절대 덮어쓰지 않는다.

**예상 스코프 (1문단)**: `src/commands/init.ts` 에 `ensureCursorSessionStartHook`(`.cursor/hooks.json` 생성·병합) + `src/templates` 에 도구별 훅 어댑터(마커 감지 로직은 `customization-check.mjs` 공유, 출력 직렬화만 분기 — Cursor `additional_context` / Gemini `hookSpecificOutput.additionalContext` 그대로 / Codex plain stdout) + ko.ts 안내문 + 신규 테스트(병합 보존·손상 JSON fail-soft·마커 시나리오). 도구당 goal 1개, Cursor+Gemini 우선 2 goal 이 1차 슬라이스. record-reminder 의 타도구 이식은 사용자-표시 채널 실측 후 후속 goal 로 분리(자문 넛지라 미이식 기간에도 record-net 커밋훅이 집행을 백업).

## §4. RFC 0057 §7 갱신안 문구 초안

§7 말미(또는 §9-3 아래)에 추가할 문구:

> **[2026-07-13 갱신 — §9-3(a) 성립]** 선행 조사 스파이크(docs/log/2026-07-13-trigger-agnostic-spike.md)로 Cursor(`.cursor/hooks.json`, `sessionStart`+`additional_context`, v1.7.2+)·Codex CLI(`.codex/hooks.json`, `SessionStart`/`Stop`, 훅별 1회 trust 승인 필요)·Gemini CLI(`.gemini/settings.json`, `SessionStart`+`hookSpecificOutput.additionalContext` — Claude Code 동형 스키마)·Cline(`.clinerules/hooks/TaskStart`)의 세션 시작 훅 메커니즘이 공식 문서로 확인됐다. 이에 따라 이 격차의 성격을 "대응물 설계 자체가 없음"에서 **"대응물은 전부 존재, VHK 배선 코드가 미구현"** 으로 재정의한다. 착수 순서 권고와 스코프는 위 스파이크 문서 §3 참조. 단, Codex 의 trust 승인 전제(완전 무인 아님)와 각 도구 훅 스키마의 변동 위험(fail-open·버전 주석 필수)을 구현 문서에 정직하게 명시한다.

## 출처 (전체)

- Cursor Hooks 공식 문서: https://cursor.com/docs/hooks (md 원문: https://cursor.com/docs/hooks.md) — 이벤트 목록·hooks.json 위치·`additional_context`·trusted workspace 자동 실행·v1.7.2+ 직접 확인
- Cursor Rules: https://cursor.com/docs/context/rules
- Codex Hooks 공식 문서: https://developers.openai.com/codex/hooks (308 → https://learn.chatgpt.com/docs/hooks) — 이벤트 10종·`.codex/hooks.json`·stdout developer-context·`/hooks` trust 승인 직접 확인
- Codex config(AGENTS.md 로딩): https://github.com/openai/codex/blob/main/docs/config.md
- Gemini CLI Hooks reference: https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md (raw 직접 확인) · https://geminicli.com/docs/hooks/
- Cline Hooks(v3.36 공식 블로그): https://cline.bot/blog/cline-v3-36-hooks
- vhk 내부 근거: `src/commands/init.ts:519-542, 560-600`(SessionStart 배선 + record commit-msg 훅) · `src/templates/customization-hook.ts` · `scripts/record-reminder.mjs` · `.claude/settings.json` · `src/templates/ecosystem-mdc.ts`(v2) vs `.cursor/rules/ecosystem.mdc`(v1 잔존) · `docs/rfc/0057-agent-agnostic-compounding.md` §2.2·§7·§9
