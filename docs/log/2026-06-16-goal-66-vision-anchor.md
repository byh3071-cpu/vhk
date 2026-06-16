# 2026-06-16 — Goal 66: VISION.md 북극성 앵커 구현

## 한 일

- `src/templates/vision.ts` 신규: `VISION_TEMPLATE(name, description)` — What/Why/DoD/Non-goals/Loop Anchor 5섹션, placeholder만(자동채움 금지)
- `src/commands/init.ts`: import + `generateFiles` 에 `'VISION.md': VISION_TEMPLATE(name, description)` 추가(`docs/PRD.md` 직후)
- `tests/init.test.ts`: `EXPECTED_FILES` 에 `'VISION.md'` 추가
- `scripts/check-goal-66.mjs`: 고유 검증 9개 채움(vision.ts export·섹션·init 배선·도그푸딩)
- `VISION.md` 레포 루트 도그푸딩: vhk 실제 What/Why/DoD/Non-goals/Loop Anchor

## 검증

- typecheck/lint ✓
- test 1690 pass (init.test.ts EXPECTED_FILES 반영)
- `node scripts/check-goal-66.mjs` → ✅ goal 66 gate passes

## 교훈

- VISION 은 PRD(상세 정의)·RULES(규칙 SoT)와 달리 `불변 의도`만 담는 앵커 — 내용 중복 없이 `Loop Anchor` 섹션이 핵심 차별점
- 도그푸딩 VISION.md 는 goal 67(loop-brief) 의 e2e 전제(What 한 줄·Loop Anchor 추출 소스)
