# 2026-06-23 — Goal 86: vhk receipt MVP (RFC 0056 T1) — 4대 기계증거를 영수증 1장으로

## 무엇
에이전트의 "됐어요"를 **기계증거 영수증** 1장으로 바꾸는 신규 명령 `vhk receipt`. VHK 새 정체성
(ADR-006 / RFC 0056 — 멀티툴 솔로용 거짓완료 탐지기)의 첫 쐐기. 완료 시점에 4대 기계증거를 모아
`.vhk/receipts/<날짜-decision-시각>.{json,md}` 로 굳히고 `decision = block|caution|pass` 를
**기계증거로만(LLM 추론 0)** 낸다.

- ① tsc/test/build 실종료코드(`verifyEvidence` 재사용 — 자기보고 거부, 실제 프로세스만)
- ② git dirty(`getCommitInfo` 재사용 — Goal 85 `filterSelfTrackedLines` 로 자기 ledger 제외)
- ③ stale = 작업시작 기준선 SHA ≠ 현재 HEAD(`.vhk/receipts/.base-sha` 또는 `--since <sha>`)
- ④ 변경라인 diff-cover(`diffCoverage` 재사용 — **advisory 약신호**)

## 핵심 불변식(테스트로 고정 — tests/receipt.test.ts)
1. **decision 은 기계증거만.** 실차단 3종(red·dirty·stale) 중 하나라도면 block.
2. **단조성: caution → pass 격상 절대 금지.** `decideReceipt` 는 "block? → caution? → pass" 폭포라
   부정 신호가 늘면 pass→caution→block 한 방향으로만 간다(역행 분기 없음). `order[pass]<caution<block` 로 단조 고정.
3. **④ diff-cover 는 advisory** — block 분기(`e.gates.red || e.dirty || (e.staleKnown && e.stale)`)에
   들어가지 않는다. 0% 미커버여도 최대 caution. 실차단은 종료코드·dirty·stale **3종만**.
4. **stale 미상(기준선 미기록)은 거짓 block 금지** — `staleKnown=false` 면 모르는 걸 빨강으로 위장하지 않고 caution.

## 설계 — 순수/경계 분리
- `src/lib/receipt.ts` = **순수 핵심**(IO 0): `decideReceipt`·`buildReceipt`·`renderReceiptMarkdown`·`HONESTY_LINE`.
  불변식 테스트가 여기 고정.
- `src/commands/receipt.ts` = **경계**(IO): verify/git/diff-cover 수집 + .json/.md 쓰기 + `printNextStep`.
  신규 발명 최소 — 기존 디스크 작동 자산 조립 글루코드.
- `.md` = PR/대화 붙여넣기 1블록(decision 배지 + 게이트표 + 사유 + 정직성 1줄).

## 자기-dirty 봉인 (★중요)
영수증 자신이 작업트리를 dirty 만들어 다음 receipt 의 증거 ②를 오염(자기모순=늘 block)시키지 않게
`.vhk/receipts/`(+`.base-sha`)를 `.vhk/.gitignore` 에 등록(`ensureVhkIgnored`)·init 씨앗(`templates/vhk-dir.ts`)에 동봉.
ledger/events(repo 영속 증거)와 달리 receipt 는 로컬 산출물이라 **추적 제외**가 정합(Goal 85 와 다른 층위).
→ 실측: receipt 생성 후 `git status` 에 receipt 가 안 잡힘(자기 dirty 0).

## 등록 4지점 + 드리프트
index.ts · command-registry(TOP_LEVEL) · cli-args(KNOWN_COMMAND_TOKENS) · ko.ts + nlp-router(+nlp-run dispatch) +
한글별칭 `증거영수증`. `tests/receipt-registration.test.ts`(4지점 introspect) + 기존 `tests/command-registry.test.ts`·
`tests/nlp-router.test.ts`(영문 `receipt`·한글 `증거영수증` 라우팅, review 와 충돌 0) 드리프트 가드.
COMMANDS.md·README·goals/README 동기화(드리프트 테스트 통과).

## 핵심 교훈
- **tsup 빌드는 타입체크 안 한다** — `tsc --noEmit`(check-goal-86 게이트)만이 unused import(writeFileSync) 잡음.
  게이트가 빌드 통과를 신뢰 못 하게 한 게 정답.
- nlp 규칙 순서: receipt 를 review **앞**에 두되 트리거를 '영수증/receipt' 로 한정 — bare '거짓완료' 는 review 유지.

## 한계(정직 — 잔존 위험)
- **diff-cover 구조적 한계(RFC 0056 §11 ①)**: covered=실행 도달≠정확성. 영수증은 **게으른 거짓완료**
  (빌드 깨짐·미커밋·stale)만 잡고 "그럴듯하게 틀린 코드"는 못 잡는다. .md 하단 `HONESTY_LINE` 에 박음.
- **자기 ledger 위조 사각지대(Goal 85 ②)**: dirty 판정에서 자기파일을 빼므로 vhk 가 자기 ledger 를 위조하면 못 잡는다.
- **virgin repo 첫-실행 edge**: `.vhk/.gitignore` 가 아직 미커밋(untracked)인 가상 레포에선 그 untracked 자체가 dirty→block.
  실제 프로젝트는 `vhk init` 후 `.vhk/` 를 커밋하므로 해소. Goal 85 의 최소 화이트리스트 원칙을 지키려 **whitelist 과확장 안 함**(정직).
- **stale 은 사람이 `--mark-start` 로 기준선을 찍어야** 판정 가능(세션 자동 훅은 T2+ 범위). 미기록 시 caution.

## 산출물
- 신규: `src/lib/receipt.ts`, `src/commands/receipt.ts`, `tests/receipt.test.ts`, `tests/receipt-registration.test.ts`, `scripts/check-goal-86.mjs`
- 수정: `src/index.ts`, `src/lib/command-registry.ts`, `src/lib/cli-args.ts`, `src/lib/nlp-router.ts`, `src/lib/nlp-run.ts`, `src/i18n/ko.ts`, `src/templates/vhk-dir.ts`, `COMMANDS.md`, `README.md`, `goals/86-receipt-mvp.md`, `goals/README.md`
- 게이트: `pnpm build` ✓ · 전체 테스트 1897 pass(180 files) · `secure scan` CRITICAL 0/HIGH 0 · check-goal-86 ✓
