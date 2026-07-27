# RFC 0055 — VHK Proof Protocol: AI 작업 신뢰 원장

> 용어: ADR-011 대응표 참조.

> 상태: Superseded — RFC 0056(Evidence Receipt)이 계승, 본 문서는 아카이브(0056·0057이 archived로 지칭) · 작성: 2026-06-22 · 출처: "VHK가 Git처럼 잡을 수 있는 문제" 제품 전략 논의
> 목적: VHK를 코딩 에이전트가 아니라 **AI 작업의 의도·증거·완료 여부를 추적하는 신뢰 원장**으로 재정의하고,
>       이를 실제 제품/프로토콜/티켓 단위로 쪼갠다.
> 연동: README의 "목표·증거·기억·규칙" 포지션 · RFC 0052(풀사이클 뒷단) · RFC 0054(자율형 진화) · `.vhk/ledger.jsonl` · `verify/review/preflight/testmap/mission/work`.

---

## §0. 핵심 정리

VHK가 Codex, Claude Code, Cursor, Copilot과 정면으로 경쟁하면 진다. 그들은 모델·IDE·클라우드 샌드박스·에이전트 실행 인프라를 가진다.

VHK가 잡아야 할 문제는 다르다:

> AI가 코드를 만들 수는 있다.  
> 하지만 그 작업이 왜 시작됐고, 무엇을 바꿨고, 어떤 증거로 끝났는지 믿기 어렵다.

Git이 "코드 변경의 신뢰 원장"이 됐다면, VHK는 **AI 작업의 신뢰 원장**이 되어야 한다.

한 문장 포지션:

> **VHK는 AI 코딩 결과물을 출고 가능한 작업으로 바꾸는 증거 하네스다.**

운영 슬로건:

> **No proof, no ship.**  
> 증거 없으면 출고 없다.

## §1. 문제 정의

AI 코딩 도구가 강해질수록 다음 문제가 커진다:

1. **의도 손실** — 왜 이 작업을 시작했는지 세션이 바뀌면 흐려진다.
2. **범위 오염** — AI가 요청 밖 파일을 고치거나 위험 영역을 건드린다.
3. **거짓 완료** — "완료"라고 말하지만 테스트·빌드·수동 확인이 비어 있다.
4. **증거 분산** — 터미널 로그, PR, 테스트 결과, handoff가 흩어진다.
5. **인수인계 부재** — 다음 사람/다음 에이전트가 어디서 이어야 할지 모른다.
6. **반복 실수** — 같은 프로젝트에서 같은 실패가 반복되지만 운영 규칙으로 승격되지 않는다.

이 문제는 IDE, CLI, 웹, Claude, Codex, Cursor 어디서 작업하든 동일하다. 따라서 VHK는 특정 UI가 아니라 **repo-native protocol**이어야 한다.

## §2. 제품 정의

VHK는 에이전트가 아니다. VHK는 다음을 표준화한다:

- 작업 시작 전: 의도, 목표, 범위, 금지 영역
- 작업 중: 변경 파일, 위험 신호, 에이전트/사람 실행 흔적
- 작업 종료 후: 검증 결과, 미검증 항목, 출고 판단, handoff

VHK의 핵심 산출물은 "코드"가 아니라 **Proof**다.

```text
vhk task   = 의도 고정
vhk proof  = 증거 수집
vhk review = 완료 주장 검증
vhk export = 사람/PR/다음 에이전트가 읽는 증명서
```

## §3. Protocol v1 객체 모델

VHK Proof Protocol v1은 6개 객체만 표준화한다.

| 객체 | 의미 | 기존 VHK 연결 |
|------|------|---------------|
| **Task** | 왜 시작했는가. 목표, 범위, 금지 영역 | `goal`, `mission`, `next-task` |
| **Run** | 누가/무엇이 작업했는가. Claude, Codex, Cursor, human, mixed | `work`, MCP, future agent metadata |
| **Change** | 무엇이 바뀌었는가. 파일 목록, diff 요약, 위험 파일 | `git status`, `diff`, `testmap` |
| **Proof** | 무엇으로 검증했는가. typecheck/test/build/security/manual | `verify`, `preflight`, `.vhk/reports/latest.json` |
| **Risk** | 출고 위험은 무엇인가. env, auth, payment, db, delete, migration | `mission`, `secure`, future risk scan |
| **Handoff** | 다음 사람/AI가 알아야 할 것 | `work handoff`, `recap`, `docs/state` |

Decision은 별도 객체가 아니라 Proof의 최종 판정 필드다:

```text
decision: pass | caution | block
```

## §4. 파일/원장 설계

VHK는 SaaS 기억이 아니라 repo 안에 남는 원장을 우선한다.

```text
.vhk/
  ledger.jsonl                  # append-only 작업 원장
  proofs/
    2026-06-22-checkout-fix.json # 기계용 proof
    2026-06-22-checkout-fix.md   # 사람/PR용 proof report
```

기계용 Proof 스키마 초안:

```json
{
  "schemaVersion": 1,
  "id": "2026-06-22-checkout-fix",
  "createdAt": "2026-06-22T12:00:00+09:00",
  "task": {
    "title": "checkout bug fix",
    "goalId": 42,
    "objective": "결제 실패 버그 수정",
    "scope": ["src/**", "tests/**"],
    "forbidden": [".env", "dist/**"]
  },
  "run": {
    "actors": ["Claude Code"],
    "mode": "human-approved-agent"
  },
  "change": {
    "baseSha": "abc123",
    "headSha": "def456",
    "dirty": false,
    "filesChanged": 8,
    "riskFiles": ["src/payments/webhook.ts"]
  },
  "proof": {
    "typecheck": "pass",
    "test": "pass",
    "build": "pass",
    "security": "pass",
    "manual": ["local checkout smoke"]
  },
  "risk": {
    "level": "medium",
    "items": ["payment flow touched", "live webhook not tested"]
  },
  "unverified": ["Stripe live webhook"],
  "decision": "caution",
  "handoff": "staging webhook 확인 후 배포"
}
```

사람용 Proof Report는 짧아야 한다. PR 댓글/인수인계에 그대로 붙을 수 있어야 한다.

```md
# VHK Proof

Decision: ship with caution
Intent: checkout bug fix
Changed: 8 files
Gates: typecheck pass, test pass, build pass, security pass
Risk: payment flow touched
Unverified: Stripe live webhook
Next: staging webhook 확인 후 배포
```

## §5. 사용자 흐름

### MVP 흐름

```powershell
vhk mission set --objective "checkout bug fix" --scope "src/**" --forbidden ".env"

# Claude/Codex/Cursor/human 작업

vhk proof create
vhk proof review
vhk proof export --pr
```

### 목표 흐름

```powershell
vhk task start "checkout bug fix"

# 어떤 에이전트가 작업해도 됨

vhk proof create
vhk proof review
vhk ship
vhk work handoff
```

핵심 규칙:

> Claude가 해도 되고, Codex가 해도 되고, Cursor가 해도 된다.  
> 하지만 끝났다고 말하려면 VHK proof가 남아야 한다.

## §6. 시장 재정의

기존 시장 언어:

- AI coding assistant
- AI coding agent
- IDE agent
- cloud coding agent

VHK가 소유해야 할 언어:

- AI 작업 신뢰 원장
- Agentic Proof System
- AI 출고 증명 레이어
- Proof-first delivery harness

처음 고객은 "대기업 개발팀"이 아니라 다음 사용자다:

1. AI로 실제 제품을 만드는 솔로/소규모 팀
2. Claude/Codex/Cursor를 번갈아 쓰는 개발자
3. 고객 납품/배포 전 증거가 필관리자 프리랜서/스튜디오
4. AI PR이 많아져 리뷰 피로가 생긴 팀

## §7. 필관리자 역할군

초기 팀은 작아야 한다. 6개 역할이면 충분하다.

| 역할 | 책임 |
|------|------|
| **Protocol Lead** | `.vhk/` Proof 스펙, ledger, schema version, 호환성 |
| **CLI/Core Engineer** | `vhk proof`, `vhk task`, `vhk export` 명령 구현 |
| **Verification Engineer** | test/build/type/security/manual evidence 수집, stale proof 차단 |
| **Agent Integration Engineer** | AGENTS.md, MCP, Claude/Codex/Cursor 연동 계약 |
| **DX/Docs Lead** | 3분 데모, PR용 Proof Report, quickstart, 예시 repo |
| **Dogfood Operator** | 실제 프로젝트에 강제 적용, 실패/불편/거짓완료 사례 수집 |

팀 원칙:

- 모델 경쟁 금지
- IDE 경쟁 금지
- 에이전트 자체 구현 금지
- Proof format과 출고 판단 경험에 집중

## §8. 표준화 전략

VHK 자체를 표준으로 만들려고 하면 안 된다. 표준이 되어야 하는 것은 VHK 앱이 아니라 **VHK Proof v1 포맷**이다.

Git이 널리 퍼진 이유는 "좋은 명령어 묶음"이어서만이 아니다. `commit`, `diff`, `log`라는 공통 언어를 만들었기 때문이다. VHK도 같은 순서로 가야 한다.

### §8.1. 표준화 원칙

1. **최소 포맷을 고정한다**
   - Intent: 왜 했나
   - Change: 뭐가 바뀌었나
   - Proof: 뭘로 검증했나
   - Risk: 뭐가 위험한가
   - Handoff: 다음은 뭔가
   - Decision: `pass | caution | block`

2. **repo 안에 남긴다**
   - `.vhk/proofs/*.json`: 기계용
   - `.vhk/proofs/*.md`: 사람/PR용
   - `.vhk/ledger.jsonl`: append-only 이벤트 원장
   - 클라우드 계정 없이도 남아야 도구 중립성과 이식성이 생긴다.

3. **검증기를 제공한다**
   - 포맷만 있으면 표준이 약하다.
   - `vhk proof create`, `vhk proof review`, `vhk proof export --pr`가 같은 포맷을 만들고 검사해야 한다.

4. **PR 표면에 붙인다**
   - 개발자가 매일 보는 곳은 PR이다.
   - VHK Proof는 Markdown 댓글, PR 본문, 또는 Check summary로 붙을 수 있어야 한다.

5. **CI에 들어간다**
   - 표준은 자동 검증될 때 팀 규칙이 된다.
   - 최소 목표:

```yaml
- run: vhk proof review --ci
```

6. **AGENTS.md 계약으로 퍼뜨린다**
   - Claude, Codex, Cursor, Jules, human이 같은 규칙을 읽어야 한다.
   - 후보 문구:

```md
Before claiming completion, create or update a VHK Proof and run `vhk proof review`.
```

7. **도구 중립을 지킨다**
   - Claude 전용, Codex 전용, Cursor 전용이면 표준이 될 수 없다.
   - Proof의 출고 판단은 agent 이름이 아니라 증거와 위험에 의존해야 한다.

8. **예시로 퍼뜨린다**
   - 표준은 긴 문서보다 예시로 퍼진다.
   - `pass`, `caution`, `block` 세 가지 proof 예시가 반드시 필요하다.

9. **배지와 짧은 언어를 만든다**
   - README/PR에서 바로 보이는 상태가 필요하다.
   - 예:
     - `VHK Proof: PASS`
     - `VHK Proof: CAUTION`
     - `VHK Proof: BLOCK`

10. **문장을 소유한다**
    - 반복할 핵심 문장:

> **No proof, no ship.**

### §8.2. 표준화 90일 계획

| 기간 | 목표 | 산출물 |
|------|------|--------|
| 30일 | Proof 포맷을 고정하고 로컬 산출물을 만든다 | `VHK Proof v1` 스펙, `vhk proof create`, Markdown report |
| 60일 | 완료 판정 경험을 만든다 | `vhk proof review`, `pass/caution/block`, 예시 proof 3개 |
| 90일 | PR/CI/에이전트 계약으로 퍼뜨린다 | GitHub Action, `proof export --pr`, AGENTS.md contract |

이 단계가 끝나면 VHK는 "CLI 하나"가 아니라 다음 공통 언어로 보이기 시작해야 한다:

> AI 작업이 끝났다는 것을 증명하는 공통 포맷.

사용자가 매일 이렇게 말하게 되는 것이 표준화의 신호다:

> "이 PR proof 있어?"  
> "VHK proof 붙여줘."  
> "proof가 caution이면 아직 merge하지 말자."

## §9. 구현 티켓

### Epic A — Protocol Spec

#### A1. Proof v1 스키마 문서화

- 범위: `docs/spec.md` 또는 별도 `docs/spec-proof.md`에 Proof v1 필드 정의.
- 수용 기준:
  - `Task/Run/Change/Proof/Risk/Handoff/Decision` 필드가 정의됨.
  - 필수/선택 필드가 구분됨.
  - schemaVersion bump 정책이 있음.
- 게이트: 문서 리뷰.

#### A2. `.vhk/proofs/` 디렉터리 정책

- 범위: `.vhk/README.md`에 proof 저장 정책 추가.
- 수용 기준:
  - 기계용 JSON과 사람용 Markdown 저장 위치가 명시됨.
  - 추적/비추적 정책이 명시됨.
  - secret/개인정보 포함 금지 원칙이 명시됨.
- 게이트: `vhk secure scan` 관점에서 민감정보 비포함.

#### A3. Ledger append 이벤트 정의

- 범위: `.vhk/ledger.jsonl`에 `proof.created`, `proof.reviewed`, `proof.exported` 이벤트 추가 설계.
- 수용 기준:
  - 기존 ledger 이벤트와 충돌하지 않음.
  - 이벤트는 append-only.
  - proof id로 추적 가능.
- 게이트: 단위테스트 설계.

### Epic B — Proof Create MVP

#### B1. `vhk proof create` 명령 추가

- 범위: 기존 `verify`, `mission`, `git status`, `.vhk/reports/latest.json`을 읽어 Proof JSON 생성.
- 수용 기준:
  - `.vhk/proofs/<id>.json` 생성.
  - git dirty 여부와 HEAD SHA 기록.
  - 최신 verify report가 없으면 `decision=block` 또는 `unverified`로 표시.
  - HARD_STOP 활성 시 쓰기 차단.
- 게이트: `pnpm.cmd exec tsc --noEmit`, `pnpm.cmd run test:run`.

#### B2. Proof id 생성 규칙

- 범위: 날짜 + slug + 충돌 suffix.
- 수용 기준:
  - 같은 제목 반복 시 덮어쓰기 없음.
  - Windows 파일명 안전.
  - 한글 제목은 안전한 slug로 변환.
- 게이트: slug 단위테스트.

#### B3. Proof Markdown Report 생성

- 범위: JSON에서 `.vhk/proofs/<id>.md` 생성.
- 수용 기준:
  - 30줄 이내 기본 리포트.
  - Decision, Intent, Changed, Gates, Risk, Unverified, Next 포함.
  - PR 댓글로 붙여도 읽힘.
- 게이트: snapshot 테스트.

### Epic C — Proof Review

#### C1. `vhk proof review` 명령 추가

- 범위: Proof JSON을 읽고 거짓완료/누락 증거를 판정.
- 수용 기준:
  - dirty worktree면 `block`.
  - touched source but no test signal이면 `caution`.
  - risk file touched but manual/unverified 없음이면 `caution`.
  - failed gate가 있으면 `block`.
- 게이트: 판정 매트릭스 테스트.

#### C2. Stale proof 감지

- 범위: proof 생성 이후 HEAD 변경 여부 확인.
- 수용 기준:
  - proof.headSha와 현재 HEAD가 다르면 stale 경고.
  - dirty 상태면 stale 또는 block.
  - export 시 stale proof는 기본 차단.
- 게이트: git fixture 테스트.

#### C3. Risk file 휴리스틱 v0

- 범위: auth/payment/db/env/delete/migration 경로 휴리스틱.
- 수용 기준:
  - `auth`, `payment`, `stripe`, `db`, `migration`, `.env`, `delete/remove` 계열 감지.
  - 오탐은 `caution`까지만, 차단은 failed gate/dirty/stale 위주.
  - 규칙은 한 곳에 모음.
- 게이트: risk classifier 테스트.

### Epic D — Export Surface

#### D1. `vhk proof export --pr`

- 범위: PR 댓글/본문에 붙일 Markdown 출력.
- 수용 기준:
  - stdout 출력 + 클립보드 복사 또는 파일 경로 안내.
  - GitHub API 호출 없음.
  - "No proof, no ship" 문구는 선택적 footer.
- 게이트: 비-TTY에서도 동작.

#### D2. `vhk proof list/show`

- 범위: 최근 proof 조회.
- 수용 기준:
  - 최근 N개 목록.
  - id로 상세 보기.
  - stale 여부 표시.
- 게이트: 파일시스템 fixture 테스트.

#### D3. GitHub App 후보 설계

- 범위: 실제 구현 전 설계 문서만.
- 수용 기준:
  - PR에 proof 자동 댓글을 다는 최소 권한 정의.
  - secret 저장 방식과 opt-in 정의.
  - CLI-only MVP 이후 착수로 명시.
- 게이트: 보안 리뷰.

#### D4. GitHub Action `vhk proof review --ci`

- 범위: PR/CI에서 proof 존재와 상태를 검사하는 최소 GitHub Action 예시.
- 수용 기준:
  - proof가 없으면 기본 `caution` 또는 설정에 따라 fail.
  - stale proof는 fail.
  - `block` decision은 fail.
  - `pass/caution/block` summary가 GitHub Actions 로그에 표시됨.
- 게이트: sample workflow fixture 테스트.

### Epic E — Agent Integration

#### E1. AGENTS.md contract 문구 추가 설계

- 범위: RULES.md에 반영할 후보 문구 작성. 직접 AGENTS.md 수정 금지.
- 수용 기준:
  - "완료 주장 전 `vhk proof create/review` 실행" 규칙 후보.
  - Codex/Claude/Cursor가 읽기 쉬운 짧은 문장.
  - `vhk sync`로 전파 가능.
- 게이트: RFC/ADR 검토 후 별도 PR.

#### E2. MCP 읽기 도구 `proof-list`/`proof-show`

- 범위: Claude/Codex가 현재 proof 상태를 읽을 수 있게 함.
- 수용 기준:
  - 읽기 전용.
  - 대화형 없음.
  - stale/decision 표시.
- 게이트: MCP↔CLI 계약 테스트.

#### E3. Agent self-report 필드

- 범위: proof.run.actors에 agent 이름/버전/표면 입력.
- 수용 기준:
  - 수동 입력 가능.
  - 알 수 없으면 `unknown`.
  - 출고 판단은 agent 이름에 의존하지 않음.
- 게이트: schema 테스트.

#### E4. Completion contract를 RULES.md 후보로 승격

- 범위: "완료 주장 전 proof 생성/검토" 문구를 RULES.md 반영 후보로 작성.
- 수용 기준:
  - AGENTS.md 직접 수정 없음.
  - `vhk sync` 전파 대상과 충돌 없음.
  - 사람 승인 전 `goal done` 금지 규칙과 정합.
- 게이트: `vhk sync --check` 설계 검토.

### Epic F — Dogfood & DX

#### F1. 3분 데모 시나리오

- 범위: "AI가 완료라고 한 작업을 VHK가 검증해 누락을 잡는 장면" 작성.
- 수용 기준:
  - before/after가 명확함.
  - 새 사용자에게 명령 4개 이하.
  - README에 넣을 수 있는 길이.
- 게이트: 문서 리뷰.

#### F2. 예시 Proof 3개

- 범위: clean/pass, caution, block 예시 Markdown 작성.
- 수용 기준:
  - source-only with tests pass = pass.
  - payment touched + live unverified = caution.
  - failed test/dirty/stale = block.
- 게이트: snapshot으로 재사용 가능.

#### F3. Dogfood metric 정의

- 범위: Proof가 실제로 거짓완료를 잡았는지 측정.
- 수용 기준:
  - `proof_created_count`
  - `proof_blocked_count`
  - `proof_caution_count`
  - `stale_proof_detected_count`
  - `manual_unverified_count`
- 게이트: ledger 이벤트와 연결.

#### F4. Proof badge/summary 포맷

- 범위: README/PR/CLI에 붙일 짧은 상태 표기 정의.
- 수용 기준:
  - `VHK Proof: PASS|CAUTION|BLOCK` 3상태.
  - 색/아이콘 없이도 의미가 전달됨.
  - Markdown/terminal/CI summary에서 같은 문구 사용.
- 게이트: snapshot 테스트.

## §10. 6개월 로드맵

| 월 | 목표 | 완료 신호 |
|----|------|-----------|
| 1 | Proof v1 스키마 + `proof create` MVP | 로컬 proof JSON/MD 생성 |
| 2 | `proof review` + stale/dirty/risk 감지 | `pass/caution/block` 판정 |
| 3 | PR용 export + 예시 리포트 | PR에 사람이 붙일 수 있음 |
| 4 | AGENTS.md contract + MCP 읽기 도구 | Claude/Codex가 proof 상태 인식 |
| 5 | GitHub App 설계/프로토타입 | PR 자동 댓글 후보 |
| 6 | Public spec `VHK Proof v1` | 외부 repo도 포맷 채택 가능 |

## §11. 비목표

- 새 IDE 만들기
- 새 코딩 에이전트 만들기
- 클라우드 샌드박스 경쟁
- 모델 벤치마크 경쟁
- 모든 풀사이클 기능을 같은 무게로 홍보
- proof 없이 자동 ship/publish

## §12. 성공 기준

VHK Proof Protocol이 성공했다는 신호:

1. 사용자가 PR에 "VHK Proof"를 붙이는 것이 자연스러워진다.
2. AI가 만든 작업에 대해 "테스트 돌렸어?" 대신 "proof 있어?"라고 묻는다.
3. Claude/Codex/Cursor가 바뀌어도 같은 proof 원장이 남는다.
4. VHK가 잡은 `caution/block` 사례가 실제 사고를 줄인다.
5. `.vhk/proofs/*.md`가 handoff와 리뷰의 기본 단위가 된다.

최종 문장:

> Git은 변경 이력 없이 협업하지 않는 문화를 만들었다.  
> VHK는 AI 작업 증명 없이 출고하지 않는 문화를 만들어야 한다.

---

## §13. 검증 결과 (2026-06-22, 다차원 적대 검증)

> 5차원(코드베이스 정합성·내부 모순·§8 전략·§9 티켓·§7 역할군) 병렬 검증 + 발견별 적대 재확인. 38 확정 / 9 기각.
> **판정: 이대로 승격(머지) 불가 → "수정 후 Draft 유지". §8·§7 프레임은 재고.**

### 심각(high) — 머지 전 필수 수정 4건

1. **`vhk ship` 이름 충돌** — RFC는 출고 단계를 `vhk ship`으로 새로 배치하나, `vhk ship`은 이미 완성된 명령(배포 체크리스트+회고+빌드로그, 대화형). 헌법상 기존 명령 시그니처 변경 금지. → proof 출고는 다른 이름(`vhk proof export --pr`/`vhk proof gate`)으로 분리.
2. **두 원장 혼동** — §9 A3가 `proof.*` 이벤트를 `.vhk/ledger.jsonl`에 추가하며 "충돌 없음" 주장. 그러나 그 파일은 verify 결과 1줄 요약(LedgerEntry, 이벤트 개념 없음). 실제 이벤트 원장은 별도 `.vhk/events/ai-actions.jsonl`. 섞으면 dedup(sameAsLast)이 정상 이벤트 삼킴. → proof 이벤트 별도 파일 or `type` 판별 필드+마이그레이션.
3. **신규 `vhk proof` 명령 등록 누락 → 게이트 자동 실패** — 어느 티켓도 등록 4지점(index.ts·command-registry·cli-args·ko.ts)+nlp-router+한글별칭을 수용기준에 안 넣음. 드리프트 가드 테스트가 누락 시 빌드 깸 → 티켓대로 구현하면 첫 게이트에서 즉시 실패. → 신규 명령 티켓마다 등록 4지점+드리프트 테스트 green 명시.
4. **같은 동작에 두 이름** — 의도고정 `vhk mission set`(MVP) vs `vhk task start`(목표흐름·§3), 출고 `vhk proof export --pr` vs `vhk ship`. SHA 경로도 §4 스키마 `change.headSha` vs §9 C2 `proof.headSha` → 구현 버그. `vhk task` 구현 티켓 부재. → §4 스키마를 단일 SoT로 명령명·필드 통일, mission=task 관계 명시.

### 중간(med)

- **객체모델 3곳 불일치**: §3 6객체(Task/Run/Change/Proof/Risk/Handoff) ≠ §8.1 6요소(Intent/Change/Proof/Risk/Handoff/Decision, Run 빠지고 Decision 등장) ≠ §9 A1 7필드. Decision 위상(필드 vs 최상위 키)도 어긋남. → 한 표로 정렬.
- **A2 보안 게이트 집행 불가**: `vhk secure scan`은 경로 인자 없는 전역 스캐너 → proof 단위 secret 차단 불가. B1 생성기 마스킹 단위테스트로 이관.
- **proofs/ git 추적 미결정**: 추적→`.vhk/` 로컬전용 정책 충돌, 비추적→"repo에 남는다" 핵심가치 붕괴. A2에서 결론 + gitignore·init 씨앗 동반 갱신.

### 경미(low)

게이트 키 `security`(proof) vs `secure`(verify) 불일치 / `.cmd` 표기 제거 / 차단기준(dirty→block, stale 처리) 티켓마다 미세 차이 → 단일 판정 매트릭스 / 기존 `checkEvidenceFreshness`(verify.ts)·`vhk stats` 재사용 미명시 → 중복 구현 위험 / §8.2(90일) vs §10(4~5개월) 일정 충돌 / D4 CI exit-code 매트릭스 테스트 부재 / F4 배지 출력지점(D1·D4·B3) 연결 누락.

### §8 표준화 전략 — 토대 붕괴

- **Git 비유 인과 역전**: Git 표준화 동력은 포맷이 아니라 SHA 체인으로 객체가 서로 물리는 협업 그래프(네트워크 효과). proof JSON은 고립된 단발 산출물 → 그 메커니즘 구조적 부재.
- **순서 역전**: 표준화는 "이미 채택된 것 고정"인데 채택 0·구현 0(src에 proof/task/export 전무)·1인 메인테이너.
- **빠진 위협모델**: proof 만드는 주체가 검증 대상 에이전트 자신 — 자기보고 필드(manual·unverified·risk) 위조 방어 0. → decision은 기계증거(종료코드·dirty·stale)로만 + caution→pass 단조성 불변식.
- **과대약속**: 기반 `vhk review`조차 "보장 아닌 신뢰도 신호"라 자인하는데 §8은 'Proof(증명)'로 격상 + "No proof, no ship"(정작 §9 D1에서 선택적 footer로 격하, 강제력 없음). → 'Proof'→'Evidence/Attestation' 격하 + 비보증 경계 1급 명시.
- **경쟁 해자·거버넌스·채택 인센티브 부재**: Claude Code엔 이미 verify/code-review/security-review 내장, GitHub required checks가 출고 게이트 소유. 솔로/소팀(1차 고객)은 리뷰어=작성자라 "proof 있어?" 물을 제3자 없음 = 자기규율 도구지 표준 아님. v1 거버넌스 전무.
- **도구 중립 자기모순**: 검증·CI·계약 전부 vhk CLI 종속인데 §8.1-(7)은 "도구 중립" 표방.

### §7 역할군 — §8과 같은 환상

"6개 인간 역할이면 충분" 단정하나 실제 소규모 오너+AI 에이전트 운영과 모순한다. 보안·표준 거버넌스·외부 채택 책임자도 부재하다.

### 우선 고칠 3

1. **명령·필드 SoT 통일** — §4 스키마를 단일 기준, ship/mission/task 충돌 + SHA 경로 정렬.
2. **저장소 설계 정정** — proof 이벤트 별도 events 파일, 신규 명령 등록 4지점+드리프트 테스트 수용기준화.
3. **§8·§7 정직하게 축소** — "표준화" → "구현 → 도그푸딩 효과입증(거짓완료 1건+ 적발) → 채택 관찰 후 표준 논의" 3단 재명명 + 위협모델·거버넌스·경쟁해자 보강. §7은 "1인+에이전트" 현실로 재작성.

> **후속(2026-06-22 확정)**: VHK 정체성·이길 전략은 [RFC 0056 — Evidence Receipt](0056-vhk-evidence-receipt.md)로 재정의됨. 정체성 결정은 [ADR-006](../adr/ADR-006-vhk-identity-evidence-receipt.md). **이 RFC의 §8(표준화)·§7(역할군) 프레임은 0056이 대체** — 객체모델·티켓(§3·§4·§9)은 위 high/med 결함 정정 후 재사용.
