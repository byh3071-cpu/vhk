# 2026-07-13 — #456 뒷단 산출물 RULES.md 상속 (feat/456-rules-inherit)

## 목표
이슈 #456(#279 분리 서브이슈 2/5): 런칭·판매·운영 산출물(content/launch/sell/ops 프롬프트)이
프로젝트 RULES.md 단일소스를 상속하는지 검증·구현.

## 실측 (정찰 결과)
- `buildContentPrompt`/`buildLaunchPrompt`/`buildSellPrompt`/`buildOpsPrompt` 전부 하드코딩
  치명 규칙(Fable5 위생)만 담고 **RULES.md 를 전혀 읽지 않음** — 추정 그대로 확정.
- 재사용 가능한 추출기 발견: `src/commands/remind.ts` 의 `extractCriticalRules`
  (NON-NEGOTIABLE/절대 규칙/Forbidden/전역 금지 섹션 불릿 추출 + `compressRule` 압축).
- #457(오늘 머지)의 "게시 전 보안 게이트" 줄이 content/launch/sell 에 존재(ops 는 의도적 제외) —
  최신 main(769bfc7) 기준 작업, 해당 줄 보존.

## 설계 결정
1. **주입 대상**: RULES.md 치명 섹션 불릿 — `vhk remind` 와 동일 정의. 발행·콘텐츠 키워드
   필터링은 안 함(휴리스틱 오탐/누락 위험 — 치명 규칙은 모든 산출물에 적용이 정직한 기본).
2. **상속 방식**: 정적 복붙이 아닌 **런타임 추출·주입** — 프롬프트 생성 시점에 RULES.md 를
   직접 읽으므로 드리프트가 구조적으로 불가(이슈 완료기준 "드리프트 감지"를 원천 차단으로 충족).
3. **아키텍처**: 추출기를 `src/lib/rules-inherit.ts` 로 이동(lib→commands 역의존 금지 —
   rules-import.ts 의 로컬 섹션파서 선례). remind.ts 는 재수출로 기존 API·테스트 호환 유지.
4. **프롬프트 위생(Fable5)**: 하드리밋 `MAX_INHERIT_RULES=10`(초과분 "…외 N개" 1줄) +
   `MAX_RULE_LEN=120`(말줄임) — 무한정 주입으로 인한 프롬프트 비대 방지.
5. **빌더 순수성 유지**: `rules?: string[]` 파라미터 주입, fs 읽기는 커맨드 액션에서
   (`readCriticalRules()`). RULES.md 없으면 정직한 안내 1줄(현행 동작 유지).

## 산출물
- 신규: `src/lib/rules-inherit.ts` · `tests/rules-inherit.test.ts` · `tests/rules-inherit-wiring.test.ts`
- 수정: `src/commands/{content,launch,sell,ops}.ts`(상속 블록 주입) ·
  `src/commands/remind.ts`(추출기 lib 이동+재수출) · 4개 커맨드 테스트(+상속 검증) ·
  README.md · COMMANDS.md (뒷단 설명에 상속 1줄)

## 검증
- TDD: 레드(14 fail) → 구현 → 그린. 신규·관련 8파일 66 pass.
- 게이트: `pnpm build` ✅ · `pnpm test:run` 2433 pass ✅ · `pnpm lint` ✅ · `pnpm typecheck` ✅ ·
  `node scripts/check-rules-sync.mjs` PASS ✅
- E2E(스크래치 프로젝트): RULES.md 有 → content/ops 프롬프트에 Forbidden 불릿 상속 확인 ·
  RULES.md 無 → "상속 생략" 정직 안내 확인 · #457 보안 게이트 줄 보존 확인.

## 교훈
- 격리 worktree 에 node_modules 가 없으면 tsup/vitest 는 상위 폴더 폴백으로 돌지만
  `pnpm lint`(eslint)는 못 찾는다 — worktree 에서 게이트 돌리기 전 `pnpm install --frozen-lockfile` 필수.
