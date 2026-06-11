---
vhk_format: 1
type: goal
id: 63
title: vhk sync --check — 8개 sync 타겟 전체 drift 검사 모드 (쓰기 0) — P1
status: DONE
priority: P1
created: 2026-06-11
completed: 2026-06-11
leads_to: 규칙 단일소스 무탐지 붕괴 차단 · check-rules-sync(CLAUDE.md 1타겟 한정) 대체/보완
---

# Goal 63: vhk sync --check

> 출처: governance 배치(#261) 코드리뷰·적대검증 발견 — check-rules-sync.mjs 는 8개 sync
> 타겟 중 CLAUDE.md 1개만 가드하고, 역방향(매핑된 섹션이 블록에서 통째로 빠진 경우)도
> 무탐지. 별도 검사기를 더 만들면 sync 로직과 검사기가 어긋나는 "검사기의 drift" 위험 —
> sync 명령 자체에 내장하는 것이 맞는 고도(docs/log/2026-06-10-governance.md 통합 섹션).

## 배경

- RULES.md(단일소스) → vhk sync → 8개 산출물(.cursorrules·.windsurfrules·copilot·
  .agents/rules·AGENTS.md·GEMINI.md·.clinerules·CLAUDE.md 블록).
- 현재 산출물 직접 편집/스테일은 doctor --strict(checkRuleDrift)와 check-rules-sync 가
  부분만 커버 — 둘 다 sync 생성 로직과 별도 구현이라 sync 가 바뀌면 오탐/미탐.

## 동작

- `vhk sync --check`: **쓰기 0** — syncCore 가 지금 생성할 콘텐츠를 디스크 8개 타겟과
  비교, drift 목록 출력. drift 0 → exit 0, 있으면 exit 1 + "vhk sync 로 재전파" 안내.
- 비대화형 안전(백업/프롬프트 없음). 한국어 별칭·ko.ts 메시지.
- 게이트 연결: scripts/check-rules-sync.mjs 는 `vhk sync --check` 위임으로 교체 또는
  병행(dist 빌드 선행 전제 — Stability Gates 가 build 먼저라 충족).

## Completion Check

- [x] sync.ts 에 --check 경로(생성 로직 재사용 — syncCheck 가 buildSyncPlan 호출, 중복 구현 0)
- [x] 타겟 1개 직접 수정 → --check exit 1 재현 / 복구 후 exit 0 (라이브 3단 e2e)
- [x] CLAUDE.md 블록 수동 변조 → 감지 (tests/sync-check.test.ts)
- [x] 테스트 7건(tmpdir 픽스처) + 기존 sync 테스트 회귀 0
- [x] README 사용법 갱신 / COMMANDS.md 행은 goal 64 전수 작업에 포함

## 경계 (OUT)

- sync 생성 포맷 변경 금지(GA — 비교만 추가). doctor checkRuleDrift 제거는 별도 판단.
