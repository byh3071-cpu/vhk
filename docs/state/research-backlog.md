# 리서치 백로그 (research-backlog)

> 작성: 2026-06-22 · 출처: VHK 전 코퍼스 전수 조사(9-에이전트 워크플로, 후보 79건 → 28테마).
> 목적: VHK가 **다음 단계로 가려면 무엇을 조사·측정·실험·결정해야 하는지**의 SoT.
> 성격: 코드 구현 목록이 아니라 "답이 없어 막혀 있거나, 측정/조사/결정이 선결인 미해결 질문" 목록.
> 연동: docs/state/next-task.md(지금 무엇부터) · 각 RFC/goal(상세) · CLAUDE.md measure-first 원칙.

---

## 0. 한 줄 결론

리서치 28테마는 **한 뿌리** — "측정용 실데이터가 없다". **P0 한 개(데이터 누적 환경)가 나머지 측정 절반을 막는다.** 코드를 더 짜는 게 아니라 **며칠 vhk를 실사용해 데이터를 쌓는 루틴**이 최우선.

### ✅ 검증한 핵심 사실 (2026-06-22 디스크 + 실행 직접 확인)
- `.vhk/recall-log.jsonl` 처음엔 **없었으나** `vhk recall` 1회 실행 즉시 생성됨 → **회상 쓰면 실데이터 누적된다(증명)**.
- `memory.json` **디스크에 없음** — 그런데 `vhk memory list`는 **18개 회상**. 즉 매 실행 learnings.md에서 재마이그레이션(in-memory), **영구화 안 됨**(memory.ts:200 "v2 영구화 보류"). → 별도 견고성 발견.
- `vhk recall "리뷰 기준 추출"` → 1개 매칭(점수 3.17). **"회상 대상 없음"은 틀린 전제** — 회상 자체는 작동.
- `eval/recall-eval.json` **없음** → Recall@5 산출 불가(라벨셋 부재).
- `vhk stats` → 차단율 **0.0%(0/8)** 실수치 출력 · 증거원장 1 PASS. → **goal 61 blocker 해소 가능**(더는 "데이터 없음" 아님).
- `vhk diff-cover` → "변경 기능소스 없음 — 측정 대상 없음"(src 변경 시에만 측정).
- **next-task.md:21 "실쿼리 3개 누적" = recall-log 부재였으므로 불일치** → 정정 대상.

→ 진짜 블로커는 "회상 대상이 없다"가 아니라 ① recall-log·eval 라벨이 안 쌓였고 ② memory가 영구화 안 됨. measure-first 3트랙이 **동시에** 막힌 이유. RFC 0049 §4 SPOF의 실현.

### 📊 1차 실측 결과 (2026-06-22 도그푸딩 — 토이 프로젝트 minisim-city)
> 가짜 데이터 금지 원칙 하에, 토이 프로젝트(`vhk-dogfood-lab`)에 진짜 심시티 엔진을 7 이터 개발하며 vhk를 실사용 → 데이터 부산물 수집. 상세 = [docs/log/2026-06-22-dogfood-measure-first.md](../log/2026-06-22-dogfood-measure-first.md).

| 트랙 | 1차 실측 | 해석 |
|---|---|---|
| **Recall@5** | **★구성의존: 10라벨=60%(ml-signal) → 14라벨=71%(sufficient)로 뒤집힘** | 어휘정렬 쿼리 추가(패러프레이즈 희석)만으로 kill-gate 판정 역전. **평면 0.7 임계는 쿼리분포 통제 없이 노이즈.** 강건신호=실패모드(어휘치환 4/4 일관실패), 집계% 아님. → 임계를 "쿼리분포 명세" or "패러프레이즈-recall 분리"로 정밀화 필요 |
| **diff-coverage** | **3/10 샘플 >0 (30%)** | RFC 0050 §5 승격 임계(과반) 미달. ★diff-cover는 라인커버라 "실행 안 된 멀티줄 블록"만 잡고 단일줄 미탑분기는 못 봄 → 실 갭 과소계상 |
| **자율성** | **7/7 무인 완주·게이트 green** | 자문형 무인성 입증. 형식 완주율은 goal99 스키마+로드맵 Wave A/C(`docs/roadmap/autonomy-evolution.md`, 임계 complete≥5) — 표본 누적 중(#373 OPEN) |

**도그푸딩 발견 vhk 버그:** ① `vhk recall "...어떻게..."` → NLP 라우터가 status로 오라우팅(결정적, 트리거="어떻게") = D4 실증 ② recall-log.jsonl이 gitignore 누락 → 쿼리 원문 git 노출(프라이버시 테마 실증).

---

## 1. 🔴 P0 — 지금 즉시 (사람만 가능)

| 테마 | 핵심 질문 | 첫 행동 | 근거 |
|---|---|---|---|
| **측정 데이터 누적 환경 부재** | 백업에 데이터 있나 / 어느 머신을 "측정 SoT"로 며칠 굴리나 / 유의미 표본 빈도는 | `vhk memory export`·`.vhk` 백업 확인 → 없으면 "오늘부터 이 머신에서 며칠간 일상작업에 `vhk recall`/`diff-cover` 쓴다" 선언 + RFC 0049 §4 export 백업 습관화 + next-task.md 정정 | next-task.md:18·21 · RFC 0049:69 · `.vhk/`(실측) |

> 비대화형 AI 세션은 이 데이터를 못 만든다 — **모든 P1 측정의 선결.**

---

## 2. 🟠 P1 — 데이터 쌓이면 풀리는 6건

| 테마 | 종류 | 핵심 질문 | 막힌 이유 | 근거 |
|---|---|---|---|---|
| **Recall@5 실측** (ML 도입 Kill-gate) | 측정 | 사용자 실쿼리 Recall@5가 <0.7 반복인가(ML 정당) ≥0.7인가(키워드 충분, 영구보류) | `vhk memory eval --init` 대화형 라벨링(사람만) + 실쿼리 누적 선결 | RFC 0049:46·91 · dogfood-audit:51 |
| **diff-coverage 실측** (review.ts 사각지대) | 측정 | 실작업 diff ≥5건에서 "테스트 green인데 새 로직 미검증 라인"이 과반 >0인가 ≈0인가 | 실작업 코드 diff ≥5건 누적 필요(합성·소급 배치 금지) | RFC 0050:58·62 · review.ts:39 · goal 50 |
| ~~**vhk-auto 자율성 측정 프로토콜**~~ | 자율성 | ~~완주율·개입횟수·실패유형을 무엇으로 수치화? D2 첫 트리거~~ | 해소(2026-07-04): goal 99(#453)가 autonomy-run 로깅 스키마 정의 — 잔여는 실구동 표본 누적(#373 OPEN) | RFC 0054:59·62 · goal 99 |
| ~~**진화 루프 효과 측정**~~ | 측정 | ~~evolve/memory가 실제로 다음 세션 품질을 올리나(채택률·재발감소)~~ | 해소(2026-07-04): goal 97(#451)이 evolve-log·채택률 스키마 정의(`stats.ts` calcAdoptionStats) — 잔여는 실사용 누적 | RFC 0054 · goal 97 |
| **검증 집행력 갭(D5)** | 결정 | check 자동규칙 2개·mission scope 무제한을 어디까지 코드강제? (정규식 92% 형태검증) | 도그푸딩 핵심통찰 "약점=설계 아닌 집행 갭". measure-first로 갱신 누수 관측 선결 | dogfood-audit:54 · RFC 0053:40 · goal 53 |
| **공급망·발행 보안** | 외부 | npm provenance·audit·의존성 신뢰 게이트를 어떻게 세우나 | SOUL "공급망 리스크 금지"인데 집행 도구 0. **트리거 없이 지금 조사 가능** | SOUL · package.json · RFC 0054 |

---

## 3. 🟡 P2 — 두 갈래

### (A) 트리거 없이 지금 외부조사 가능
| 테마 | 종류 | 첫 행동 |
|---|---|---|
| 경쟁/포지셔닝 검증(rulesync·vooster·vspec) | 외부 | 경쟁 도구 현 기능·스펙 외부조사 → 차별화 주장·frontmatter 호환 제약 재확인 |
| cost 가드 요율표 최신성 | 외부 | claude-api 스킬로 모델 ID·가격·컨텍스트 검증 → 참조표 |
| MCP 35 tools 타 클라이언트 호환 | 외부 | Cursor·Cline 등에서 연결→발견→호출 e2e 1회 실측 |
| CLI 출력 접근성(NO_COLOR·색약·스크린리더) | 품질 | `NO_COLOR=1 vhk verify`·비TTY 파이프 1회 실측 |
| 프롬프트-커맨드 대조(에이전트 의도↔실행 명령 검증) | 아이디어 | goal 87(mission↔변경파일 대조)과의 차별점 정의 → 실현성·LLM-0 원칙 부합 조사. ※ 외부 서술(블로그)이 "도입 검토 목록 등재"를 선(先)주장 — 실제 등재는 2026-07-13 이 행이 최초(정직 소급) |
| `.vhk` 런타임 로그 프라이버시 | 품질 | 로그 4종 필드 인벤토리 + 쿼리원문·diff 민감정보 혼입 평가 |
| 신규 사용자 온보딩(명령 50+개 압도감) | 결정 | gh·vite의 progressive disclosure 외부조사 → 옵션 3안 |

### (B) 트리거/선결 대기 — 지금 손대면 안 됨
| 테마 | 종류 | 대기 조건 |
|---|---|---|
| 실행력 D2 발동 결정 | 결정 | 자율성 측정 + 실병목 측정 + 오너 명시 결정 3트리거 |
| 외부 SEO/분석 API 설계 + 안전 아키텍처(kill switch·dry-run) | 외부 | D2 발동 후 전 트랙 통째 |
| bge-m3 2차 ML 런타임 검증 | 외부 | Recall@5 게이트 열린 뒤 |
| RFC 0001 #38 .vhk 규격 4개 미해결 질문 | 결정 | 결정 토론(드리프트L2·폴더화·cloud충돌·외부계약) |
| goal 73 check --evals(LLM-judge) — **카드 부재** | 결정 | L1 안착 + LLM-judge 방법론 조사 + golden-set |
| goal 49/52 카드 재조정 | 결정 | 도입 PR 선점으로 범위 드리프트 — 즉시 정리 가능 |
| goal 79 verify 환경분리(@env/pool) | 품질 | 로컬 빨강 DX 비용 누적 관측 → YAGNI 종료 판정 |
| goal 62 docs-diff | 품질 | 포맷·트리거 ADR + 도그푸딩 1회 효용 실증 |
| goal 83 보안 scan allowlist | 결정 | 픽스처 강등 메커니즘 설계(진짜 유출 미차폐) |
| 회상 점수 임계·가중치(JIT) 튜닝 | 측정 | recall 데이터 누적(P0와 동일 파이프) |
| 콜드스타트 잔여 ~297ms ROI | 측정 | tsup splitting 프로토타입 1회 실측 → RFC 0047 좀비 종결 |
| MCP↔CLI 단일진실원 잔여 표면 감사 | 품질 | MCP 35 tool 위임 vs 인라인 전수 분류(즉시 가능) |

### 단발 측정 (AI 지금 1회 가능)
| 테마 | 행동 |
|---|---|
| goal 65 pre-commit L2 | `git log --diff-filter=AM -- src scripts`로 기록우회 실측 1회 → 발견 시에만 착수 |
| goal 61 차단율 | `vhk stats`로 차단율 실수치 나오는지 확인 → 나오면 blocker 취소선 |

---

## 4. 우선순위 원칙 (요약)

1. **measure-first** — 데이터로 풀 수 있고 다른 결정을 막는 것이 P0.
2. **AI 독주 방지** — 한 번에 다 하지 않음, 각 테마 개별 PR.
3. **합성은 함정** — 측정 데이터는 실작업/실쿼리에서만. 가짜·소급·일괄 표본 금지(RFC 0049·0050).
4. **자율성·진화 먼저, 실행력은 단계적** — RFC 0054 §4.

---

## 📥 VHK가 필요로 하는 데이터 (수집 명세 · 2026-06-22 도그푸딩 후 정제)

> 도그푸딩으로 **방법은 검증**됐으나(토이 프로젝트), **확정 데이터는 오너 실사용**이 선결. 아래는 "어떤 분석에 어떤 데이터가, 어떤 형태로, 얼마나 필요한가"의 명세.

### 0. 데이터 갭 3종 (먼저 분류)
- **(a) 스키마 미정의** — 측정 대상 자체가 없음 → **정의가 선결**: 자율성 완주율·진화 효과.
- **(b) 수집 부족** — 스키마 있고 도구 작동하나 표본 0~소량: recall 실쿼리·diff 실작업·ai-actions.
- **(c) 영속 차단** — vhk **본체 레포 memory.json 미영속**(in-memory 재마이그레이션) + recall-log gitignore 누락 → **데이터가 안 쌓이거나 증발/노출**. **이거 먼저 안 고치면 (b) 수집이 무의미**.

### 1. 결정별 필요 데이터
| 막힌 결정 | 필요 데이터 | 스키마/필드 | 표본 | 수집법 | 현재 | 갭 |
|---|---|---|---|---|---|---|
| **Recall@5 ML 도입**(RFC0049) | 오너 실쿼리 + 정답라벨 **+ 쿼리유형** | `recall-log{query,hitIds,topScore,ts}` + `eval{query,expectIds}` **+ 신규 `queryType: lexical\|paraphrase`** | ≥30 라벨, 패러프레이즈 비율 고정 | 며칠 `vhk recall` 실사용 → `memory eval --init` | 토이 60→71%(구성취약) | b + **스키마에 queryType 추가**(세션 발견: 구성이 verdict 좌우) |
| **diff-cov 게이트 승격**(RFC0050) | 실작업 diff별 미검증 라인 **+ 분기커버** | PR별 `{date,files,added,uncoveredLine,uncoveredBranch,classify}` | ≥5 diff, 며칠 분산 | 본체 작업 PR마다 `test --coverage`→`diff-cover` | 토이 3/10(라인만) | b + **branch-cov 추가**(세션: 라인커버는 단일줄 분기 과소계상) |
| **자율성→실행력 D2**(RFC0054) | vhk-auto 1회전 결과 | `autonomy-run{runId,goal,completed,interventions,hardStop,reviewRejected,ticks}` | ≥N회(임계 미정) | /vhk-auto 실구동 로그 | 스키마 有(goal 99, 2026-07-04)·표본 0 | b — 실구동 누적(임계는 미정) |
| **"진화 먼저" 전제**(RFC0054§4) | evolve 채택률 + 사후 위반감소 | `evolve-log{suggId,applied,rejectReason}` + 전후 `check` 위반수 | 며칠 누적 | evolve 실사용 + 위반 추세 | **0(측정 없음)** | a + b |
| **JIT 경고 임계 튜닝** | 위험행동별 경보/오경보 | recall-log 재사용 + `{action,alerted,wasFalseAlarm}` | 위험행동 다수 | recall 데이터 파이프 공유 | 0 | b(Recall과 동일 파이프) |
| **AI 차단율**(goal61) | guarded 행동 결과 | `ai-actions.jsonl{action,blocked}` | 더 많은 운영량 | 평소 운영 누적 | 8줄(0/8) | b(표본 빈약) |
| **거짓완료 탐지**(RFC0056 receipt) | 거짓완료 사건 1건+ | `{claim,evidence,verdict:false-complete}` | 90일 1건 적발 | receipt MVP + 실작업 | receipt 구현됨(goal 86 DONE)·적발 표본 0 | b(90일 측정 개시 대기) |

### 2. 한 줄 요약 — 지금 "데이터분석"을 막는 진짜 순서
1. **(c) 영속 고치기** — 본체 memory.json 미영속 + recall-log gitignore. 안 고치면 뭘 쌓아도 샌다.
2. ~~**(a) 스키마 2개 정의** — 자율성 완주율·진화 효과(측정 대상이 아예 없음).~~ 해소(2026-07-04): goal 99(#453)·goal 97(#451).
3. ~~**스키마 보강 2개** — recall에 `queryType`, diff-cov에 `branch` (세션이 발견한 결함 반영).~~ 해소(2026-07-04): goal 98(#452).
4. **(b) 오너 실사용 며칠** — recall·diff·ai-actions 표본 누적. **이건 사람만**.

→ **핵심: 데이터분석 이전에 "데이터가 쌓이고·정의되고·안 새는" 파이프부터.** 토이 도그푸딩이 (a)(b) 방법은 증명했고, 결함(구성취약·라인커버한계·영속버그)도 드러냄. 남은 건 본체에 파이프 깔고 오너가 며칠 굴리는 것.

---

_갱신 규칙: 테마가 해소되면 취소선 + 해소 근거(PR·측정값) 1줄. 새 미해결 질문은 종류·우선순위 달아 추가._

---

## 추가 (2026-07-27) — 자율형 에이전트 딥리서치 후속 항목

> 출처: yohan-brain `docs/yohanthinking/research/2026-07-27--vhk-autonomous-agent-deepresearch.md` (PR yohan-brain#143, 7축·127인용 전수검증). 결정 6개 판정표 + 적용 제안 보완 9(B1~B9)·강화 8(S1~S8) + 감시 목록 W1~W10.

| 테마 | 종류 | 우선순위 | 요지 |
|---|---|---|---|
| complete 정의 3중화 + 롤링 강등 | 결정→구현 | P1 | complete = verify green+receipt 유효+interventions=0만 집계, 최근 10회 중 3실패 강등, taskType 분리 (B1·B2) |
| 병목 계측 3종 | 측정 | P1 | autonomy-log에 사람 대기시간·기계적 승인 비율·추적 시간 — 4주 실측 후 D2 조건(b) 판정 (B3) |
| evolve 42건 청산 + 인라인 전환 | 결정→구현 | P1 | 큐 소비 아닌 배치 청산, 신규는 인라인 1클릭+TTL. 자동적용 금지 (B4·B5) |
| auto-merge 6중 게이트 | 구현 | P2 | +코드 삭제 PR 유보 +체크 SHA 진위 재검증, 적대리뷰 "지적 0" 카나리아 (B6·B7·B9) |
| overnight 비용 서킷브레이커 | 구현 | P2 | 세션 예산+15분 무진전+동일호출 3~5연속 정지, 폐기 런 비용 가시화 (B8) |
| `vhk auto` 설계(승급 다이얼·티어 레인) | 설계 | P2 | 외부 집행 아닌 승급 계측·게이트 관리 먼저. 상한 = PR까지 (결정 5) |
| 감시 목록 W1~W10 분기 점검 | 조사 | P3 | MS AGT·Haystack·agentops·영수증 스펙(IETF/AgentBoundary)·OTel 1.0 — 재조사 트리거. 유효기간 2026-10-27 |
