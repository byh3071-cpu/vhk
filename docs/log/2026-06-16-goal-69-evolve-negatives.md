# 2026-06-16 — Goal 69: vhk evolve negatives (부정 예시 자동 수집)

## 한 일

Fable5 "부정 예시 설계" 패턴 이식 — 실패가 자산. `vhk evolve` 컨테이너에 신규 서브커맨드 `negatives` 추가.

- `src/commands/evolve.ts`:
  - 순수함수 `buildNegativeFromFailure(FailEntry)` → `"❌ 하지 마라: <행동> — 이유: <원인>"` (content→lesson→id 폴백, why 없으면 이유 절 생략)
  - 순수함수 `extractTsTitle(content)` → 트러블슈팅 문서 첫 H1 추출
  - 순수함수 `renderNegativeCandidates(failures, ts)` → ❌ 후보 마크다운 본문(결정적, 타임스탬프는 핸들러 주입)
  - 핸들러 `evolveNegatives()` — `readMemory(cwd).failures` + `docs/troubleshooting/TS-*.md` 수집 → `.vhk/negative-candidates.md`. **RULES.md 자동 편집 0**(후보 제안만). 빈 입력도 graceful.
- 등록: `index.ts`(서브커맨드 `negatives`+한글별칭 `부정예시`) · `command-registry.ts`(CONTAINER_SUBCOMMANDS.evolve) · `ko.ts`(negativesTitle) · `COMMANDS.md`(행). evolve 는 컨테이너 단위 NL 라우팅(→list)이라 서브커맨드별 nlp 항목은 기존 패턴(apply/reject 동일)대로 생략.
- 보호: `.vhk/.gitignore` + `vhk-dir.ts` 템플릿에 `negative-candidates.md` 추가 — failures 버킷(개인 메모) 파생이라 원천(memory.json)과 동일 보호등급(로컬 전용).
- 게이트: `scripts/check-goal-69.mjs` 고유 검증(순수함수 export·수집원·RULES.md 미편집·등록) + `tests/evolve-negatives.test.ts`(순수함수 7건, TDD RED→GREEN).

## 검증

- 전체 테스트 **1728 pass**(1721 + 신규 7) · 167 files
- `check-goal-69.mjs`: typecheck ✓ · lint ✓ · 고유검증 12/12 ✓
- e2e `node dist/index.js evolve negatives` → exit 0, `.vhk/negative-candidates.md` 생성(실 failures 13건 추출 확인)

## 교훈

- `node <cli> | Select-Object -First N`(PowerShell) 은 출력이 N줄 초과 시 stdin 조기 종료 → node EPIPE → **exit 255 거짓실패**. 진짜 종료코드는 파이프 없이(`> file`) 확인해야 함. (이전 세션 goal 68 "exit 255 디버깅"도 동일 착시 가능성.)
- evolve 는 컨테이너 명령 — 신규 서브커맨드는 top-level 4지점이 아니라 CONTAINER_SUBCOMMANDS + COMMANDS.md(commands-doc.test 강제). nlp 는 컨테이너 단위만(서브 단위 라우팅 없음).
