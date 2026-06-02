---
vhk_format: 1
type: goal
id: 16
title: vhk sync 확대 — Gemini CLI + Cline (P2)
status: NOT_STARTED
priority: P2
version: v1.8.1
---

# Goal 16: vhk sync 확대 (Gemini CLI + Cline)

> 출처: 포터빌리티 로드맵 STEP 1.5 잔여. RULES.md 단일소스 → AI 코딩 도구 규칙 파일 동기화 대상 확대.
> 전제: sync 5종(Cursor·Windsurf·Copilot·Antigravity·AGENTS.md) 완료(v1.5.0). SYNC_TARGETS 레지스트리 경유.

## 배경
`vhk sync` 는 RULES.md 를 단일소스로 여러 AI 도구 규칙 파일을 생성한다. 사용자가 도구를 바꿔도 규칙이 따라가는 포터빌리티가 핵심. 현재 5종 → 공식 경로가 검증된 2종(Gemini CLI, Cline)을 추가한다.

## 동작 (파일·계약)
- Gemini CLI → 루트 `GEMINI.md` (공식 GEMINI.md 컨텍스트 파일, Markdown 무제한).
- Cline → 루트 `.clinerules` (공식 docs.cline.bot/customization/cline-rules, Markdown 무제한).
- `SYNC_TARGETS`(src/commands/sync.ts) 레지스트리에 2 엔트리 추가 + 각 생성함수(`buildCodingDoc` 재사용) + ko 메시지.
- drift 감지·백업·.synced·--dry-run·비대화형 가드는 레지스트리 순회라 **추가 배선 0** 으로 자동 반영.
- 크로스플랫폼(path 조합), secret 미포함(RULES.md 그대로 변환).

## 철학
① RULES.md 단일소스 — 도구별 출력은 파생물 ② 공식 경로만(근거 없으면 제외) ③ 레지스트리 1곳 추가 = sync·drift·백업 자동 ④ 기존 sync 동작 무손상.

## Completion Check
- [ ] vhk sync → 루트 `GEMINI.md` 생성 (RULES.md 본문 반영)
- [ ] vhk sync → 루트 `.clinerules` 생성 (RULES.md 본문 반영)
- [ ] SYNC_TARGETS 5종 → 7종 (회귀 가드: 길이·경로)
- [ ] drift 감지/백업/--dry-run 이 새 2종 자동 포함 (추가 배선 0 확인)
- [ ] Zed(.rules) 미추가 (기존 AGENTS.md/CLAUDE.md/.cursorrules 로 커버 — 중복 방지)
- [ ] COMMANDS.md / README sync 대상 표 갱신 (7종)
- [ ] vhk goal sync → check-goal-16.mjs 생성 → vhk goal check --id 16 통과
- [ ] 공통 게이트 통과 (typecheck + test + build + secure), 기존 회귀 0

## 제외 범위
- Zed `.rules` (중복 — zed.dev/docs/ai/rules 가 AGENTS.md·CLAUDE.md·.cursorrules 읽음)
- 공식 경로 근거 없는 임의 도구 (Continue/기타) → 근거 확보 시 별도 goal
- sync UX/대화형 변경 → 범위 밖

## Mandatory Reading
- src/commands/sync.ts (SYNC_TARGETS 레지스트리 + SyncTarget 타입 + buildCodingDoc)
- src/lib/drift.ts (SYNC_TARGETS 순회 — 자동 반영)
- src/i18n/ko.ts (ko.sync.* 완료 메시지)
