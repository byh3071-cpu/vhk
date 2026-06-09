# RFC 0049 — 기억 회상 MVP (키워드 우선·진통제 우선, ML 없음)

> 상태: Draft · 작성: 2026-06-09 · 출처: VHK 정체성·기억 레이어 설계 세션(2026-06-09, 다중 관점 적대 검토 + 레포 실측)
> 목적: "VHK = AI가 일하는 동안 사람의 의도·결정·기억을 시간 너머로 보존하는 레이어" 정체성을, **측정 가능한 최소 단위(MVP)**로 착지. 임베딩·벡터DB·ACT-R는 측정이 정당화할 때까지 의도적으로 연기.
> 연동: 실행 단위 = `goals/<n>`(추후). 데이터 = `.vhk/memory.json`(SoT, 그대로). 훅 = `src/lib/risk-policy.ts:resolveGuard`.

---

## §0. 한 줄 결론

기억 N=18(실측). **임베딩·벡터DB·bge-m3는 18개에 과설계다.** 키워드 회상 + 위험행동 직전 자동 경고(진통제)부터 만들고, ML은 "키워드가 부족함"을 eval로 증명한 뒤에만 얹는다.

---

## §1. 동기 (실측)

- `.vhk/memory.json` 현재 **총 18개**(failure 18 · pattern 13 · decision/success 0 · 평균 163자). *(2026-06-09 집계)*
- N=18에 임베딩·sqlite-vec·bge-m3(수백MB~2GB) 도입 = 과설계. 카파시("측정 전 ML 금지")·Linus("자료구조 먼저")·안티레즈("한 기능 검증 후 확장") 합의.
- **진짜 결함은 검색 정확도가 아니라 회상률 0** — 18개를 쌓기만 하고 안 꺼내 씀(`vhk memory list`는 전체 나열일 뿐 상황 회상 아님).
- 핵심 가치(진통제) = 되돌리기 어려운 행동 직전 "이 실패 또 하지 마"를 기계가 자동으로 띄움.

## §2. 적대 검토에서 도출된 원칙 (다중 관점)

| 관점 | 적용 |
|------|------|
| **카파시** (측정·단순) | N 측정 → 키워드부터. eval 없이 모델 선택 금지. ML은 kill-criteria 통과 후만. |
| **Linus** (자료구조·데이터 안전) | 진실=memory.json 그대로(기존 안전장치 재활용). 인덱스는 파생·버려도 됨. SoT가 로컬전용 SPOF인 점을 export로 완화. |
| **Peter Thiel** (해자·진통제) | 검색은 commodity. 해자=축적되는 사용 로그(미래 복리 씨앗). 바이타민(recall)보다 진통제(just-in-time)를 1순위. |
| **Rich Hickey** (Simple≠Easy) | 점수를 한 숫자로 땋지 말 것 — 신호 분리·투명·디버그 가능. |
| **Don Norman** (UX) | 오경보가 침묵보다 나쁨. precision ≫ recall. 약매칭은 침묵. |

## §3. 범위

### IN (이번 MVP)
1. **키워드 recall** — 순수 JS, 의존성 0
2. **just-in-time 경고** — `resolveGuard()` 훅 (진통제, 1순위)
3. **eval 하네스** — 키워드 충분성 측정 + ML 도입 kill-criteria
4. **내구성** — memory.json SPOF 완화: sanitized export

### OUT (측정 후 2차 — 폐기 아님, 연기)
- 임베딩 · bge-m3 · Transformers.js · sqlite-vec · 벡터검색 · flat 코사인
- ACT-R 풀(접근강화·연결성 그래프) · 결정 계보 bi-temporal 그래프
- 구조화 스키마 v3(상황·결정·이유·결과 필드)

### Kill-gate (조기최적화 차단을 문서에 박음)
> **eval Recall@5 < 0.7 (또는 실사용 "안 떠오름" 반복)을 측정하기 전까지 임베딩·벡터·ML 도입 금지.**
> 미래의 구현자(사람·AI)가 측정 없이 벡터DB를 다시 끌어오는 것을 이 줄이 막는다.

## §4. 설계

### ① 키워드 recall (순수 JS, 의존성 0)
- N≤수백 → full-scan 무방. 토큰 overlap + **tag 가중**(태그 정확매치 점수↑).
- 신규 순수함수 `recallMemories(mem, query, k): Hit[]` (memory.ts).
- **4신호 분리(Hickey):** 결과에 `{keyword, tagMatch, recency, status}`를 각각 노출 — 한 숫자로 합치지 않음(왜 떠올랐는지 설명 가능).
- status 반영: `archived`/`resolved`는 **강등**(제외 아님). 번복 항목은 `[번복됨 → 최신]` 플래그(append-only 정합).
- 한국어 토큰화 = 공백 분리 + 소문자/조사 단순 정규화(결정적, 라이브러리 0).

### ② just-in-time 경고 (진통제 · 핵심)
- **훅 지점:** `resolveGuard(action, mode, channel)` ([risk-policy.ts:60](../../src/lib/risk-policy.ts#L60))가 `confirm`/`preview`/`warn`을 반환할 때 **그 직전**, `action`(undo/deploy/publish/migrate/cloud-pull/resume/env-write/delete/restore)을 쿼리로 recall.
- 예: `publish` 직전 → tag/lesson에 publish 관련 과거 실패가 있으면 팝("⚠️ 과거: …").
- **precision ≫ recall(Norman):** 점수 임계값 높게. 약매칭=침묵. 오경보=신뢰 즉사이므로 기본은 침묵.
- 빈도제한: 동일 경고 세션당 1회. 채널 cli/mcp/nl 공통.

### ③ eval 하네스
- 라벨 20쌍(쿼리 → 기대 기억 id). 신규 `vhk memory eval`.
- 메트릭: Recall@5 · MRR. 출력에 kill-criteria 대비 현재 점수 표시.
- N=18인 현재는 거의 전수 검토 수준이나, N이 늘면 ML 도입 판단의 객관 근거가 됨.

### ④ 내구성 (Linus 지적 — SPOF 완화)
- 문제: `.vhk/memory.json`은 gitignore·로컬전용 → 디스크 장애 시 기억 전손.
- MVP: `vhk memory export` — **secret-scan(scan-secrets) 통과본**만 백업/공유 가능 파일로. 기존 `.bak`/`.v1.bak` 유지.
- git 커밋·클라우드 동기화는 secret 위험으로 OUT(2차 opt-in).

## §5. 데이터 모델
- **신규 필드 0.** 기존 `{content, lesson, why, tags, status, createdAt}` 재사용.
- 진실 = `memory.json` 그대로(원자적 쓰기·`.bak`·손상가드·멱등 마이그레이션 전부 유지).
- **인덱스·DB 불필요**(N 작음, full-scan이 <10ms).
- 구조화(상황·결정·이유·결과)는 **선택적 보강**(호출자=Claude가 채우면 좋고, raw 항상 작동) — 2차.

## §6. 확정 결정 반영 (설계 세션 산출)
- D5 번복 플래그 · D7 저장/export 전 secret scan · D12 raw 항상(구조화 선택) · D19 status 강등
- Hickey(4신호 분리) · Norman(precision 우선·기본 침묵) · Thiel(recall/경고 사용 로그 = 미래 복리 데이터 씨앗)

## §7. 수용 기준
- recall: 18개에서 쿼리 → 관련 실패 top-k 반환, <10ms.
- just-in-time: publish/deploy 직전 관련 과거 실패 표시(있으면) · 없으면 침묵.
- eval: Recall@5 측정값 + kill-criteria 대비 출력.
- export: secret-scan 통과한 백업본 생성.
- **의존성 추가 0.** 공통 게이트(build·test) 통과 · 회귀 0.

## §8. 다음 (2차 — 측정이 정당화할 때만)
eval이 키워드 부족을 증명하면: Transformers.js **WASM**(네이티브 컴파일 0) + multilingual-MiniLM 번들 폴백, **flat 임베딩 파일 + 순수 JS 코사인**(벡터DB 없이) → 이후 ACT-R(접근강화·연결성)·결정 계보 그래프. **측정 없이는 진행 금지(§3 Kill-gate).**

---

> 참고: 본 RFC의 상위 전략 맥락(VHK 정체성 = "AI는 손, VHK는 기억" / 도구중립 거짓완료 가드레일 / 6개월 churn 생존)은 코파일럿 세션 분석 페이지(2026-06-09)에 기록됨.
