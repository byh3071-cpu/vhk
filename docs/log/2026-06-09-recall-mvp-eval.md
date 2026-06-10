# 2026-06-09 — 기억 회상(recall) MVP + 검증 하네스 + 실측 (RFC 0049)

> append-only dev log. 추가만, 수정·삭제 금지.

## 한 일 (PR 2건, 전부 main 머지)

| 내용 | PR | 머지 커밋 |
| --- | --- | --- |
| recall MVP — `vhk recall` 키워드 회상 + just-in-time 경고(resolveGuard 훅) | #232 | 6640df0 |
| 검증 하네스 — 사용 로그 + `vhk memory eval [--init]`(Recall@5/MRR + Kill-gate) | #233 | d8047f0 |

- 각 PR: TDD(red→green) → build·typecheck·전체 테스트 green → 실제 CLI 스모크 → CI(windows/ubuntu 22·24 + dogfood 양쪽 + CodeQL) green → squash 머지.
- 신규 테스트: #232 20개(recall 16 + jit 4), #233 11개(recall-log 5 + recall-eval 6). 전체 1316 → 1327.
- RFC 0049 작성(`docs/rfc/0049-memory-recall-mvp.md`).

## 배경 — 왜 이걸 했나 (긴 설계 세션의 착지)

전략 논의("VHK 6개월 churn 생존·포지셔닝") → "AI는 손, VHK는 기억" 정체성 → 기억 레이어를 공학으로(임베딩/벡터DB/ACT-R 이론) → **다중관점 적대검토(카파시·Linus·Thiel·Hickey·Norman)** → 측정 결과 N=18(기억 18개)이라 **경로 B(키워드 우선·ML 없음, measure-first)** 채택. (상세: 노션 코파일럿 DB 분석 3건.)

## 핵심 결정

- **Kill-gate**: `eval Recall@5 < 0.7` 누적 측정 전까지 임베딩·벡터DB·ML 도입 금지(RFC 0049에 박음). 조기최적화 차단.
- **SoT/인덱스 분리**: memory.json=진실(기존 안전장치 재활용), 검색 인덱스는 재구축 가능 파생. N 작아 벡터DB 불필요 — 순수 JS면 충분(카파시).
- **점수식**: 키워드 IDF overlap + 태그 가중 + 약한 최근성, status 강등. **4신호 분리**(한 숫자로 안 땋음·Hickey). 유령매칭 방지(관련성 0이면 최근성 무효 — TDD가 잡은 버그).
- **just-in-time**: `resolveGuard` 단일 chokepoint 훅, precision≫recall(약매칭 침묵·Norman).
- **2차 ML 결정 잠금**(실측이 정당화하면 부활): bge-m3(한국어), ACT-R 풀, 구조화+상황키, 번복 플래그, 연결후보+복리(accept/reject 플라이휠), 첫실행 다운로드, Claude가 구조화. (노션 page 2 토글.)

## 실측 (eval 직접 돌림 — 도그푸딩)

13개 영문섞인 쿼리 → **Recall@5 92%·MRR 0.88**. 너무 쉬웠음(영문 식별자 흘림).
18개 **순수 한국어 쿼리** → **Recall@5 56%·MRR 0.56 (< 70 Kill-gate 신호)**. 재현·독립검증·검산 완료(조작 아님).

- **미스 8개 = 한 패턴**: 한국어 쿼리 ↔ 영문/동의어 기억 불일치(윈도우↔Windows, 시간초과↔timeout, 머리말↔frontmatter, 형변환↔캐스팅, 박아넣다↔하드코딩, 노션↔Notion). **= multilingual 임베딩이 푸는 어휘격차.**
- 오탐 체크: 없는 주제 2건 → 둘 다 침묵(precision 정상).
- **결론 정정**: 앞선 "ML 불필요(92%)"는 성급. 현실 말투 56% → **Kill-gate 살아있음, ML 조건부 정당.** 단 여전히 합성 쿼리(내가 작성) — 최종 심판은 사용자 실쿼리(`vhk memory eval --init`).

## 교훈

- **측정 방식이 결론을 뒤집는다** — 쉬운 쿼리(92%)와 현실 쿼리(56%)가 다른 결론. 장밋빛 수 믿으면 거짓완료. 측정은 깐깐한 각도로.
- **"빌드"≠"검증"** — recall MVP 한 사이클은 도구 완성일 뿐, 검증은 실사용 반복. 1~2 사이클로 판단 금지.
- **measure-first가 보상받음** — 추측 아니라 숫자(56/92)로 ML 필요성 판정.

## 다음 우선순위

1. **제안 3 diff-aware 검증**(최우선·측정블로커 0): git diff↔coverage 교차 TIA로 "이번 변경 테스트 커버" 게이트. review.ts 자백한 거짓완료 80% 구멍 메움. ML0·결정적. recall처럼 설계→TDD→PR.
2. **recall 실측**: 며칠 `vhk recall` 실사용 → `--init` 실쿼리 라벨 → 진짜 Recall@5. <70 반복이면 2차 ML(bge-m3, 결정 잠금됨).
3. **제안 2 결정그래프 = 보류**(decisions=0 — 그래프 그릴 결정 없음).

---

## 후속 (2026-06-10) — eval 재현 + 기억 N 증가 robustness

> measure-first 점검(diff-coverage §5 실측과 같은 세션). recall eval을 **현재 기억 상태로 재실행**해 6/9 수치 재현성·N 증가 영향 확인.

- **기억 N: 18 → 34** (failures 18 그대로 + patterns 13 + decisions 2 + successes 1). 6/9엔 failures 18뿐이었음.
- **`vhk memory eval` 재실행 → Recall@5 56% · MRR 0.56 — 6/9과 정확히 동일.** 10/18 hit(전부 rank 1), 8/18 miss.
- **= N 16개 증가에 robust**: 신규 patterns/decisions/successes가 정답 failure를 top-5에서 밀어내지 않음(키워드+태그 점수가 관련 실패를 안정적으로 1위 유지). full-scan 키워드가 N=34에서도 흔들림 없음.
- **미스 8건 = 6/9과 동일 단일 패턴** — KR↔EN/동의어 어휘격차(윈도우↔Windows·박아넣다↔hardcode·시간초과↔timeout·머리말↔frontmatter·형변환↔cast·바이너리·자연어 라우터·도구 등록). multilingual 임베딩 영역.

### 정직한 한계 (§5 미충족 — 사람 게이트)

- eval set(`.vhk/eval/recall-eval.json` 18라벨)·recall-log(5쿼리) **둘 다 6/9 합성 그대로 · 신규 실사용 0**. 재현은 측정 안정성만 입증, **합성 단계 못 벗어남**.
- §5 최종 판정 = **사용자 실쿼리**(`vhk recall` 며칠 실사용 → `vhk memory eval --init` 라벨링). AI가 쿼리를 더 지어내면 또 합성(6/9이 명시한 함정) → **안 함**.
- **잠정 종합**: 합성 56% 안정·미스 단일패턴(어휘격차) → Kill-gate 신호 일관. ML(multilingual 임베딩) **조건부 정당**하나, *실쿼리 Recall@5 <70 반복* 확인 전까지 도입 보류(RFC 0049 §3 Kill-gate 유지).

### measure-first 2종 종합 (diff-coverage + recall)

- **diff-coverage(RFC 0050 §5)**: 실로직 미검증 2/5(명령부 국한) → 승격 임계 미달. 차단 대신 advisory 경고형으로 좁힘(PR2).
- **recall(RFC 0049 §5)**: 합성 56% 안정, 실쿼리 대기. ML 조건부 정당·도입 보류.
- **공통 결론**: 둘 다 "구멍 실재하나 임계 미달/실사용 미축적" → **무리한 승격/ML 도입 안 함**. 각자 실사용 데이터 더 모은 뒤 재판정. measure-first가 또 조기 결정을 막음.
