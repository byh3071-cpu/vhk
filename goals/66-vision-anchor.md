---
vhk_format: 1
type: goal
id: 66
title: VISION.md 북극성 앵커 — 루프 매-틱 의도 고정 (init 템플릿 + 도그푸딩) -P1
status: DONE
priority: P1
created: 2026-06-13
leads_to: 67
---

# Goal 66: VISION.md 북극성 앵커

> 출처: 루프 엔지니어링(Claude Code 자율 루프 설계) 5원칙 중 **"의도 고정 — 각 반복이
> 같은 방향을 향하게 VISION 을 사용"**. vhk 는 클로즈드 루프(`/loop`+`auto-merge`)·하드스탑
> (`.vhk/HARD_STOP`)·메모리(v2 4버킷)·자기개선(`evolve`)은 갖췄으나, *변하지 않는 의도*만
> 담은 앵커 파일이 없다. PRD.md(상세 제품정의)·RULES.md(규칙 SoT)와 역할이 다르다.
> ⚠️ **기안 단계(NOT_STARTED)** — 카드만. 착수 시 status 를 IN_PROGRESS 로.

## The Goal

`vhk init` 이 **VISION.md(북극성 앵커)** 를 생성하고, vhk 레포 자체도 VISION.md 를 갖는다.
VISION 은 루프가 매 틱 "의도 재고정"용으로 읽는 짧고 불변인 문서다. Goal 67(`vhk loop-brief`)이
이 파일의 `## Loop Anchor` 섹션을 추출해 1틱 번들에 넣는다.

## VISION.md 섹션 설계 (짧고 불변 — context.md/brief 와 차별)

```
# VISION — <프로젝트명>

> 북극성 앵커. 루프가 매 틱 의도 재고정용으로 읽는다. 짧게 유지.
> 자주 바뀌는 상태는 .vhk/context.md · docs/state/ 로. 여기엔 변하지 않는 의도만.

## What (한 줄)
<무엇을 만드는가 — 한 문장>

## Why (북극성)
<왜 — 사용자/문제. 2~3줄>

## Definition of Done (v1 출시 기준)
- [ ] <측정 가능한 완료 조건 1>
- [ ] <조건 2>

## Non-goals (범위 수비)
- <안 하는 것 1 — BACKLOG.md v1 OUT 과 연결>

## Loop Anchor (루프가 매 틱 지킬 것)
- 한 번에 goal 1개. STOP 조건 우선.
- 의심되면 멈추고 사람 확인.
```

- **What/Why/DoD/Non-goals** 는 PRD·BACKLOG 와 의미 중복 없이 "불변 의도"로 한정.
  Non-goals 는 기존 `BACKLOG.md`(v1 OUT) 와 연결되는 범위 수비.
- **Loop Anchor** 가 이 goal 의 차별점 — Goal 67 이 추출하는 STOP 원칙/1-goal 규칙의 SoT.

## 동작 (착수 시)

1. `src/templates/vision.ts` 신규 — `export function VISION_TEMPLATE(name, description): string`.
   기존 `claude-md.ts`/`prd.ts` 시그니처 관례. stack 불필요(비전은 기술과 무관).
   placeholder 안내문(`<...>`·체크박스)만 — **자동 채움 금지**(사람이 채우는 의도 문서).
2. `src/commands/init.ts` — import + `generateFiles` 반환 객체에
   `'VISION.md': VISION_TEMPLATE(name, description)` (루트 배치, `docs/PRD.md` 직후).
3. `tests/init.test.ts` — `EXPECTED_FILES` 에 `'VISION.md'` 추가.
4. `VISION.md`(레포 루트) 신규 — 도그푸딩. vhk 실제 What/Why(`src/index.ts` description 재사용).
   Goal 67 의 e2e 전제(loop-brief 가 vhk 레포에서 비전 섹션을 읽을 수 있어야 함).

## Completion Check (착수 후)

- [ ] `_meta` 모든 게이트 통과 (typecheck / tests / build)
- [ ] `src/templates/vision.ts` 의 `VISION_TEMPLATE` 출력에 핵심 섹션 헤더 존재
      (What / Definition of Done / Non-goals / Loop Anchor)
- [ ] `generateFiles` 가 `VISION.md` 를 반환 + `tests/init.test.ts` EXPECTED_FILES 반영
- [ ] vhk 레포 루트에 도그푸딩 `VISION.md` 존재

## Forbidden Actions (OUT)

- VISION 을 `sync` 파생 대상(`SYNC_TARGETS`)에 추가 금지 — 규칙이 아니라 독립 비전 파일.
- VISION 자동 생성/AI 채움 금지 — placeholder 만, 사람이 채운다.
- PRD/BACKLOG 와 내용 중복 금지 — 앵커=불변 의도로 한정.
- 기존 tool API 시그니처 변경 0 (GA 안정성).
