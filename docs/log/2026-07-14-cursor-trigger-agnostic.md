# 2026-07-14 — 트리거 계층 에이전트 불가지론화 (Cursor 슬라이스)

> RFC 0057 §7 1차 슬라이스. 스파이크(2026-07-13, #501)가 "대응물 부재"를 "VHK 미배선"으로 뒤집은 뒤의 첫 배선.
> 성격: 승인된 로드맵(Phase 4) 항목 이행 — 빚 청산. "VHK 정체성" 규정은 이 커밋에 안 걸림(별도 사람 세션으로 분리).

## 뭘 했나
커스터마이징 인터뷰 넛지를 Claude Code 외 **Cursor** 세션시작에서도 자동 발동.

- `src/templates/customization-hook.ts` — 배출 스크립트를 `--format` 분기로 리팩터. 인터뷰 페이로드는 **SoT 1개**(INTERVIEW_LINES), 출력 직렬화만 분기:
  - 기본(플래그 없음) = Claude Code `hookSpecificOutput`(**하위호환** — 기존 `.claude/settings.json` 배선 무변)
  - `--format cursor` = Cursor `sessionStart` `additional_context`
- `src/lib/cursor-hooks.ts` (신규) — `ensureCursorSessionStartHook`: `.cursor/hooks.json` 생성/병합. `ensureSessionStartHook`(Claude)과 **동일한 병합-보존 규율**(기존 훅·사용자 자신의 sessionStart 불가침, 멱등, 손상 JSON fail-soft skip).
- `src/commands/init.ts` — writeInitExtras 에 배선(선택 기능·try/catch fail-soft, init 중단 안 함).
- `src/i18n/ko.ts` — `cursorHookWired`/`cursorHookFailed`.
- `tests/cursor-hooks.test.ts` (신규) — 10 케이스: `--format` 실행 실측(claude/cursor 출력·페이로드 동일성·done 마커·마커부재) + hooks.json 병합(created/merged/사용자훅보존/idempotent/손상skip).

## 근거·규율
- Cursor 스키마는 **공식 문서 확인 후 배선**(PAT-003) — cursor.com/docs/agent/hooks: `{version:1, hooks.sessionStart[].command}` / stdout `{additional_context}`. 추론 배선 안 함.
- 훅 스키마가 최근 출시(Cursor 1.7)라 변동 위험 → 배출 스크립트 fail-open 유지 + 배선 파일 스키마 주석.
- `customization-check.mjs` 자체는 이미 도구 무관(Node + `.vhk` 마커, fail-open) — 도구별로 갈리는 건 (a) 배선 파일 포맷 (b) 출력 직렬화 두 겹뿐. 이번엔 그 두 겹만 Cursor 용으로.

## 검증
- `pnpm build` ✅ · `pnpm lint` ✅ · `pnpm test:run` ✅ **2509 pass**(신규 10 포함)
- 실 E2E: 임시 프로젝트 `vhk init --yes` → `.cursor/hooks.json` 정확 생성 확인(version 1·sessionStart·`node .vhk/hooks/customization-check.mjs --format cursor`).

## 스코프 밖(정직)
- **Gemini/Codex 슬라이스 미포함** — 스파이크 권고대로 Cursor 먼저. Gemini 는 스키마 동형이라 `--format` 에 케이스 추가면 되고(후속 goal), Codex 는 1회 trust 승인 전제 문서화 필요.
- **record-reminder(Stop) 타도구 이식 미포함** — 사용자-표시 채널 도구별 실측 후 후속. 그 사이 record-net 커밋훅이 집행 백업.
- **VHK 정체성 규정(불가지론=정체성?) 미결** — 이 커밋과 무관, 사람 세션으로 분리(VISION.md 현재 문구 대조 필요).
- 부수: 이 레포 자신의 `.cursor/rules/ecosystem.mdc` v1 잔존 건은 별건(스파이크 §2 관찰).

## 산출물
- 브랜치 `feat/cursor-trigger-agnostic` → PR(머지 안 함).
