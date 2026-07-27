# RFC 0052 — 풀사이클 뒷단 4트랙: launch / content / sell / ops (실행층 채우기)

> 용어: ADR-011 대응표 참조.

> 상태: Draft · 작성: 2026-06-16 · 출처: 레포+노션 전수조사("사상은 풀사이클, 실행은 반쪽") + `gate.ts` GATE_QUESTIONS 10~13 자백(질문만·실행 0) + 노션 "아이디어→MVP 풀사이클 프로토콜" Phase 5~6
> 목적: vhk가 표방하는 "바이브코딩 풀사이클 CLI"의 **비어있는 뒷단**(런칭·콘텐츠/마케팅·판매·운영)을 앞단(work→mission→review)과 동일한 "상태수집 + 체크리스트 + 프롬프트 생성" 패턴으로 채운다. 자동 발송·결제·삭제는 하지 않는다(자문형).
> 연동: 실행 단위 = `goals/<n>-fullcycle-*.md` (트랙별 개별 goal·개별 PR). 재사용 = `work.ts emitPrompt` + `ship.ts` CHECKLIST. 프롬프트 위생 = goal 68(remind)·69(negatives)가 깐 Fable5 패턴 상속.

---

## §0. 한 줄 결론

vhk의 뒷단은 `gate.ts`의 **질문으로만 존재**하고(콘텐츠화·마케팅·판매·피드백), 그 질문에 답해 실제로 일하게 해주는 **실행 명령이 없다**. 앞단 `work.ts` 패턴(상태수집 → 체크리스트 → `buildXxxPrompt()` → `emitPrompt()`)을 복제해 **`vhk launch` / `content` / `sell` / `ops`** 4개 자문 명령으로 실행층을 만든다. 전부 "사람이 결정·실행, vhk는 상태수집+프롬프트생성"만 — 실패비용 high 작업(발송·결제·대량삭제)은 LLM 결정경로에서 배제(헌법 불가침). **content 1개부터** 구현하고 나머지는 본 RFC가 설계로 예약한다.

---

## §1. 동기 (실측)

- **`gate.ts` GATE_QUESTIONS 10~13 = 뒷단인데 질문뿐**:
  - 10 콘텐츠화("트윗 1개로 설명"), 11 마케팅("첫 주 올릴 곳 3곳"), 12 판매("가격+결제 확정"), 13 피드백("수집 채널").
  - 이 4개는 아이디어 검증 단계에서 *묻기만* 하고, 답을 받아 *실행*(초안 생성·체크리스트·다음 행동)하는 명령이 0이다. → 사용자는 답을 머릿속에만 두고 직접 처리.
- **`ship.ts`는 npm 배포에 한정**: 가장 가까운 뒷단 후보지만 "빌드+테스트+버전+git" 회고일 뿐, 제품 런칭(런치 게시물·채널·판매 페이지)이 아니다.
- **SEO goal 21~26 stall**: 뒷단 자산(검색 노출)인데 real-API 자격증명 대기로 멈춤 → 상위 우산(content)이 없어 고립.
- **노션 진단 일치**: "VHK 마스터 현황"이 "사상은 풀사이클, 실행은 반쪽 — 앞단(검증·개발·품질·자기진화) 완성형 / 뒷단(런칭·마케팅·판매·운영) 게이트 질문만"이라고 명시. 코드와 일치.

---

## §2. 원칙 (RFC 0050 규율 답습)

1. **measure-first / 자문형 출발** — 뒷단 명령은 전부 "차단 0 자문형"으로 시작(diff-cover가 advisory로 출발한 것과 동일). 게이트(차단)·CI 승격은 실사용이 정당화한 뒤에만.
2. **실패비용 high 제외(헌법)** — 매매·송금·발송·대량삭제는 LLM 결정경로에서 배제. 뒷단 명령은 *직접* SNS 발송·결제·이메일 발송·삭제를 하지 않는다. 체크리스트 항목 + 프롬프트 초안까지만.
3. **단일 SoT** — 체크리스트·프롬프트 조립 헬퍼는 한 곳(`work.ts emitPrompt` 공유 추출). 4개 명령이 클립보드 복사·`.vhk` 사본 저장을 재구현하지 않는다.
4. **범위 수비(v1 OUT 명시)** — 각 트랙 §6에 v1에서 빼는 것을 못박는다(스코프 크리프 차단).

---

## §3. 아키텍처 — 공통 패턴 1개

각 뒷단 명령 = 동일 4단계:

```
상태수집(VISION What·git·goal 등 재사용) → 체크리스트 평가 → buildXxxPrompt() → emitPrompt()
```

- **재사용**: `work.ts`의 `emitPrompt(prompt, fileName, label)`(클립보드 + `.vhk/<file>` 사본) + `ship.ts`의 CHECKLIST 구조 + `ensureNotHardStopped()` 가드.
  - 4개가 재구현하지 않게 `emitPrompt`/체크리스트를 **공유 헬퍼로 추출**(`src/lib/` — 정확 위치는 구현 시 결정).
- **프롬프트 위생 상속**: 모든 `buildXxxPrompt`는 goal 68(remind, 절대규칙 재주입)·69(negatives, ❌ 예시)가 깐 **Fable5 3공식**(절대규칙 중복·good/bad 쌍·수치 하드리밋) 정신을 따른다. 생성 프롬프트에 "≤3 steps / 200줄 초과 분할 / 사람 승인 전 발송·결제 금지"를 박는다.
- **안전 불변식 3개**(기존 코드 패턴 그대로):
  1. `ensureNotHardStopped(...)` 가드(`ship.ts:67`)
  2. `process.exit()` 금지 → `process.exitCode`만 (MCP 안전)
  3. 직접 발송/결제/삭제 0 → `printNextStep`로 "사람이 직접" 유도

---

## §4. 트랙별 MVP (전부 자문형: 정보수집 + 체크리스트 + 프롬프트 생성)

| 트랙 | 명령 | 한글별칭 | MVP 최소 스코프 | 출력 |
|---|---|---|---|---|
| **launch** | `vhk launch` | 런칭 | 런칭 준비 체크리스트(도메인·랜딩·데모·OG이미지·런칭 채널 후보) 수집 → "런칭 게시물 초안 + 채널별 변형" 생성 프롬프트 | `.vhk/launch-prompt.md` |
| **content** | `vhk content` | 콘텐츠 | 제품 한 줄(VISION What 재사용)·키워드·타겟 커뮤니티 입력 → "블로그/스레드/SEO 메타 초안" 생성 프롬프트. **SEO goal 21~26과 연결**(content=상위 우산, seo=하위 실측 도구) | `.vhk/content-prompt.md` |
| **sell** | `vhk sell` | 판매 | 가격·결제수단·환불정책·가치제안 체크리스트 → "가격 페이지 카피 + FAQ" 생성 프롬프트. **결제 연동·실제 과금 0**(체크리스트 항목으로만) | `.vhk/sell-prompt.md` |
| **ops** | `vhk ops` | 운영 | 피드백 채널·30일 사용자 수·탈출조건(유지/피벗/아카이브) 입력 → "운영 회고 + 다음 결정 프롬프트" 생성 | `.vhk/ops-prompt.md` |

> `ship`(코드 npm 배포)과 `launch`(제품 세상에 공개)는 의미가 달라 공존한다(혼동 주의 — README/COMMANDS에 구분 명시).

---

## §5. 시퀀싱 + 승격 게이트

**구현 순서**(번호 = 순서, 잠정 — 생성 시 `vhk goal` 로 확정):

1. **content** (goal 74) — 멈춘 SEO goal 21~26의 상위 우산이 되어 의미 부여(중복 0), VISION What·`recall`·`ref` 재사용 자산 최다, 외부 API/결제 의존 0 → 즉시 도그푸딩. **본 RFC의 첫 구현 대상.**
2. **launch** (goal 75) — `ship.ts` 체크리스트·`emitPrompt` 직접 재사용. content 산출물 소비.
3. **ops** (goal 76) — "30일 사용자 0 → 유지/피벗/아카이브"는 실제 런칭 후 데이터 생김. `today`/`standup` 회고 재사용.
4. **sell** (goal 77) — 결제는 실패비용 최상위 → 가장 보수적으로 마지막.

**동시 착수 금지**: 뒷단 4종을 한 번에 만들지 않는다(AI 독주 방지). 각 트랙 = 개별 goal·개별 PR(`vhk goal next` 로 하나씩).

**승격 게이트**: 자문형 → 게이트/CI 승격은 "트랙별 실사용 ≥ N회 + 실제 산출물 생성 확인"이 정당화한 뒤에만(measure-first).

---

## §6. 범위 (IN / OUT)

**IN (v1)**: 상태수집 · 체크리스트 평가 · 한국어 프롬프트 초안 생성 · `.vhk/*-prompt.md` 저장 + 클립보드 복사 · 4지점 등록 + MCP(읽기전용) + 단위테스트.

**OUT (v1, 명시적 비목표)**:
- 실제 SNS 발송 / 게시 자동화
- 실제 결제·과금·Stripe/Lemon 연동
- 실제 이메일 발송
- 파일·DB 대량 삭제
- 외부 API write (검색엔진 제출 등은 기존 SEO goal 소관)
- launch/sell/ops 명령의 동시 구현(본 RFC는 content 1개만 구현, 나머지 설계 예약)

---

## §7. 위험 · 엣지

- **이름 혼동**: `ship` vs `launch` — README/COMMANDS에 "ship=코드 npm 배포 / launch=제품 공개" 한 줄 구분.
- **빈 입력**: VISION.md·goal 없는 프로젝트에서도 graceful(빈 섹션 안내, 크래시 0) — loop-brief·remind 패턴.
- **프롬프트가 발송을 부추김**: 생성 프롬프트 자체에 "사람 승인 전 발송·결제·게시 금지" 하드리밋을 박아(Fable5 공식3) 에이전트가 자율 발송하지 않게.
- **measure-first 우회 유혹**: 4트랙을 한꺼번에 만들고 싶은 압력 → §5 동시 착수 금지로 차단.

---

## §8. 수용 기준

- [ ] content 트랙(goal 74) 구현: `vhk content` + 한글별칭 동작, `.vhk/content-prompt.md` 생성, 빈 프로젝트 graceful.
- [ ] 4지점 등록 + MCP(읽기전용) + COMMANDS/README + 단위테스트(buildContentPrompt 순수함수).
- [ ] 생성 프롬프트가 Fable5 하드리밋("≤3 steps / 사람 승인 전 발송·결제 금지") 포함.
- [ ] `emitPrompt`/체크리스트 공유 헬퍼 추출(4트랙 재구현 0).
- [ ] launch/sell/ops는 본 RFC §4 표 + §5 순서로 설계만 — 구현 예약(개별 goal).

---

## 부록 — 본 RFC를 만든 풀사이클 계획

레포+노션 전수조사 + Fable5 1차 출처 검증(`asgeirtj/system_prompts_leaks/Anthropic/claude-fable-5.md`)에서 도출. Fable5 프롬프트 엔지니어링(3공식)은 goal 68(remind)·69(negatives)로 이식됨 — 본 RFC의 뒷단 프롬프트들이 그 위생을 상속한다. 즉 "풀사이클" = 뒷단 실행층(본 RFC) + 프롬프트 위생(goal 68/69) + (후속) 지휘자 오토파일럿.
