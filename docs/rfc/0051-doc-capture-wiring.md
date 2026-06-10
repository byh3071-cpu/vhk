# RFC 0051 — docs 자동 적재 배선: 감지 기계를 세션 의례에 연결 + 네이밍 통일

> 상태: Accepted · 작성: 2026-06-10 · 출처: 사용자 자백("Docs ADR·트러블슈팅 왜 안 쓰는지 등록 안 하는지") + 코드 감사(recap.ts·adr.ts·work.ts 실측)
> 목적: ADR/트러블슈팅이 **글로는 필수인데 실제로 0건**인 원인을 "규율 부족"이 아니라 **배선 누락**으로 규정하고, 이미 존재하는 감지 기계를 세션 의례에 연결한다. 네이밍 자기모순도 같이 닫는다.
> 연동: 기록 규칙 단일소스 = `RULES.md` §기록 규칙. 의례 = `CLAUDE.md`(세션 종료 의례). 감지 = `src/lib/adr.ts` + `src/commands/recap.ts`. 배선점 = `src/commands/work.ts`(handoff).

---

## §0. 한 줄 결론

ADR이 0건인 건 사람이 게을러서가 아니라, **ADR/트러블슈팅을 자동 감지·생성하는 기계가 `vhk recap` 안에만 있고 `recap`이 세션 의례 어디에도 안 끼워져 있어서 한 번도 안 돌기 때문**이다(recap.ts:147·:191 감지 존재, 그러나 `CLAUDE.md` 의례·`COMMANDS.md`·`next-task.md` 어디에도 recap 없음 — 실측 grep 0건). 게다가 recap은 inquirer 프롬프트라 **MCP/비대화형이면 통째 스킵**(recap.ts `ensureInteractive`). 고로 헌법 문구를 더 강화하는 게 아니라 **감지를 종료 의례(`vhk work handoff`)에 자문형으로 배선**하는 게 근본 해법. 강제 생성은 안 한다(과안정화 경계) — 후보를 핸드오프 프롬프트에 노출하고 AI/사람이 판단.

---

## §1. 동기 (실측 — 거짓완료 심문)

- **ADR 0건 박제**: `docs/adr/`에 ADR-000-template.md 1개뿐, 실제 ADR 0개. 그런데 RULES.md("기술스택 변경 시 ADR 필수"·"의사결정 → docs/adr/")는 필수라고 적혀 있음. **글=필수, 실제=0 → 규칙이 실행으로 안 옮겨짐.**
- **감지 기계는 이미 있다**: `src/lib/adr.ts`의 `detectAdrCandidates(diff)`는 package.json·빌드설정·CI·DB·인증 파일 변경을 룰로 감지(5룰), `createAdrFile`은 `ADR-NNN` 자동 채번 생성. recap.ts는 `fix/bug/error/핫픽스` 커밋 키워드로 트러블슈팅 후보 감지. **기능 부재가 아님 — 발동 경로 부재.**
- **유일 트리거가 고아 명령**: 이 감지는 오직 `vhk recap`에서만 호출됨. 그런데 `recap`은:
  - `CLAUDE.md` 세션 의례·`COMMANDS.md`·`docs/state/next-task.md` **어디에도 등장 안 함**(grep 0건).
  - 세션 종료 의례는 `vhk work handoff`만 시킴 → handoff는 recap 감지를 **호출하지 않음**.
  - recap 본문은 inquirer 프롬프트 묶음 → 비대화형(MCP·CI·자동화)에서 **통째 스킵**.
  - 결과: AI 세션은 devlog + memory에만 기록 → ADR/TS 영영 비어 있음.
- **핵심**: 이건 측정이 필요한 문제가 아니다(recall·diff-coverage와 다름). 원인이 **결정적으로 단일**(배선 1줄 누락) → measure-first가 아니라 **wire-first**가 맞다.

## §2. 네이밍 자기모순 (사용자 지적 — 실측 확인)

| 종류 | 현재 형식 | 번호 | 생성 경로 | 문제 |
|------|-----------|:----:|-----------|------|
| ADR | `ADR-NNN-slug.md` | ✅ | recap 자동 | OK |
| 트러블슈팅(수동) | `TS-NNN-slug.md` | ✅ | 사람 | OK |
| **트러블슈팅(recap 자동)** | `YYYY-MM-DD-slug.md` | ❌ | recap | **수동 TS-NNN과 모순 — 시스템이 자기 규칙 위반** |
| 패턴 | `{category}-{name}.md` | ❌ | 사람(글로벌 규칙) | 번호·참조ID 없음 |
| RFC | `NNNN-slug.md` | ✅ | 사람 | OK |
| devlog | `YYYY-MM-DD-name.md` | (날짜) | 사람 | OK(시계열 의도) |

- 같은 "트러블슈팅"인데 **수동(TS-NNN)과 자동(날짜)이 다름** → 한 폴더에 두 규칙. 자동 경로를 TS-NNN로 맞추는 건 논쟁 여지 없는 버그픽스.
- 패턴 `{category}-{name}`은 **글로벌 `~/.claude/CLAUDE.md`의 "패턴 사전" 규칙이 의도적으로** 정한 것(카테고리 접두 = 분류·검색 장점). 번호화(`PAT-NNN`)는 참조ID 장점이 있으나 **vhk 레포 단일소스 밖**(모든 프로젝트 영향) → §5 결정.

## §3. 원칙 (헌법·기존 패턴 이식)

| 관점 | 적용 |
|------|------|
| **wire-first (≠ measure-first)** | 원인이 단일·결정적(배선 누락)일 땐 측정 핑계 없이 바로 연결. recall/diff-coverage는 *가설*이라 측정 먼저였지만, 여기선 "0건"이 이미 증거. |
| **과안정화 경계 (헌법)** | 감지는 **자문형(advisory)** — 후보를 *보고*만 하고 ADR/TS 파일을 **강제 생성 안 함**. 사람/AI가 "이건 ADR감 아님"이라 판단할 자유 보존. 무차별 생성은 docs 노이즈. |
| **비대화형 우선 (RULES.md MCP)** | 감지 출력은 inquirer 없이 **텍스트(핸드오프 프롬프트 섹션)**로 — MCP·CI·자동화에서도 동작. recap의 대화형 생성은 그대로 두되, 감지는 순수 분리해 재사용. |
| **단일 SoT (Goal 48)** | 감지 로직을 `recap.ts` 인라인에서 순수 모듈로 추출 → handoff·recap·(향후 MCP) 한 곳 재사용. 규칙 문구는 `RULES.md` 한 곳, 네이밍 규칙도 한 곳. |
| **append-only (헌법)** | 기존 14개 패턴·3개 TS 파일은 **개명 안 함**(과거 기록 보존) — 신규부터 새 규칙. 마이그레이션은 별도 옵트인. |

## §4. 아키텍처 (순수 seam — adr.ts 선례 재사용)

```text
SessionDiff + commits ─▶ doc-suggest.detectDocCandidates() (순수)
                          ├─ ADR 후보   (= detectAdrCandidates, 기존 순수)
                          └─ TS 후보    (= 커밋 키워드 감지, recap.ts 에서 추출)
                                 │
        ┌────────────────────────┼────────────────────────┐
   vhk recap (대화형 생성)   vhk work handoff (프롬프트 주입)   (향후) MCP recap
```

- **`src/lib/doc-suggest.ts`** (신규·순수): `detectDocCandidates(diff, commits)` → `{ adr: AdrCandidate[], troubleshooting: {hash,message}[] }`. 부수효과 0. 내부는 기존 `detectAdrCandidates` + recap의 트러블슈팅 키워드 정규식을 이식(로직 신규 0, 위치만 단일화). `formatDocCandidatesForPrompt`로 프롬프트 줄 변환(후보 0건 → 빈 배열 → 섹션 생략).
- **`src/commands/work.ts` handoff 확장**: `detectDocCandidates` 호출 → 후보 있으면 핸드오프 프롬프트에 `[📋 미기록 의사결정/에러 후보]` 섹션 주입. **inquirer 없음 → 비대화형 안전.** git 실패 시 graceful(후보 0, 핸드오프 안 막음).
- **`src/lib/troubleshooting.ts`** (신규·IO): `createTroubleshootingFile(...)` = **`TS-NNN-slug.md`** 채번(`adr.ts`의 `nextTsNumber` 패턴 복제). recap의 인라인 날짜 네이밍 대체.
- **`recap.ts` 리팩터**: 감지는 `doc-suggest`에 위임, TS 생성은 `troubleshooting.createTroubleshootingFile` 호출(날짜형 → TS-NNN). 동작 동일, 네이밍만 정합.

## §5. 결정 (패턴 네이밍 — 글로벌 영향)

> 패턴 네이밍은 vhk 레포가 아니라 **`~/.claude/CLAUDE.md`(모든 프로젝트 공통 규칙)** 소관 → 바꾸면 전 프로젝트 영향.

- **(A) 현행 유지 `{category}-{name}`** + frontmatter `id` 추가. 가장 보수적.
- **(B) `PAT-NNN-slug` 번호화** — ADR/TS/RFC와 형식 통일·참조ID 확보. 글로벌 규칙 수정 + 신규부터 적용.
- **(C) 하이브리드 `PAT-NNN-{category}-{name}`** — 파일명 길어짐.

> ✅ **결정(2026-06-10): (B) 확정.** `~/.claude/CLAUDE.md` 패턴 사전 규칙을 `docs/patterns/PAT-NNN-{영문명}.md`로 갱신 완료(ADR 채번 방식, 3자리 zero-pad, 프로젝트별 시퀀스). 기존 14개 `{category}-{name}` 파일은 개명 금지(append-only) — 신규부터 PAT-NNN, 카테고리는 frontmatter `카테고리`로.

## §6. PR 분할 (점진)

- **PR1 — 배선(핵심·차단 0)**: `doc-suggest.ts` 추출(순수, TDD) + `vhk work handoff`가 후보를 프롬프트에 주입. 이것만으로 **다음 세션부터 ADR/TS 후보가 종료 시 눈에 보임**.
- **PR2 — 네이밍 정합(버그픽스)**: recap 자동 트러블슈팅을 `TS-NNN`으로(`troubleshooting.ts`). 자기모순 제거. 기존 파일 무개명.
- **PR3 — 규칙/의례 문서 정합**: `RULES.md` §기록 규칙에 "handoff가 미기록 ADR/TS 후보 보고" 한 줄 + `vhk sync` 전파(CLAUDE.md·AGENTS.md). ⚠️ `CLAUDE.md` 기록 규칙 영역은 자동생성이므로 **RULES.md에서만 수정**.
- **PR4 — 패턴 네이밍**: §5 (B) 확정. 글로벌 규칙 수정 ✅ 완료(2026-06-10). 코드 변경 없음(패턴 .md는 에이전트 수기 생성, vhk 코드가 생성 안 함 — `vhk pattern`은 memory 버킷 감지로 별개). 다음 신규 패턴부터 PAT-NNN.

> 본 구현: PR1·PR2·PR3 동시 반영(한 브랜치). PR4는 글로벌 규칙만(레포 코드 무관).

## §7. 범위

- **IN**: 감지 순수 추출 + handoff 배선(PR1) · recap TS 네이밍 통일(PR2) · 규칙/의례 문서 정합(PR3) · 글로벌 패턴 규칙 PAT-NNN(PR4).
- **OUT**: 강제 생성(자문형 유지) · 기존 14패턴/3TS 개명(append-only) · docs 전역 인덱스/레지스트리 자동생성(별도 RFC 후보 — "등록" 갈증은 PR1 프롬프트 가시화로 1차 해소) · Notion 패턴 사전 DB 적재(외부 에이전트 소관).

## §8. 위험 / 엣지

- **자문 → 무시 가능**: 후보를 보고만 하면 AI가 또 안 쓸 위험. 완화 = 프롬프트에 "해당하면 *지금* 기록" 명령형 + 후보 건수 헤드라인. 강제는 과안정화라 의도적 비채택.
- **오탐(ADR 후보 남발)**: package.json 사소 변경도 후보로 뜸. 완화 = 자문형이라 무해(사람이 스킵).
- **handoff 비대화형 전제**: handoff는 프롬프트를 파일/클립보드로 emit → inquirer 없음 → 감지 텍스트 주입 안전. `detectDocCandidates`의 git 호출 실패는 try/catch graceful(후보 0).
- **네이밍 마이그레이션 유혹**: 기존 파일 개명은 append-only 위반 + 링크 깨짐 → 금지.
- **recap 회귀**: TS 생성 경로 변경(날짜→TS-NNN) → `nextTsNumber` 단위테스트로 고정. 기존 recap 테스트 green 유지.

## §9. 수용 기준

- **PR1**: `buildHandoffPrompt`가 후보 있을 때 미기록 후보 섹션 주입, 없으면 미삽입(기존 시그니처 호환). `doc-suggest` 순수 단위테스트 green. ✅
- **PR2**: recap이 만든 트러블슈팅 파일명 = `TS-NNN-slug.md`. `nextTsNumber` 단위테스트. 기존 TS-001~003 무변. ✅
- **PR3**: `RULES.md` §기록 규칙 한 줄 추가 → `vhk sync` → CLAUDE.md·AGENTS.md 전파. ✅
- **공통**: `pnpm build; pnpm test` 통과, 회귀 0.
