# RFC 0048 — 업계최상위 품질 로드맵 (Top-Tier Quality Roadmap)

> 용어: ADR-011 대응표 참조.

> 상태: Draft · 작성: 2026-06-08 · 출처: 13-에이전트 다차원 감사(2026-06-08, 실측 검증)
> 목적: VHK를 "실무급 3.5/5"에서 **솔로 한국어 CLI가 코드로 도달 가능한 진짜 천장(~4.7)**으로 끌어올리는 원리·노하우·실행 로드맵의 단일 마스터 문서.
> 연동: 실행 단위 = `goals/47~54` (각 `check-goal-N.mjs` 가드). 상태 SoT = `docs/state/next-task.md`. 사실값(버전·테스트) SoT = `package.json`·`CHANGELOG`.

---

## §1. 목표 — 점수표와 "왜 전 차원 5점은 불가"

### 1.1 현재 → 목표 (감사 실측 기준)

| 차원 | 가중 | 현재 | 목표 | 상한 사유 |
|------|------|------|------|-----------|
| 코드 품질·TS 엄격성 | ↑ | 4 | **5** | 순수 기술 — 솔로 100% 통제 |
| 테스트 품질 | ↑ | 4 | **5** | 순수 기술 — 솔로 100% 통제 |
| 아키텍처·결합도 | ↑ | 3 | **5** | 순수 기술 — 솔로 100% 통제 |
| 툴링·CI·릴리즈 | · | 3 | **5** | 순수 설정 — 솔로 100% 통제 |
| 거버넌스·문서 | · | 4 | 4.5 | 다수협업 속성 = 솔로엔 카테고리 부적용 |
| 제품화·패키지 | · | 3 | 4.5 | 글로벌 채택(시장) + 영어화(본질) = 코드 비통제 |
| **가중 종합** | | **3.5** | **~4.7** | |

### 1.2 왜 "전 차원 문자 5점"은 솔로 한국어 CLI에 부적절한가 (증명)

막힌 두 차원은 **"안 한 작업"이 아니라 "솔로/코드가 통제 못 하는 속성"**이라 막힌다. 기술 4차원과 종류가 다르다.

**제품화 5점 = 글로벌 채택 = 시장 결과, 코드 아님.**
- 업계최상위 제품(ripgrep·gh·vite)의 5점 = 주당 수십만~수백만 다운로드 + 실 dependents + 영어 기본 접근성.
- **한국어 전용은 의도된 정체성.** 글로벌 규칙이 "응답 무조건 한국어"를 강제하고 가치제안 자체가 "한국어로 묶는". 영어 i18n = 버그픽스가 아니라 **본질 변경.**
- **채택은 코드로 못 만든다.** 완벽한 영어+문서여도 다운로드는 배포·타이밍·네트워크효과의 함수. 솔로는 코드 100% 통제하지만 채택은 ~10%. **마지막 0.3점(4.7→5)은 코드가 아니라 시장.**
- 결론: 영어 fallback 1개로 3→4.5까진 *본질 유지*하며 가능. 문자 5점은 "솔로 코드 노력"의 함수가 아님.

**거버넌스 5점 = 다수 협업 속성 = 솔로엔 카테고리 부적용.**
- 업계최상위 거버넌스의 *목적* = "맥락 안 공유하는 여러 명 조율"(다중 maintainer·커뮤니티 RFC·triage SLA·bus-factor>1).
- **1인 솔로엔 그 축이 존재 안 함.** 함정: 솔로가 다중기여자 의례(CONTRIBUTING·커뮤니티 RFC)를 흉내내면 = over-engineering = **오히려 감점.**
- 고칠 수 있는 실결함(가드 자동실행 0 + 정규식 shape 가드)만 메우면 4→4.5. 나머지 0.5는 "결함"이 아니라 "다수가 없어 측정 대상이 없음" = 카테고리 차이.

**기술 4차원이 5점 도달 가능한 이유:** 전부 엔지니어링 결정 + 자동화의 함수, 타인·시장 0% 의존. 솔로가 100% 통제. VHK는 이미 4·3이고 활주로가 명확.

---

## §2. 업계최상위 5점의 원리 (학습 자산 — 노하우 + 코드)

> "4점과 5점을 가르는 것은 더 똑똑한 코드가 아니라, 결함을 **사람이 아니라 기계가 막게 만든 자동화**다."
> 현재 VHK는 머리(설계)는 5점인데 자동화(린트·멀티OS CI·커버리지 게이트)가 비어 매번 사람(AI 페어)이 손으로 메운다. 이 갭이 4와 5의 전부다.

### 원리 1 — 자동화가 사람을 대체한다
결함을 사람 리뷰가 아니라 **머지 게이트**가 막는다. 131파일 규모에서 floating-promise·exhaustive switch 누락을 사람 눈에 의존하면 반드시 샌다.

```jsonc
// biome.json — 진짜 결함 탐지가 핵심(스타일 통일은 부차)
{
  "linter": {
    "rules": {
      "recommended": true,
      "nursery": { "noFloatingPromises": "error" },
      "suspicious": { "noExplicitAny": "error" } // 이미 0건이지만 회귀 봉쇄
    }
  }
}
```
```yaml
# ci.yml — 블로킹 스텝. 사람 리뷰 전에 기계가 먼저 거른다.
- name: 린트 게이트
  run: pnpm exec biome ci .
```

### 원리 2 — 단일 진실원(SoT): 같은 로직을 두 번 짜지 않는다
**MCP가 CLI를 재구현 = 두 진실 → 드리프트.** 실제로 #150/#152/#161을 출하했다. 계약 테스트는 사후 봉쇄일 뿐, 원천(이중 구현)을 제거해야 재발 0.

VHK엔 이미 모범 사례가 있다 — `scanProjectForSecrets(cwd)`(src/lib/scan-secrets.ts:48)는 CLI와 MCP가 *같은 함수*를 부른다. git도 똑같이:

```ts
// ❌ 현재 (mcp/server.ts:92,130,134,139 — git 시퀀스를 인라인 재구현)
const status = safeExecFile('git', ['status', '--porcelain'])
const add = safeExecFile('git', ['add', '.'])
const commit = safeExecFile('git', ['commit', '-m', commitMsg])

// ✅ 목표 — lib 순수함수로 추출, CLI 명령과 MCP 핸들러가 동일 함수 호출
// src/lib/git-session.ts
export function stageAndCommit(cwd: string, msg: string): CommitResult { /* 단일 구현 */ }
// CLI save.ts ─┐
//              ├─→ stageAndCommit()  ← 진실 1개
// MCP server ──┘
```
→ 이미 `src/lib/git-repo.ts`에 `isGitRepo`/`hasCommits`/`getCommitInfo` SoT가 있다. 세션 git 동작도 같은 레이어로 올린다.

### 원리 3 — 불변식을 타입·테스트로 박제한다 (런타임 주석이 아니라)
"이런 일은 절대 안 일어난다"를 주석으로 적지 말고 **컴파일/테스트로 증명**한다. 출력이 대표 사례 — `utils/logger.ts`가 있는데 3파일만 채택, 679곳이 raw `console.log(chalk…)`. 추상화를 만들고 안 쓰면 없는 것과 같다.

```ts
// 출력 SoT 강제 + 회귀 차단 가드 (check-no-raw-console.mjs 패턴)
//  - 신규 console.log(chalk…) 추가 시 머지 차단
//  - logger 경유만 허용 → 조용한 모드·테스트 출력 캡처를 한 곳에서 제어
const RAW = /console\.(log|error)\(\s*chalk/
if (RAW.test(src) && !src.includes('// vhk-allow-raw-output')) fail(file)
```
> 교훈(원리 3의 메타): 가드 자체는 **형태(정규식)가 아니라 행동을 검증**해야 신뢰된다 → 원리 6.

### 원리 4 — 무엇이 검증 안 됐는지 시스템이 안다 (커버리지 분모)
1162 pass는 분자다. 분모(line/branch)가 없으면 "안 짠 경로"가 영영 비가시. **100% 강제는 솔로에 독** — diff-coverage(신규 추가분만 게이트)로 시작한다.

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: { provider: 'v8', reporter: ['text-summary', 'json'],
                exclude: ['**/dist/**', '**/.claude/**'] },
  },
})
// CI: 신규분 무커버리지만 차단 (전체 임계 강제 X)
```

### 원리 5 — 타깃 환경에서 실제로 돈다
주 사용·배포 환경은 **win32**(cmd.exe 시프 분기 코드 + PowerShell UTF-8 함정 이력 존재). 그런데 CI는 ubuntu+Node24 단일 → 그 환경이 한 번도 안 돈다. engines 하한 Node20도 미검증.

```yaml
# ci.yml — 매트릭스. 최소 비용 최고 가치.
strategy:
  matrix:
    os: [ubuntu-latest, windows-latest]
    node: [20, 24]
runs-on: ${{ matrix.os }}
```

### 원리 6 — 가드가 형태가 아니라 행동을 검증한다
check-goal `must()` 381개 중 350개(92%)가 `/.../.test(src)` 소스 정규식. 함수명만 바꿔도 깨지고(거짓음성) import만 해두면 통과(거짓양성). **리팩터링 세금만 크고 보호 신뢰도는 낮다.**

```js
// ❌ 형태 검증 — 함수명 변경에 취약
must(/export function stageAndCommit/.test(src), 'stageAndCommit 존재')
// ✅ 행동 검증 — behavior 테스트로 이전, 가드는 "테스트 존재"만 얇게
must(fs.existsSync('tests/git-session.test.ts'), 'git-session 행동 테스트 존재')
```
→ `tests/goal-drift.test.ts`·`git-repo.test.ts`처럼 이미 behavior 테스트가 있는 항목의 중복 grep 어서션은 제거 대상.

---

## §3. 차원별 갭 → Goal 매핑

| 차원(목표) | 감사 발견(severity · 근거) | Goal |
|-----------|---------------------------|------|
| 툴링 3→4 | 🔴 win32(주 환경) CI 미검증 — ubuntu+Node24 단일(ci.yml:11,20) | **G47 (P0)** |
| 아키텍처 3→4 | 🔴 MCP↔CLI 이중구현 — server.ts:92~291 git 인라인, #150/#152/#161 출하 | **G48 (P0)** |
| 툴링 4→5 | 🔴 정적 린트 0개 — eslint/prettier/biome 부재, CI lint 스텝 없음 | G49 (P1) |
| 테스트 4→5 | 🔴 커버리지 측정 0 — @vitest/coverage-v8 미설치, vitest.config coverage 키 부재 | G50 (P1) |
| 코드 4→5 | 🟠 출력 추상화 미채택 — logger 3파일, raw console 679곳 | G51 (P2) |
| 테스트 4→5 | 🟠 Notion 실API 경로 무테스트 + restore 커맨드 무테스트 | G52 (P2) |
| 거버넌스 4→4.5 | 🔴 가드 정규식 shape(350/381) + 44가드 자동실행 0 | G53 (P2) |
| 제품 3→4 | 🟠 README 버전 드리프트(2.5.0 vs 2.5.1) — version-sync가 README 미검사 | G54 (P2) |

---

## §4. 실행 로드맵·시퀀싱

**원칙: 한 번에 다 시키지 않는다(AI 독주 방지).** 각 Goal = `vhk goal next`로 꺼내 Audit→Plan→Execute + 개별 PR.

```
P0 (독립·고가치, 먼저)
 ├─ G47 win32+Node20 CI 매트릭스   ← 도그푸딩 잡에 matrix만 얹으면 됨, 즉효
 └─ G48 MCP↔CLI 단일 진실원        ← 유일한 구조적 high, 실버그 원천 제거
P1
 ├─ G49 Biome 린트 게이트           ← 베이스라인 1회 커밋 필요
 └─ G50 커버리지 + diff-coverage
P2
 ├─ G51 출력 계층 단일화 (logger SoT)   ⚠️ 핫스팟: 다수 파일·점진
 ├─ G52 테스트 사정거리 (Notion·restore)
 ├─ G53 가드 behavior 이전           ← scripts/* 광범위, 신중
 └─ G54 제품 메타 SoT (README 버전 주입)
```

**충돌 노트:**
- `src/index.ts`·`src/i18n/ko.ts`는 중앙 핫스팟 — 동시 세션 시 worktree 격리.
- G51(출력)은 다수 command 파일 접촉 → 단독 PR·점진 마이그레이션.
- **콜드스타트 RFC 0047**(index.ts 지연로딩)은 index.ts 닿는 작업 전부 머지 후 *마지막 단독 PR*. G47~G54 중 index.ts를 거의 안 건드리므로 병행 가능하나, 0047 실행은 이 로드맵 완료 후.

## §5. 완료 정의
- G47~G50(P0·P1) 머지 시 종합 ~4.3, 아키텍처·툴링 4점 진입.
- G47~G54 전부 머지 시 **기술 4차원 5점 + 제품/거버넌스 4.5 → 가중 종합 ~4.7** 달성.
- 각 Goal의 `check-goal-N.mjs` green + 공통 게이트(typecheck/test/build) 회귀 0가 차원별 완료 신호.
