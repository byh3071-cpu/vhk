# VHK 데이터 분석 — 3각도 (현재 데이터 / 수집 설계 / 분석별 입력)

> 작성: 2026-06-22 도그푸딩 후. 사용자 요청: ① 지금 있는 데이터로 가능한 분석 ② VHK가 수집해야 할 분석용 데이터 ③ 각 분석에 필요한 입력 데이터 명세 — **3개 전부**.
> SoT 보조: 결정별 needs = research-backlog §📥. 이 문서 = 데이터 관점 상세.

---

## Part 1 — 지금 실재하는 데이터 + 당장 가능한 분석

### 실데이터 인벤토리 (2026-06-22 직접 측정)
| 데이터셋 | 위치 | 현재량 | 필드 | 지금 가능한 분석 | 한계 |
|---|---|---|---|---|---|
| **recall-log** | `.vhk/recall-log.jsonl` | 토이 21 / 본체 6 | ts·source·query·hitIds·topScore | 적중율·topScore 분포·콜드 쿼리 군집 | **queryType 없음**(lexical/paraphrase) |
| **memory** | `.vhk/memory.json` | 토이 23(d14·f4·s5·p0) | id·content·tags·createdAt·status | 버킷·태그 분포·회상 풀 크기 | 본체 영속 불안정 |
| **eval 라벨** | `.vhk/eval/recall-eval.json` | 14 | query·expectIds | **Recall@5·MRR**(=71%) | queryType 없음·내 라벨 |
| **ledger** | `.vhk/ledger.jsonl` | 토이 5 / 본체 1 | version·date·status·sha·dirty | PASS율·이력 추세 | **dirty 항상 true**(#315) → 신선도 분석 오염 |
| **reports/latest** | `.vhk/reports/` | 1(최신만) | gates·summary·nextActions·commit | 게이트별 통과/실패 | latest만(이력은 ledger) |
| **ai-actions** | `.vhk/events/` | 본체 16 / 토이 0 | action·blocked | 차단율 | 표본 빈약 |
| **diff-cover 결과** | **없음 (콘솔만)** | 14회 측정 | — | — | **★미영속 — 파일로 안 남김. 분석하려면 재실행/수기추출** |
| **버그 코퍼스** | GitHub #313~#347 | 35건 | severity·label·surface·body | 심각도·표면·근본 군집 | gh api 페이지네이션 필요 |

### 실제로 돌려본 분석 (지금 데이터로 — 증명)
- **recall 적중율** = 81%(17/21). topScore min 1.84·median 5.09·max 10.04. **콜드 4개가 전부 의미격차 쿼리**("2D 그리드…이웃 타일", "건물 못 짓는 곳", "사람이 늘어나는 속도", "시민 만족도"). → 실패모드=어휘불일치 재확인. 단 **적중율(81%) ≠ Recall@5(71%)** — 적중율은 "아무 기억이나 떴나", Recall@5는 "정답 기억이 떴나". 적중율은 낙관 편향.
- **버그 분포**(부분, gh list 25건): high 3·med 11·low 11. 표면별·근본원인별 군집 가능.

**→ 지금 당장 분석 가능:** 버그 군집 · recall 적중/topScore · Recall@5 · PASS율.
**→ 지금 못 함:** diff-cover 추세(미영속) · 차단율(표본 빈약) · 자율성·진화(데이터 0).

---

## Part 2 — VHK가 수집해야 할 분석용 데이터 포인트 (텔레메트리 설계)

> VHK가 자기개선/제품분석을 하려면 무엇을 이벤트로 남겨야 하나. **로컬 우선·시크릿 0·옵트인**(SOUL 가드 + 프라이버시 테마).

| 이벤트 스트림 | 필드 | 답하는 분석 질문 | 현재 |
|---|---|---|---|
| **command-usage** | cmd·args해시·exitCode·durationMs·ts | 어떤 명령이 자주/느리/실패하나(채택·마찰) | ❌ 없음 |
| **recall-event** | query·hitIds·topScore·**queryType**·ts | 회상 품질·ML 필요성 | 있음(queryType 추가 필요) |
| **gate-result** | gate·pass·durationMs·ts | 게이트별 통과율·flaky | ledger에 일부 |
| **diff-cover-result** | branch·file·added·uncoveredLine·**uncoveredBranch**·ts | 미검증 변경 추세 | ❌ **미영속(콘솔만)** |
| **autonomy-run** | runId·goal·completed·interventions·hardStop·reviewRejected·ticks | 자율성 신뢰(D2 트리거) | ❌ 스키마 없음 |
| **evolve-event** | suggId·applied·rejectReason·ts | 진화 채택률·효과 | ❌ 없음 |
| **guard-event** | action·guard·triggered·bypassed·ts | 안전 집행률(HARD_STOP 우회 탐지) | ai-actions 일부 |
| **error-event** | cmd·errorType·nonTty·ts | 크래시·견고성(이번 #337류) | ❌ 없음 |
| **false-completion** | claim·evidence·verdict·ts | 거짓완료 적발(RFC0056 정체성) | ❌ 없음 |

**우선 신설 3개:** ① diff-cover-result 영속(가장 쉬움·즉효) ② autonomy-run(D2 막는 핵심) ③ command-usage(채택 분석 토대).

---

## Part 3 — 분석별 입력 데이터 명세 (스키마·필드·표본)

| 분석 | 입력 데이터셋 | 정확한 스키마 | 최소 표본 | 산출 | 선결 |
|---|---|---|---|---|---|
| **Recall@5 kill-gate** | recall-log + eval | `eval{query, expectIds[], queryType:'lexical'\|'paraphrase'}` | ≥30 라벨, paraphrase 비율 고정(예 40%) | Recall@5·MRR·유형별 분해 | queryType 필드 추가 + 오너 라벨 |
| **diff-cov 승격** | diff-cover-result | `{date,file,added,uncoveredLine,uncoveredBranch,classify:'real'\|'trivial'}` | ≥5 diff/며칠 | 과반>0 여부 + 라인vs분기 격차 | **결과 영속** + branch 측정 |
| **자율성 D2** | autonomy-run | `{runId,goal,completed:bool,interventions:int,hardStop:bool,reviewRejected:bool,ticks:int}` | 임계 정의 후 ≥N | 완주율·실패유형 | **스키마·임계 정의(미존재)** |
| **진화 효과** | evolve-event + gate-result | `{suggId,applied,rejectReason}` + 전후 위반수 | 며칠 | 채택률 + 사후 위반감소 | 측정 스키마 정의 |
| **차단율** | guard-event/ai-actions | `{action,guard,triggered,bypassed}` | 운영량↑ | 차단율·우회율 | 표본 + #335~338 우회 수정 |
| **명령 채택/마찰** | command-usage | `{cmd,exitCode,durationMs}` | 며칠 | 빈도·실패·느린 명령 | command-usage 신설 |

### 데이터 파이프 선결 (이거 먼저 안 하면 위 전부 무의미)
1. **(c) 영속·프라이버시** — 본체 memory.json 영속 보장 + recall-log gitignore(#331). 안 새고 안 증발하게.
2. **(a) 스키마 정의** — autonomy-run · evolve-event(측정대상 부재).
3. **스키마 보강** — recall에 `queryType` · diff-cover에 `branch`+영속 (세션 발견 결함 반영).
4. **(b) 오너 며칠 실사용** — 표본 누적. **사람만**.

---

_부록: 이 세션 도그푸딩이 (a)(b) 방법을 증명했고 스키마 결함(구성취약·라인커버한계·미영속)도 드러냄. 남은 건 본체에 파이프 깔기._
