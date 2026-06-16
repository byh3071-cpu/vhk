# 2026-06-16 — Goal 67: vhk loop-brief 구현

## 한 일

- `src/commands/loop-brief.ts` 신규: `loopBrief()` 함수 — VISION(What+Loop Anchor) + 활성 goal 1개 + recall 교훈 top2 + STOP조건(HARD_STOP+블로커) → `.vhk/loop-brief.md` 출력
- 4지점 등록: `src/index.ts` (command + `루프브리핑` alias) · `src/lib/command-registry.ts` · `src/lib/nlp-router.ts` (NlpCommand 타입 + 룰) · `src/lib/nlp-run.ts` (dispatch case)
- MCP 등록: `src/mcp/server.ts` — `loop-brief` tool
- `COMMANDS.md` 문서화
- `scripts/check-goal-67.mjs` 고유 검증 13개 채움
- `tests/mcp-cli-contract.test.ts`: EXPECTED_TOOLS에 `loop-brief` 추가 + count 29→30 + DELEGATION 추가

## 디버그 이력

- **typecheck 에러**: `g.id` → `g.frontmatter.id`, `active.title` → `active.frontmatter.title` 등 `ParsedGoal` 구조 오해(frontmatter 래퍼 경유 필수)
- **e2e [object Object]**: `recallForAction` 반환 `RecallHit[]` — `r.entry.content.split('\n')[0]` 사용
- **e2e printNextStep 배열**: 함수 시그니처 `{ message, command? }` 객체 — 배열 → 객체 수정
- **t() fallback 무시**: `t(key, fallback)` 두 번째 인자 미지원 — 직접 문자열 사용

## 검증

- typecheck/lint ✓
- test 1691 pass
- `$env:VHK_GATES_SKIP_DEEP=1; node scripts/check-goal-67.mjs` → ✅ goal 67 gate passes
- e2e `node dist/index.js loop-brief` → 정상 출력 + `.vhk/loop-brief.md` 저장

## 교훈

- `ParsedGoal` 는 `{ filePath, frontmatter, body }` 래퍼 — `g.frontmatter.id` 경유 (평탄 구조 착각 주의)
- MCP tool 추가 시 `mcp-cli-contract.test.ts` EXPECTED_TOOLS + count + DELEGATION 3곳 동시 갱신 필수
