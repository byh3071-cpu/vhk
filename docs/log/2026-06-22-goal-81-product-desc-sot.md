# 2026-06-22 — Goal 81: 제품 설명 단일 SoT (index.ts → package.json.description 주입)

> append-only. 추가만, 수정·삭제 금지.

## 선조사 → 범위 재조정 (goal 79 선례 "확실한 것만")
- **카드 전제가 코드와 어긋남**: 카드는 "brief 가 제품 설명을 하드코딩 → package.json 주입"이라 했으나, `brief.ts` 는 하드코딩 안 함 — `readProjectIdentity()` 로 RULES.md "한 줄 설명" → `package.json.description` 폴백 순으로 읽는다(VHK-004 의도, 유저 프로젝트 문서-우선 SoT). brief 를 package.json 으로 강제하면 VHK-004 가 깨짐 → **건드리지 않음**.
- **전수 grep 결과 진짜 SoT 위반 1곳**: `index.ts:181 .description('VHK — AI 코딩 세션을…')` = `package.json.description` 첫 문장의 하드코딩 복제(드리프트 위험). → 이것만 수정.
- 나머지 "설명" 문자열 = 브랜드 태그라인(다른 층위, 유지): 메뉴 헤더 "바이브코딩 프로젝트 코치" · RULES.md "한 줄 설명" · core-ruleset role · gate.ts hint.

## 한 일
- **Goal 81 DONE** — 제품 설명을 `package.json.description` **단일 SoT**로 고정. `index.ts` 의 하드코딩 복제를 런타임 주입으로 구조적 제거(드리프트 원천 차단).

## 변경 (산출물 포인터)
- `src/lib/version.ts` — `getVhkDescription()` 추가(`getVhkVersion` 동형: 같은 폴백 경로 + BOM 안전, description 부재 시 빈 문자열).
- `src/index.ts` — `.description(getVhkDescription())` 런타임 주입(하드코딩 리터럴 제거). 메뉴 헤더(962)에 "브랜드 태그라인 ≠ npm 제품 설명" 의도 주석.
- `tests/version-sync.test.ts` — Goal 81 describe: getVhkDescription == package.json.description + index.ts 하드코딩 복제 금지 가드.
- `scripts/check-goal-81.mjs` — 고유 게이트.
- `goals/81-product-desc-sot.md` — 선조사 재조정 노트 + status DONE.
- `goals/README.md` — 자동 재생성.

## 검증
- `npx vitest run tests/version-sync.test.ts` → 5 pass(신규 2).
- `vhk --help` → package.json.description **전체** 노출(주입 작동 확인).
- `pnpm build` OK · 전체 테스트 **1772 pass** · check-goal-81 고유검증 전부 ✓.

## 교훈
- **카드 전제는 검증 대상**: 도그푸딩 감사가 본 "drift"(brief vs package)는 실제론 *RULES.md 태그라인 vs package 설명* = VHK-004 의도된 층위차였다. 선조사 없이 카드대로 "brief→package 강제"했으면 유저 프로젝트 SoT를 깰 뻔. → goal 79식 "선조사 후 확실한 것만".
- **태그라인 ≠ 제품 설명**: 둘을 한 SoT로 합치려 하지 말 것. 브랜드 별칭(짧은 후크)과 npm 제품 설명(검색·--help)은 목적이 달라 의도적으로 분리 유지가 옳음 — 합치면 둘 다 어색.
- 런타임 주입(getVhkVersion 동형) > 빌드주입/가드테스트: 복제 자체를 없애면 드리프트가 구조적으로 불가능(가드가 잡을 드리프트가 안 생김).

## 다음
- 다음 P2 도그푸딩: goal 82(.vhk gitignore 정합) · 83(보안 scan false positive allowlist) · 84(doctor/status next-step 맥락). 또는 우선순위 2 measure-first 누적 대기.
