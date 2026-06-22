# 2026-06-22 — Goal 82: .vhk 증거 원장 추적 정합 (ledger.jsonl 추적)

> append-only. 추가만, 수정·삭제 금지.

## 선조사 → 범위 재조정 (goal 79/81 선례 "확실한 것만")
- **카드 premise 가 정책과 정반대**: 카드는 "`ledger.jsonl` 을 .gitignore 에 추가"라 했으나, `.vhk/README` **spec 1.1 트래킹 정책이 이미 `ledger.jsonl`·`events/ai-actions.jsonl` 둘 다 ✅ 추적("레포 영속", Goal 45/55)으로 결정**했다.
- 실측: `ai-actions.jsonl` 은 추적 정합. `ledger.jsonl` 만 **untracked**(한 번도 `git add` 안 됨). `git check-ignore .vhk/ledger.jsonl` = 비어 있음(어떤 .gitignore 로도 제외 안 됨) → 단지 미추가.
- 따라서 `?? .vhk/ledger.jsonl` 노이즈의 올바른 해소 = **gitignore 가 아니라 추적**. gitignore 하면 Goal 45 증거 영속 설계가 깨짐(Forbidden "증거 원장 무결성 훼손 0" 정면 위반).

## 한 일
- **Goal 82 DONE** — `.vhk/ledger.jsonl` 을 git 추적시켜 spec 1.1·Goal 45 와 일치(untracked `??` 노이즈 해소). 정책을 테스트·게이트로 락.

## 변경 (산출물 포인터)
- `.vhk/ledger.jsonl` — `git add`(추적). 기존 1줄 PASS 증거 보존(원장 무결성 — 재작성 안 함).
- `.vhk/README.md` — 트래킹 정책표 아래 명확화: 증거 원장은 **증거 이벤트에만 append**(`ledger`=verify 시, `ai-actions`=가드 mutate 시) → **일반 명령(status·goal·recall·brief)은 안 건드림** → git status 깨끗. verify 후 ` M ledger.jsonl` 은 노이즈가 아니라 그 작업의 증거.
- `tests/vhk-artifact-tracking.test.ts` — 정책 가드: gitignore(root·.vhk)가 두 증거 원장을 제외 안 함 + README 가 추적으로 명문화(미래 드리프트=증거 휘발 차단).
- `scripts/check-goal-82.mjs` — `git ls-files`/`git check-ignore` 로 두 원장 추적·비제외 검증.
- `goals/82-vhk-artifact-gitignore.md` — 재조정 노트 + status DONE.

## 검증
- check-goal-82 고유검증 7항목 전부 ✓(ledger 추적 RED→git add→GREEN).
- `pnpm build` OK · 전체 테스트 **1775 pass**(신규 가드 3).
- ai-actions.jsonl 미변경(Forbidden — `git rm --cached` 안 함).

## 교훈
- **카드 premise 는 검증 대상, 특히 "정합"류 goal**: 도그푸딩 감사가 `??`(untracked)를 보고 "gitignore 하자"로 적었지만, 정책(spec 1.1)은 정반대(추적). untracked ≠ should-ignore — `git check-ignore` 로 "제외됐나 vs 안 더해졌나"를 먼저 구분해야. 카드대로 gitignore 했으면 Goal 45 증거영속을 깰 뻔.
- **증거 원장의 git status 등장은 버그 아님**: append-only 증거 로그는 증거 이벤트(verify·mutate)에만 변경 → 그건 "그 작업의 증거"라 작업과 함께 커밋이 정상. 일반 명령이 안 건드리면 정합. "git status 청결"과 "증거 영속"은 양립한다(변경 주체를 증거 이벤트로 한정하면).

## 별도(범위 밖) 관찰
- `docs/state/research-backlog.md` 가 untracked 로 status 에 뜸 — .vhk 산출물 아님(goal 82 범위 밖). 별도 처리(커밋 or 정리) 필요 — 추정 RFC 0054(#307) 잔여.

## 적대 리뷰 반영 (12-에이전트, 3렌즈+반증)
- 재조정(추적 vs gitignore) **타당 확정**(반증 실패). confirmed 5건 = 전부 **가드 견고성**(코어 변경 아님).
- **major 반영**: `git check-ignore` 는 **이미 추적된 파일엔 ignore 패턴을 안 잡는다**(데드 가드) → "ledger 를 gitignore 에 추가" 회귀를 못 봄. `--no-index` 로 수정(추적 무관 패턴 평가). check-goal-82 + vitest 둘 다 적용.
- **가드 이전**: vitest(=CI 집행)에 git 권위 검사(`ls-files` 추적 + `check-ignore --no-index` 비제외) 이전 — 기존엔 텍스트 휴리스틱만이고 실제 추적/제외 판정은 CI 미연결 check-goal-82 에만 있어 회귀를 CI 가 못 잡던 갭 해소.
- **양성 대조 추가**: 실제 ignore 경로(`.vhk/memory.json`)를 가드가 검출함을 단언(함수가 깨져 항상 통과하는 거짓 green 방지).
- **nit**: 카드에 verify-dirty trade-off(머지 충돌 표면 작음·sameAsLast dedup) 1줄 명시.
- 결과: 가드 테스트 4 pass(git 권위+양성대조) · 전체 1776 pass · check-goal-82 8항목 ✓.

## 다음
- P2 계속: goal 83(보안 scan 픽스처 false positive allowlist) → goal 84(doctor/status next-step 맥락).
