# 2026-06-23 — RFC 0056 구현 전 적대 검증: 탐지범위 역설 + #315 자기참조

> 성격: append-only dev log. RFC 0056(Evidence Receipt) T1 착수 **전**, "거짓완료 탐지기" 정체성의 두 급소를 코드로 검증한 세션. Claude(Opus 4.8) 단독 분석, **코드 변경 0(조사만)**. 노션 전체 로드맵 + RFC 0055/0056 + ADR-006 종합에서 출발.

## 한 줄 결론

VHK "거짓완료 탐지기"의 두 급소를 코드로 확인했다: **① diff-cover는 "실행됐나"만 재고 "맞나"는 원리적으로 못 잰다(탐지범위 역설). ② verify가 추적 ledger를 append해 자기 dirty를 만든다(#315 실재).** 둘 다 RFC 0056 킬조건 #4와 직결 — T1 전 선결 대상.

## A. 탐지 범위의 역설 (코드 근거)

- `src/lib/diff-coverage.ts:42-48` — `covered = fc.covered.has(ln)` = "테스트 실행 중 그 라인을 **지나갔나**". 정확성과 무관.
- ⟹ assertion 0 테스트도 covered. `return a - b`(덧셈인데 빼기 버그)도 호출만 되면 초록불. **"그럴듯하게 틀린 코드"를 원리적으로 미탐지.**
- `src/commands/diff-cover.ts:69` — `// 측정 결과로는 exit 0 유지(advisory)`. 차단 0. receipt "4대 증거" 중 diff-cover는 `decision=block`을 **못 만드는 약신호**. 실차단력 = 종료코드·dirty·stale 3개뿐.
- **시사:** 0056 킬조건 #4("미묘히 틀린 코드 구조적 미탐")는 *정밀도* 문제가 아니라 **"커버리지=실행도달" 측정 정의 자체의 한계** → 정밀화로 안 풀림. 단 "테스트가 아예 안 닿은 새 코드"(가장 흔한 게으른 거짓완료)는 잡는다 = 잔존 가치.

## B. #315 자기참조 진단 (코드 근거)

- **writer:** `src/commands/verify.ts:351` — verify 종료 시 `appendLedgerEntry`를 **무조건 시도** → `.vhk/ledger.jsonl` append.
- **추적이 의도:** `src/lib/evidence-ledger.ts:12-16` 주석 — goal 45가 "repo 영속 증거"로 ledger를 **일부러 추적**(gitignore 제외 안 함). events/ai-actions.jsonl도 동일(`action-ledger.ts:9`, `safety-guard.ts:47`). append = dirty.
- **완화장치:** `src/lib/evidence-ledger.ts:60` dedup — 마지막 항목과 (version·sha·status·dirty) 동일 시 skip. ⟹ **"가만 두고 verify 반복 = 늘 빨강"은 과장.**
- **그러나 핵심 시나리오 미차단:** 커밋까지 완료(clean) → receipt/verify → 새 커밋이라 sha 변경 → dedup 통과 못 함 → ledger append → **ledger.jsonl만 dirty** → "dirty면 block" → **다 끝냈는데 vhk 자신이 남긴 한 줄 때문에 block.** (ledger 끝줄 `dirty:true`가 흔적.)
- **일상명령은 안전:** `vhk status`는 추적파일 무변경(재현 확인).
- **판정: #315 실재.** 근본은 **딜레마** — 추적(0056 핵심 "repo 증거") ↔ dirty(자기검증 붕괴)의 정면충돌. 0056 §6 선결 "자기파일 제외"가 정답 방향이나, **그 제외 자체가 새 사각지대**(자기 ledger 위조 미탐) = ②자기참조의 연장.

## 5개 전략 긴장 (요약 — 노션+RFC 종합)

1. **탐지범위 역설** — 잡는 건 게으른 거짓완료뿐, 위험한 건 원리적 미탐(§A).
2. **자기참조 저주** — secure 거짓green·스텁게이트·#315 3중. 치명적이자 최강 도그푸딩 자산.
3. **해자 = 거인의 무관심** — 강한 해자는 기술이 아니라 "벤더 이해상충". 내 실력 아님 → 시간 싸움(0056 §4 자인, 킬 #3).
4. **타겟 180° 전환** — 노션 1조 비전(비개발자 대중)↔0056(개발자 니치). 이유는 "시장 매력"이 아니라 **"1인이 혼자 측정 가능"**(0056 §3).
5. **성공기준이 쉬운 질문에만 답** — 90일 #1(작동하나)은 자기 레포서 통과 가능, 진짜 사인 #2(수요 있나)는 6개월로 유보.

## 시사점 / 다음

- **T1 선결(#315 봉인):** dirty 판정에서 자기 산출 추적파일(`.vhk/ledger.jsonl`·`events/*.jsonl`) 제외 화이트리스트 + **그 제외를 테스트로 고정**(사각지대 최소화).
- **승부처 = ②(자기 거짓완료 봉인 + 정직 공개)와 ①(탐지범위).** ③④⑤는 ①②가 풀려야 의미.
- **별개 갭:** `.vhk/.gitignore`에 `ops-prompt.md`·`sell-prompt.md` 누락(work/handoff/content/launch-prompt는 등록됨) — goal 76·77 산물, next-task ④와 동일.

## 산출물 색인

- [RFC 0056 §6 선결(#315) · 킬조건 #4](../rfc/0056-vhk-evidence-receipt.md) — 본 검증이 코드로 뒷받침
- 진입점: 이 파일
