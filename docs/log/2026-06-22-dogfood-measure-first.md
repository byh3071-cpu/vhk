# 2026-06-22 — 도그푸딩으로 measure-first 실데이터 추출 (미니 심시티)

> 성격: append-only dev log. VHK를 **실 사용자로 직접 써서** measure-first 3트랙(diff-cover·Recall@5·자율성)의 실데이터를 뽑은 세션.
> 대상 토이 프로젝트: `c:\Users\Public\dev\yohan-ecosystem\vhk-dogfood-lab` (minisim-city — 순수 TS 심시티 엔진 + vitest + 캔버스 뷰).
> 방법: 실작업 = 가짜 데이터 양산 금지(RFC 0049·0050 "합성 함정"). 토이 프로젝트에 진짜 기능을 7 이터레이션 개발하며 vhk를 진짜로 사용 → 데이터가 부산물로 발생.

## 한 줄 결론

가짜 데이터 없이 **진짜 도그푸딩**으로 measure-first 3트랙 1차 실데이터 확보 + **vhk 버그 2건** 발견. **Recall@5=60%(ml-signal 발동)**, **diff-cover 2/7 샘플 >0**, **자율 7/7 이터 무인 완주**.

## 산출 데이터 (1차, 1세션)

### 1. diff-coverage — 7 샘플
| 이터 | 모듈 | 미검증/추가 | 비고 |
|---|---|---|---|
| 1 | grid | **2/35 (94%)** | createGrid 에러 throw(별도 블록줄) → 포착 |
| 2 | zone | 0/? | clearZone 경계가드는 단일줄 → 라인커버 처리 |
| 3 | population | 0 | 충실 테스트 |
| 4 | economy | 0 | budgetWarning 경고문 미테스트했으나 단일줄이라 라인커버 처리(미포착) |
| 5 | power | 0 | 충실 테스트 |
| 6 | simulate | **5/29 (83%)** | gameOver 멀티줄 블록 미실행 → 포착(라인 37·39-42) |
| 7 | render+graph | 0 | 100% 커버 |

→ **2/7(29%) 샘플에서 미검증>0.** RFC 0050 §5 승격 임계 "과반(≥3/5)" **미달**. 단 1세션·내 코딩스타일(테스트 충실)이라 방향성 신호.

**★ 정밀 발견:** diff-cover는 **라인 커버리지** 기반 → "한 번도 실행 안 된 라인(멀티줄 블록 본문)"만 잡고, **테스트된 줄 안의 미탑 분기(단일줄 `if(x) return`)는 구조적으로 못 본다.** iter2·4가 "갭을 남겼는데도 0"인 이유. → review.ts:40 PR2 설계 시 "미검증 변경분"이 **실제 테스트 갭을 과소계상**함을 전제해야.

### 2. Recall@5 — eval 10라벨
`vhk memory eval` → **Recall@5 60% · MRR 0.53 · verdict=ml-signal(<70%)**.
- 공유어휘 7쿼리: 6 적중(1개 미스 — "이웃 타일"≠`neighbors4`, "인덱싱"≠`idx` 동일도메인 어휘 불일치)
- 의미격차 3쿼리: **0/3 전멸** ("사람↔인구", "망하다↔파산", "건물 못 짓다↔구역 지정 불가")
- **해석:** 어휘정렬 쿼리만 보면 86%(충분), 패러프레이즈 섞으면 60%(ml-signal). **실 kill-gate는 "오너 실쿼리 중 패러프레이즈 비율"에 달림.** 다국어 임베딩(bge-m3) 정당성의 살아있는 신호지만, 1셋·도그푸딩 운영자(나) 라벨이라 "확정" 아닌 1차.

### 3. 자율성 — 7/7 무인 완주
7 이터(엔진6+뷰1) 전부 사람 개입 0·HARD_STOP 0으로 완주. 게이트 전부 green(`vhk verify` PASS 4/4: tsc·test·build·secure scan, 27 테스트). 자기진단 1건(diff-cover untracked 함정 스스로 우회). → "AI가 자문형 dev 루프를 무인 완주"는 입증. 단 **형식 vhk-auto 스킬런(goal 카드 N회 완주율)은 아님** — RFC 0054 자율성 측정 프로토콜(완주율 표본 N·임계)이 여전히 미정의(research-backlog P1 유지).

## 발견한 vhk 버그/이슈

### BUG-1 (P1~P2) — `vhk recall "...어떻게..."` NLP 라우터 오라우팅
- **증상:** `vhk recall "격자에서 경계 밖 좌표를 어떻게 안전하게 처리하나"` → recall 아닌 **`vhk status`로 실행**됨.
- **재현:** 결정적(2회 동일). 격리: "어떻게" 제거 시 정상 recall. 트리거 토큰 = **"어떻게"**(의문사 → status 의도 매칭).
- **근본:** explicit `recall` 서브커맨드의 **인자**가 NLP 라우터 재해석 대상이 되어, 인자 속 의문형 키워드가 명령을 덮어씀.
- **연결:** research-backlog "D4 recall 오매칭" + CLAUDE.md "등록 4지점 누락=NL 라우터 가드 무력". 인자형 명령(recall 등)은 NLP 재해석에서 제외돼야.

### FINDING-2 (프라이버시) — recall-log가 gitignore 누락
- `vhk init`의 `.vhk/.gitignore`가 `memory.json`은 무시하나 **`recall-log.jsonl`(쿼리 원문 포함)은 안 무시** → 베이스라인 커밋에 쿼리 원문이 git에 올라감.
- **연결:** research-backlog ".vhk 런타임 로그 프라이버시" 테마 실증.

### FINDING-3 (영속성 대조) — memory.json은 토이에서 정상 영속
- 토이 프로젝트에선 `.vhk/memory.json` 정상 생성·영속(907B→10개). → vhk **본체 레포**의 memory.json 미영속(in-memory 재마이그레이션)은 **레포 특유**(learnings.md 마이그레이션/잠금 경로) 확정.

## 추가 측정 (확장 — 10 모듈로 표본 확대, 2026-06-22 후반)

세션 후반 도그푸딩을 4 이터(road·pollution·happiness 등) 더 진행해 표본 확대. 최종: **src/lib 11 모듈·37 테스트·recall-log 15줄·memory 14개.**

### diff-coverage — 10 샘플
iter1=2 · iter6=5 · iter8=4 (road: water/OOB 멀티줄 블록) · 나머지 7개=0 → **3/10(30%) >0.** 패턴 재확인: 미검증>0은 전부 "실행 안 된 멀티줄 블록", 단일줄 미탑분기는 일관 미포착.

### Recall@5 — ★verdict가 쿼리구성에 뒤집힘 (핵심 메타-발견)
같은 memory 스토어, 라벨셋만 확대:
| eval셋 | 의미격차 비율 | Recall@5 | MRR | verdict |
|---|---|---|---|---|
| 10라벨 | 30% (3/10) | **60%** | 0.53 | ml-signal |
| 14라벨 | 21% (3/14) | **71%** | 0.68 | **sufficient** |

→ **어휘정렬 쿼리 4개를 추가(패러프레이즈 희석)했더니 kill-gate 판정이 "ML 필요"→"ML 불필요"로 뒤집힘.** 같은 회상엔진인데 쿼리 구성이 판정을 좌우. **RFC 0049의 평면 0.7 임계는 쿼리분포 통제 없이는 노이즈/게임가능.** 강건한 신호는 집계%가 아니라 **실패모드**: 어휘치환 쿼리 4/4 일관 실패(사람↔인구·망하다↔파산·이웃↔neighbors4·인덱싱↔idx). → kill-gate는 "쿼리분포 명세" 또는 "패러프레이즈-recall 별도 측정"으로 정밀화 필요. research-backlog Recall@5 테마에 이 정밀화 반영.

## 정밀 버그수색 — GitHub 이슈 19건 등록 (#313~#331)

8개 표면 적대적 프로빙 워크플로(29 에이전트) → 후보 20건 전부 **독립 재현 검증**(전용 temp, 다수 2회 deterministic) → 중복통합·기존이슈(#309·#288 등) dedup → **19건 등록**(`bug`+`severity`+`dogfooding` 라벨). 2 표면(safety-mcp·cli-args-help)은 API 522/연결오류로 미완 → **추가 수색 여지**.

| # | 심각도 | 버그 | 근본원인 |
|---|---|---|---|
| #313 | **P1** | recall/회상이 트리거 단어(어떻게·보안·롤백 등) 쿼리에서 엉뚱한 명령으로 가로채짐 — 회상 사실상 불능 | cli-args.ts FREEFORM_ARG_COMMANDS에 recall/회상 누락(learn/blocker엔 적용됨) |
| #315 | **P1** | verify --check-fresh가 verify 직후 항상 거짓 dirty로 done/release 차단 | verify가 자기 추적산출물(.vhk/ledger.jsonl) 갱신→트리 dirty, getCommitInfo가 .vhk 미제외 |
| #316 | P2 | secure scan이 .env.example placeholder(ghp_xxxx)를 CRITICAL 오탐→verify FAIL | scan-secrets 토큰패턴 placeholder검사가 isComment 게이트에 묶임 |
| #317 | P2 | goal done --id ""→Number('')=0→goal 0 DONE 오염(데이터) | resolveGoalId Number() 강제변환, 정수검증 부재 |
| #318 | P2 | memory remove "2zzz"→parseInt 부분파싱→항목2 삭제(파괴적) | resolveIndex parseInt NaN검사만, 정수정규식 부재 |
| #319 | P2 | 한글경로 소스가 diff-cover서 통째 누락→거짓 "측정대상 없음" | diffUnified0가 core.quotepath=false 미전달, 따옴표경로 정규식 미스 |
| #322 | P2 | memory eval expectIds가 문자열이면 String.includes 부분일치→거짓 100% Recall→kill-gate 오염 | scoreEval expectIds 타입가드 부재 |
| #324 | P2 | 미래날짜 createdAt→recency 점수 e+127 폭증→회상랭킹 파괴·과학표기 노출 | recencyScore Math.exp clamp 부재 |
| #325 | P2 | CLAUDE.md 마커쌍 2개면 sync가 관리블록 중복생성(자기치유 실패·SoT 깨짐) | splitVhkBlock 첫 쌍만 처리, 다중마커 정규화 부재 |
| #314 | P2 | memory/goal에 무효서브+트리거단어→commander 에러 대신 doctor/status 오라우팅 | isRealSubcommandPath 우회 시 NL 라우터 우선 |
| #331 | P2 | .vhk/.gitignore가 recall-log·eval(쿼리 원문) 누락→개인 검색어 git 노출 | gitignore 템플릿 누락, memory.json만 보호(정책 비일관) |
| #320·#321·#323·#326·#327·#328·#329·#330 | P3 | diff-cover untracked 침묵·coverage 손상=부재 혼동·eval 형식불량 raw에러·gitignore 슬래시중복·mission show 미등록·goal next 첫회 오경고·goal check 전부완료/비숫자id 메시지 비일관 | 대부분 메시지/UX·엣지 처리 |

→ 고치는 건 사용자 다른 세션 작업 중이라 **보류**(이슈 등록·문서화까지만). diff-cover 라인커버 한계(#319·#320·기발견)는 measure-first PR2 설계에 직접 영향.

## 라운드2 재수색 — 미완 2표면(safety/MCP·CLI인자) + #333 (이슈 #334~#347, +#333)

라운드1에서 API 522로 미완이던 safety-mcp·cli-args 표면을 5개 세분 프로빙으로 재수색 → 후보 15 → 검증 14 → **14건 등록**. 게임 업그레이드 세션 중 관찰한 no-args 비TTY는 별도 **#333**.

**가장 무거운 축 — HARD_STOP 안전 트립와이어 우회 4건** (공통 근본: `guardCli`/`ensureNotHardStopped` 누락):

| # | 심각도 | 우회 명령 | 디스크 영향 |
|---|---|---|---|
| #335 | **P1** | seo init | `.vhk/seo/config.json` 기록 |
| #336 | **P1** | seo submit | IndexNow 키 파일 생성 |
| #338 | **P1** | undo | git reset 경로 진입(HIGH_RISK) |
| #334 | P2 | goal sync | check-goal-*.mjs 생성 |

**MCP 표면 3건:**
- #339 (P1) — MCP가 동봉 dist 대신 PATH 글로벌 vhk 우선 위임 → 버전 스큐로 content/launch/ops/sell/remind 깨짐
- #340 (P1) — runVhkCli가 NL 미인식 실패(`❓ 무슨 뜻인지`)를 `✅` 성공으로 위장 → 에이전트 오판
- #341 (P1) — MCP audit이 감사불가(ENOLOCK)를 `🎉 취약점 0건`으로 거짓 안심(CLI는 '결과 불명' 구분)

**나머지:**
- #337 (P1) — undo --yes 비TTY서 ERR_USE_AFTER_CLOSE raw 크래시(restore엔 isTTY 가드 있음)
- #344 (P2) — env check·design palette → 친절폴백 대신 raw commander 에러
- #345 (P2) — 유령 KNOWN 토큰(현황·스캔·scan·help) → 미지단어보다 나쁜 raw 에러+exit1
- #346 (P2) — 미지 명령(`vhk zzzz`) exit 0 → CI 침묵 실패
- #342·#343 (P3) — MCP tool 수 드리프트(29 vs 30 vs 35), #347 (P3) — goal peek help 누락
- #333 (P3) — no-args 비TTY 대화형 메뉴(--help 폴백 부재)

## 세션 총계 — 등록 이슈 34건
라운드1 #313~#331(19) + #333(1) + 라운드2 #334~#347(14) = **34 이슈**. P1 10건·P2 13건·P3 11건. 전부 격리 temp 독립 재현·dedup 완료. **핵심 패턴: 안전가드(HARD_STOP·guardCli) 적용이 명령별 비대칭** — 신규 명령(seo·undo·goal sync) 추가 시 가드 배선 누락 반복 → 가드를 명령 등록에서 파생/강제하는 메타 테스트 부재가 근인.
