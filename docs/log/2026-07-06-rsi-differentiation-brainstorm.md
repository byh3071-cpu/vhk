# 2026-07-06 — RSI 가능성 진단 → 차별축(감사층) → cold-start 역채굴 브레인스토밍

> 세션 성격: **전략 브레인스토밍 (코드 변경 0 · 커밋 0)**. HARD-GATE(설계 승인 전 구현 금지) 준수.
> 사용자 출근으로 설계 섹션1 제시 중 중단 → 다음 세션 재개용 핸드오프.
> append-only. 아래는 이 세션 전체 흐름 + 결정 + 리서치 결과 + 재개 지점.

## 1. 세션 흐름 (한눈에)

1. 질문: "RSI(재귀적 자기개선) 현재 VHK에서 가능?"
2. 실측 판정: **불가** — 사람 승인 게이트가 헌법(PAT-003)·개선 주체는 외부 Claude(VHK가 못 바꿈)·evolve 5계층 중 `rule`만 구현. → 약한 "사람-in-loop 자기개선 복리"만 부분 존재.
3. 후속 질문: "OpenCode·Hermes·Cowork처럼 RSI 되면서 차별성?"
4. 웹 실측(3제품) → **차별축 재정의**: RSI 추격 금지(Hermes가 자가진화 복리 니치 이미 선점, MIT·175k★). VHK 유일 빈칸 = **에이전트 감사(receipt/거짓완료) + 강한 거버넌스 게이트**. "어떤 에이전트 위에도 얹히는 반증가능 감사층 + 그 게이트 엔진의 거버넌스-메타루프".
5. 4개 다음수 스케치 → 사용자 결정 4건(아래 §2) → **#1 cold-start 역채굴** 브레인스토밍 착수.
6. 병렬로 사회적 청취 리서치(agent-reach) 실행 → 가설 검증(§4).

## 2. 사용자 방향 결정 (확정)

- **ICP** = 1인 창업자/개인, AI 1인기업 개인최적화.
- **Hermes** = 경쟁 아닌 깔개/벤치마킹. 유저 불만·피드백을 VHK가 흡수해 진화.
- **에이전트 불가지론** = 클로드 아니어도 어떤 에이전트/AI든 다 돌게.
- **메타루프** = 실측 요청 → 아래 §3 결과.

## 3. 메타루프 실측 결과 (코드+데이터 직독)

**현재 안 됨 — 열린 고리.** 근거:
- 캡처는 됨: `evolve-log`(apply/reject+기각사유+patternId 조인)·`receipt-log`·`autonomy-log`.
- **되먹임 팔 0건**: `readEvolveLog`→`stats`(채택률 표시)만, `readReceiptLog`→`loop`/`stats`(추세 표시)만, `readAutonomyLog` 소비처 0. `generateCandidates`는 로그 입력 안 받고 결정적 템플릿 유지.
- **데이터 ~0**: evolve-log.jsonl 파일없음(진화결정 0)·receipt-log 1줄·autonomy-run.jsonl 파일없음. `memory.patterns=0` → evolve 엔진 입력 자체가 비어서 지금껏 0건이던 진짜 이유.
- 최대 리스크: **솔로 ICP × 데이터 굶주림 콜드스타트**(거버넌스 결정은 작업보다 훨씬 드묾).

## 4. 사회적 청취 리서치 결과 (agent-reach 백그라운드 에이전트)

**가설(에이전트 감사/거버넌스 수요) = YES, 강함.** 단 정직한 반대 단서 있음.

### 제품별 [★VHK] 핵심 증거
- Hermes: "에이전트가 작업 완료를 거짓말함"(DONE 표시했지만 cron 0개) — https://github.com/NousResearch/hermes-agent/issues/25288
- Hermes: write_file이 착지 확인 없이 성공·바이트수 조작 보고 = 감사결함 명시 — https://github.com/NousResearch/hermes-agent/issues/57788
- Hermes: web_search opt-in 없이 제3자(search.parallel.ai) 트래픽 무단 라우팅 19👍 — https://github.com/NousResearch/hermes-agent/issues/45058
- Hermes: fail-closed "증거 ID 없으면 사실주장 금지·abstain" 요청 — https://github.com/NousResearch/hermes-agent/issues/16107
- OpenCode: `/goal` + "모델 검증 완료 후에만 목표완료 표시" 104👍 — https://github.com/anomalyco/opencode/issues/27167
- Cowork: `rm -rf`로 사용자 법률파일 영구삭제(되돌릴 수 없는 자율실행) — https://github.com/anthropics/claude-code/issues/32637
- **솔로 창업자가 VHK를 독립 재발명**(프롬프트→프로토콜 훅·false-report 로그·"완료=X" 객관체크, 조작보고 주13→0~1건) — https://dev.to/vintage97/how-i-survived-7-rebuilds-of-the-same-saas-by-building-a-control-layer-around-claude-code-21dh
- IndieHackers: "모호한 완료조건 → 새벽까지 예산 소진·워커 4시간 조용히 정지" 가드레일>영리함 — https://www.indiehackers.com/post/i-stopped-watching-my-agents-heres-what-broke-at-3am-6fc037b7e3
- Hermes 기술리뷰: "치명 데이터작업 fail-silent가 지배적 패턴" — https://medium.com/@leif.markthaler/hermes-agent-a-deep-technical-review-of-nousresearchs-self-improving-ai-agent-b48c64f8e3cc

### 교차 테마 (제품 넘나듦)
1. 거짓완료·자기보고 무검증 (VHK 핵심 직격) 2. fail-silent 조용한 실패 3. 되돌릴 수 없는 자율실행 사고 4. 저품질 릴리스·셋업 마찰 5. 모호한 완료조건→무한루프.

### 정직한 반대 단서 (포지셔닝에 필수)
1. **검증 생략 편의 흐름 실재** — GitHub Copilot CLI `--yolo`(전권·삭제) 권장. 벤더가 마찰없는 자율성 부추김 → VHK는 **검증을 가볍게** 만들어야 경쟁.
2. **검증 순수 이슈는 반응수 낮음** — 대중 분노 1순위는 락인·비용·셋업(Broken Claude Max 357👍·usage limit 722👍/1477댓글). 신뢰/검증은 "깊게 아파하는 소수+블로그"로 정성적 강함. → **단독 판매 금지, 락인탈피·비용통제·무인안전과 묶어 팔 것.**
3. **커버리지 구멍**: opencli 브라우저 브릿지 미연결(Chrome 확장 꺼짐 추정) → X·Instagram·Threads·Reddit 직접검색 실패. GitHub·웹블로그·HN만 제대로 팜. 소셜 재조사 시 Chrome 확장 연결 확인 필요.

## 5. cold-start 역채굴 (#1) — 브레인스토밍 결정 (Q1~Q4, 전부 A)

목표: 비어있는 `memory.patterns`(=0)를 과거 기록 역채굴로 시드 → 메타루프 연료.

- **Q1 결과물 위치 = A** — 별도 시드 리포트(`.vhk/seed-candidates.md` 등)로만 뽑고 memory·evolve 큐 **미변경**. 검증되면 그때 evolve 큐(B흐름)로 승격하는 2단. (오염 0·되돌리기 쉬움)
- **Q2 소스 범위 = A(고신호만)** — PAT + TS + memory.failures + til. devlog(119)·git·ADR·RFC 제외(노이즈/룰형태 아님). 실측 재고: PAT ~20 · TS 5 · failures 18 · til 1파일 = ~44단위(충분).
- **Q3 추출 방식 = A(순수 결정적)** — frontmatter/구조 필드 파싱만, LLM 0(헌법 부합). 기존 `buildNegativeFromFailure`·`renderNegativeCandidates`(failures→부정예시)·`buildDraft`(패턴→룰문구) 재사용. 자유서술 알맹이 손실은 **원문 링크 첨부**로 커버.
- **Q4 전달 형태 = A(lib+얇은 스크립트)** — 로직은 `src/lib/seed-mine.ts`(순수·vitest 테스트), 진입점은 `scripts/mine-seed.mjs`(얇음). 커맨드 등록 4지점·nlp·ko.ts·MCP 세리머니 회피(YAGNI). 로직이 lib라 나중에 `vhk evolve seed` 커맨드로 승격 가능.

### 타입 매핑 근거 (실물 확인함)
- `PatternEntryV19`(evolve `generateCandidates` 입력) = { kind:'avoid'|'reinforce', axis:'tag'|'keyword', signal, count, summary, status }.
- `FailEntry` = { id, content, why?, lesson? }.
- PAT = docs/patterns/PAT-001~003(신형)+구형 ~17, frontmatter 증상/원인/해결/카테고리/태그/id.
- 매핑안: memory.failures→avoid / PAT→reinforce(증상+해결) / TS→avoid(제목) / til→혼합.

## 6. 재개 지점 (다음 세션 여기서 이어감)

**설계 섹션 1/2(구조) 제시 중 중단.** 다음 순서:
1. 설계 **섹션1(구조)** 마저 제시 → 사용자 승인. (구조도: `scripts/mine-seed.mjs` 얇은진입점 → `src/lib/seed-mine.ts` collect*/map*/render → `.vhk/seed-candidates.md`)
2. 설계 **섹션2(시드 후보 스키마·confidence·dedup·에러핸들링)** 제시 → 승인.
   - confidence: 결정적(단일문서=low, signal 공유 다수=med/high, evolve digest 임계 재사용 count≥5 high·3~4 med).
   - dedup: RULES.md 기존 라인과 대조(`isDuplicateRule` 재사용).
   - 에러핸들링: per-file best-effort(evolveNegatives 패턴), 빈 소스 graceful.
3. 승인되면 spec 문서 `docs/superpowers/specs/2026-07-XX-seed-mine-design.md` 작성·커밋 → spec self-review → 사용자 리뷰 게이트 → **writing-plans 스킬**로 구현계획. (brainstorming 스킬 종단 상태 = writing-plans)

**주의:** 구현은 아직 0. push·commit도 이 세션엔 안 함(브레인스토밍만). 관련 기억 = `~/.claude/.../memory/vhk-differentiation-audit-layer.md`(자동로드).
