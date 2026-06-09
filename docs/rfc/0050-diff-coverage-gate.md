# RFC 0050 — diff-coverage: "이번 변경이 테스트로 닿았나" 측정 (measure-first, 게이트는 나중)

> 상태: Draft · 작성: 2026-06-09 · 출처: review.ts:40 자백 + 13-에이전트 감사(RFC 0048 §2 테스트 차원) + recall(RFC 0049) 교훈 이식
> 목적: review/verify의 미측정 가설("기존 테스트가 green이어도 이번 변경을 커버 못 했을 수 있음")을 **측정 가능한 숫자**로 바꾼다. 게이트(차단)·review 통합·CI는 그 숫자가 정당화한 뒤에만.
> 연동: 실행 단위 = `goals/50-coverage-diff-gate.md`. 데이터 = `coverage/coverage-final.json`(v8, 파생·버려도 됨) + `git diff`. git 통로 = `src/lib/git-session.ts`(Goal 48 단일 SoT).

---

## §0. 한 줄 결론

`vhk review`는 "이번 변경이 실제로 테스트에 실행됐는지"를 **모른다**(review.ts:40 스스로 자백). 이걸 **순수 측정 도구**(`vhk diff-cover`)로 먼저 만들어 실제 diff에서 "미검증 변경분(테스트 안 닿은 추가 라인)"을 숫자로 보고한다. 그 숫자가 "구멍이 실재한다"를 증명하면 그때 review 통합·CI 게이트로 승격. **측정 전 게이트 금지** — recall과 동일 규율.

---

## §1. 동기 (실측)

- **review.ts:40 자백**: `git diff 미사용(v0) — 기존 테스트가 green 이어도 이번 변경을 커버하지 못했을 수 있습니다.` → review의 거짓완료 심문에 **구조적 사각지대**. 완료조건이 게이트(test green)에 매핑돼도, 그 test가 이번 변경 라인을 한 번도 실행 안 했을 수 있음.
- **Goal 28 `vhk testmap`은 파일단위만**: 변경 src에 `*.test.ts`가 *존재*하는지만 봄. 파일이 있어도 그 테스트가 새 함수/분기를 *실행*했는지는 모름 → 프록시(존재 ≠ 실행).
- **coverage 측정 전무**: `vitest.config.ts`에 coverage 키 없고 `@vitest/coverage-v8` 부재(확인). 1162 pass는 분자뿐, line 분모 없음 → "안 짠 경로"가 시스템에 비가시.
- **핵심**: "이번 변경이 테스트로 닿았나"는 **결정적으로 계산 가능**(git diff 추가라인 ∩ coverage 미커버라인). ML 0. 측정 블로커 0.

## §2. 원칙 (recall 교훈 이식)

| 관점 | 적용 |
|------|------|
| **measure-first** (카파시) | 게이트부터 짓지 않는다. review.ts:40은 *가설*. 실제 diff에서 미검증 변경분을 숫자로 본 뒤에만 차단/통합 정당. |
| **신호 분리** (Hickey) | "미검증 변경분"을 한 점수로 안 땋음 — 파일별 (추가라인 / 커버된라인 / 미커버 추가라인 / 비율) 4신호 그대로 노출. |
| **과안정화 경계** (헌법) | PR1은 **자문형(advisory)·차단 0**. 실사용 신호가 "구멍 실재"를 보이기 전엔 HARD 게이트 안 만듦(Goal 28과 동일 보수성). |
| **단일 SoT** (Goal 48) | git 라인 질문도 `git-session.ts` 한 곳에 추가 — MCP/CLI 인라인 재구현 금지. |
| **파생 데이터** (Linus) | coverage-final.json은 버려도 되는 파생(진실 = 소스+테스트). 새 영구 상태 안 만듦. |

## §3. 아키텍처 (순수 seam — review.crossCheck 패턴 재사용)

```
git diff --unified=0 HEAD ──▶ git-session.changedLines() ──┐
                                                            ├─▶ diffCoverage()  (순수)  ──▶ 파일별 미검증 변경분
coverage-final.json ──▶ coverage-parse.coveredLinesByFile() ┘
                                                            └─▶ vhk diff-cover (자문 출력)
```

- **`src/lib/git-session.ts` 확장** (단일 SoT): `diffUnified0(cwd)` = `git diff --unified=0 HEAD` (ExecResult). 라인번호 보존 위해 `trimOutput:false`.
- **`src/lib/diff-hunks.ts`** (신규·순수): unified-diff 텍스트 → `Map<파일(rel posix), Set<추가라인번호>>`. `@@ -a,b +c,d @@` 헌트 파싱, `+`(컨텍스트 아닌 추가)만. `isFeatureSource`(test-mapping.ts 재사용)로 src/commands·src/lib만 대상.
- **`src/lib/coverage-parse.ts`** (신규·IO+파싱): v8 coverage-final.json → `Map<파일(rel posix), Set<커버된라인번호>>`. statement `s[k]>0`인 statementMap 라인 펼침. abs경로 → cwd 상대 posix 정규화.
- **`src/lib/diff-coverage.ts`** (신규·**순수**): (추가라인 맵, 커버라인 맵) → 파일별 `{ added, covered, uncoveredNew[], ratio }` + 총계. fs/실시간 부수효과 0 → TDD 쉬움(crossCheck 선례).
- **`src/commands/diff-cover.ts`** (신규): 위를 조립. coverage-final.json 없으면 안내(`pnpm test:run --coverage` 먼저) 후 종료 — **새 coverage 실행 강제 안 함**(명령은 빠르고 결정적, 무거운 coverage run은 명시적).

**경계 질문(각 단위)**: diff-hunks=텍스트→라인집합(git 모름). coverage-parse=json→라인집합(diff 모름). diff-coverage=두 집합 교차(IO 모름·순수). command=조립+출력. 서로 내부 안 봐도 됨.

## §4. PR1 스코프 (측정 전용 — 차단 0)

1. **coverage 인프라**: `@vitest/coverage-v8@^4.1.7`(vitest 동일 버전) devDep + `vitest.config.ts` coverage 블록 (provider `v8`, reporter `['text-summary','json']`, exclude `dist`·`.claude`·`tests`·`*.config.*`). `pnpm test:run --coverage`로 `coverage/coverage-final.json` 생성.
2. **순수 모듈 3종 + git-session 확장** (§3) — 전부 TDD(red→green).
3. **`vhk diff-cover` 자문 명령**: HEAD 대비 변경된 기능소스별로 "추가 N라인 중 M라인 미검증" 출력. 차단·exit1 없음(advisory). 4지점 명령 등록(메모리: CONTAINER_ALIASES + 한글별칭 — 단 diff-cover는 서브커맨드 없는 단순명령이라 표준 등록).
4. **도그푸딩 측정**: 최근 실제 diff(예: 이 RFC 작업 자체)에 돌려 "미검증 변경분 비율" 실측 → dev log 기록. **이게 PR2를 거는 숫자.**

**비목표(PR1 OUT)**: review/verify 통합, CI 게이트, 차단, 임계 강제, 브랜치(vs origin/main) diff, 라인 정밀 reporter(html).

## §5. PR2 결정 잠금 (recall Kill-gate 방식)

PR1 도그푸딩 실측이 아래를 보이면 **그때만** 승격:
- **승격 신호**: 실제 작업 diff들에서 미검증 변경분이 반복적으로 유의미(추가 로직 라인이 테스트에 안 닿고 통과). → ① review.ts:40 자백 제거 + verify가 diffCoverage를 증거로 기록 + review가 "미검증 변경분 N라인"을 새 gap/suspicion 분류 ② CI Summary 노출 + 신규분 무커버 경고(차단은 여전히 opt-in, Goal 28 패턴).
- **기각 신호**: 실측 미검증 변경분 ≈ 0 (이미 TDD로 다 닿음). → "구멍은 이론적" 문서화하고 **중단**(YAGNI). coverage 리포트는 가시성으로만 남김.
- 잠긴 PR2 설계(승격 시 부활): verify 증거스키마에 `diffCoverage` 필드, review confidence 캡 규칙에 "미검증 변경분>0 → high 금지", CI diff-coverage Summary.

## §6. 범위

- **IN (PR1)**: coverage 인프라 + 순수 측정 3모듈 + git-session 라인 확장 + `vhk diff-cover` 자문 + 도그푸딩 실측.
- **OUT**: 차단/HARD 게이트(측정 전), review/verify 통합(PR2), CI 배선(PR2), 전체 100% 강제(솔로 부담·Goal 50 명시), 커밋 단위 "정말 먼저 썼나" 증명(Goal 28 OUT 답습).

## §7. 위험 / 엣지

- **추적 안 된 새 파일**: `git diff HEAD`에 안 잡힘 → "추적 안 됨(git add 후 재측정)"으로 별도 경고. PR1은 fully-new 라인 계산 안 함(정직).
- **sourcemap 좌표**: v8 provider는 coverage-final.json에 **소스(TS) 좌표**로 기록(vitest 기본 sourcemap) — 빌드 산출물 좌표 아님. 구현 시 실측 1회 확인(샘플 파일 라인 대조).
- **경로 정규화**: git(rel posix) ↔ coverage(abs) 불일치가 매칭 실패의 1순위 버그원 → `toPosix` + cwd 상대화 단일화, 매칭 0건이면 명시 경고(조용한 거짓 100% 금지).
- **성능**: coverage run은 plain test보다 느림 → 명령은 기존 리포트 *읽기만*. 리포트 신선도(파일 mtime) 노출, 오래되면 재생성 권장.
- **빈 diff / 리포트 부재**: 각각 "변경 없음" / "리포트 없음(먼저 --coverage)" 안내 후 exit 0.

## §8. 수용 기준 (PR1)

- `pnpm test:run --coverage` → `coverage/coverage-final.json` 생성.
- `vhk diff-cover`가 변경 기능소스별 미검증 변경분 정확 보고(순수 모듈 단위테스트 + 실제 diff 스모크로 검증).
- 경로 매칭 0건일 때 거짓 "100% 커버" 대신 경고.
- 공통 게이트(build·typecheck·test·secure) 통과, 회귀 0.
- 도그푸딩 실측치 dev log 기록(PR2 결정 입력).
