# 2026-06-11 — 전수 코드 리뷰 (12차원 멀티에이전트 + P1 전수 검증)

> 리뷰 기준 커밋: `35f66c6` (main, v2.5.1 발행 후 미발행 21건 누적 시점)
> 방법: 읽기 전용 분석 에이전트 12개(정합성 3 · 에러처리 2 · 보안 1 · 리팩토링 1 · 테스트갭 1 · 프롬프트 2 · 문서 1 · DX 1) → P1 전수를 메인 스레드가 코드 정독 + 실측 실행으로 직접 검증.
> finding 총 137건(중복 2건 병합 → 135). 기각 0건, 심각도 강등 3건(A2-01·B1-03·B1-04: P1→P2).

---

## 1. 한눈 요약 (결론 먼저)

**P0(데이터 영구 손상·보안 구멍) = 0건. 코드 기본기는 시니어 기준으로도 우수.**
`any` 0개, `execSync` 위반 0개, 명령 인젝션 경로 없음(전부 argv 배열), 원자 쓰기·백업 설계 양호.

**그러나 P1(잘못된 동작·사용자 오도) 23건 — 3가지 패턴으로 압축됨:**

1. **"한국어로 말하면 엉뚱한 명령이 실행됨"** — 자연어 라우터의 키워드 충돌.
   실측: "컨텍스트 업데이트해줘" → vhk 자가업데이트(`npm update -g`, 확인 없음!), "버전 올려줘" → git 커밋, "검증 실행해줘" → 아이디어 검증 마법사. 13케이스 전부 오라우팅 재현.
2. **"실패했는데 성공했다고 말함" (거짓 성공/거짓 음성)** — 5곳.
   BOM 있는 goal 파일에 `goal done` → 실제 변경 없이 "✅ DONE" / `vhk audit` 파싱 실패 → "🎉 취약점 없음" / recap CLAUDE.md 갱신 무매치 → "✅ 완료" / MCP에서 가드가 차단했는데 "✅" 헤드라인 / restore 실패를 "백업 없음"으로 오진.
3. **"지키라고 만든 가드에 빈틈"** — `vhk secure`가 GitHub fine-grained PAT·Slack·Stripe·Google 등 현대 토큰 7종을 못 잡음(clean 오도), publish 가드가 untracked 신규 소스를 통과시킴(미커밋 코드가 npm latest로 나갈 수 있음 — v2.3.1 사고 변종).

**가장 급한 3가지: ① 시크릿 패턴 보강 ② NLP 오라우팅 픽스 ③ 거짓 성공 5곳 제거.**

---

## 2. 차원별 점수판

| 차원 | P1 | P2 | P3 | 한 줄 평 |
|---|---|---|---|---|
| A1 코어 정합성·MCP | 2 | 4 | 5 | 3자 정합성 자체는 양호, 한글 별칭·HARD_STOP 갭 |
| A2 대형 커맨드 | 2 | 8 | 5 | 원자쓰기 설계 좋으나 적용 비일관(memory 자체구현) |
| A3 중형 커맨드 | 3 | 8 | 4 | 거짓 성공 패턴 집중 발견 |
| B1 에러삼킴 commands | 2 | 5 | 2 | catch 88곳 중 (가)정당 50곳 — 분류 완료 |
| B2 에러삼킴 lib | 0 | 5 | 7 | atomic-write 모범, 원장류 무신호 삼킴만 |
| C 보안 | 1 | 2 | 3 | 인젝션·ReDoS·토큰 평문 저장 없음. 패턴 누락만 |
| D 리팩토링 | 0 | 6 | 4 | 500줄+ 8개, 전부 "lib 추출+re-export" 가능 |
| E 테스트 갭 | 3 | 5 | 4 | "무테스트 51개"는 과대 — 실측 18개 |
| F1 템플릿 프롬프트 | 4 | 4 | 7 | 시드 3종 내용 불일치 → 첫 sync에 규칙 소실 |
| F2 런타임 프롬프트·NLP | 4 | 6 | 4 | 오라우팅 실측 13건 + 프롬프트 누락 |
| G 문서 드리프트 | 2 | 4 | 3 | 버전·tool 수는 일치, CHANGELOG 21건 공백 |
| H DX 자동화 | 0 | 3 | 6 | 파이썬 불필요 결론, 훅·CI 갭 |
| **계** | **23** | **60** | **54** | **137건** |

---

## 3. P1 상세 (전수 직접 검증 완료)

### 3-1. NLP 오라우팅 클러스터 — `src/lib/nlp-router.ts` ✅ 실측 재현

라우터는 "먼저 매칭된 규칙이 이김" 구조인데, 넓은 키워드가 앞순서에 있어 구체적 의도를 가로챈다. tsx로 13케이스 실행해 전부 재현:

| 입력 | 실제 실행 | 기대 | finding |
|---|---|---|---|
| "컨텍스트 업데이트해줘" | **update (자가업데이트)** | context | F2-01 |
| "메모리 업데이트해줘" | **update** | memory | F2-01 |
| "vercel에 올려줘" | **save (git 커밋)** | deploy | F2-02 |
| "버전 올려줘" | **save** | publish | F2-02 |
| "검증 실행해줘" (제품이 권하는 문구!) | **gate (아이디어 마법사)** | verify | F2-03 |
| "목표 검증해줘" / "goal 검증" / "기억 검증" | **gate** | goal check / memory | F2-03·A1-01 |
| "지금 저장해줘" / "배포 어떻게 해" | **status** | save / deploy | F2-04 |
| "기억 저장해줘" | **save** | memory add | F2-08 |
| "중단 정리해줘" / "세션 넘겨줘" | **recap** | work handoff | F2-05(P2) |

특히 F2-01은 `vhk update`가 확인 프롬프트 없이 `npm update -g`를 실행하는 명령이라 위험(NL 가드 미등록). 왜 위험한가: 비개발자가 일상 한국어로 말하는 것이 이 제품의 핵심 가치인데, 그 경로가 의도와 다른 명령을 실행한다.

### 3-2. 거짓 성공 / 거짓 음성 5곳

| ID | 위치 | 무슨 일이 일어나나 | 검증 |
|---|---|---|---|
| A3-02 | `src/lib/goal-frontmatter.ts:186` + `src/commands/goal.ts:371-375` | 읽기(`parseFrontmatter`)는 BOM 제거하는데 쓰기(`updateFrontmatterStatus`)는 안 함 → BOM 있는 goal 파일은 `goal done`이 아무것도 안 바꾸고 "✅ Goal → DONE" 출력 | 코드 확인 — parse측 `stripBom(content)` vs update측 raw `content.match` |
| B1-01 | `src/commands/audit.ts:60` | audit 출력 파싱 실패·미지원 포맷(yarn berry) → 취약점 0으로 집계 → "🎉 취약점이 발견되지 않았습니다!" | 코드 확인 — `catch { return empty }` + total===0 분기 |
| A3-03 | `src/commands/recap.ts:254-263` | CLAUDE.md에서 `- **마지막 업데이트:**` 패턴 replace — 무매치(이 레포 형식은 `**마지막 갱신:**`)여도 "✅ CLAUDE.md 업데이트 완료" | 코드 확인 |
| A1-03 | `src/mcp/server.ts:67` + `src/lib/safety-guard.ts:122-123` | 가드가 비대화형 차단 시 exit 0 → MCP가 "✅ {명령}" 헤드라인으로 보고 (본문에 차단 문구는 있으나 헤드라인이 성공) | 코드 확인 |
| B1-03(P2 강등) | `src/commands/restore.ts:56` | 복원 중 모든 예외를 "백업을 찾을 수 없습니다"로 오진 | 코드 확인 — 희귀 경로라 P2 |

### 3-3. 가드 빈틈 (보안·발행)

| ID | 위치 | 내용 | 검증 |
|---|---|---|---|
| C-01 | `src/lib/secret-patterns.ts:19-82` | 미탐 토큰: GitHub fine-grained `github_pat_`·OAuth `gho_/ghu_/ghs_/ghr_`, npm `npm_`, Slack `xox[bpoas]-`, Google `AIza`, Stripe `sk_live_/rk_live_`, Notion 신형 `ntn_`. `vhk secure`·MCP save 게이트가 이를 "clean"으로 통과시킴 | 파일 전체 정독 — 10패턴 중 해당 7종 부재 확인 |
| A3-01 | `src/commands/publish.ts:154-161` | dirty 가드가 `--untracked-files=no` — untracked 신규 src/*.ts는 빌드에 포함돼 발행되는데 검사 제외. 주석의 "산출물에 영향 없다" 전제가 틀림 | 코드 확인. 부수: A3-04 `git status` 실패 시 clean 간주(fail-open) |
| A2-02 | `src/commands/memory.ts:274` | `memory.json` 쓰기가 고정 `.tmp` 경로 자체구현 — 동시 세션에서 rename 충돌·업데이트 유실 가능. 이미 있는 `atomicWriteFile`(pid+카운터)을 안 씀 | 코드 확인 |
| A2-03 | `src/commands/goal.ts:127` | `goal next`가 next-task.md(상태 SoT)를 스텁으로 전체 덮어씀 — 실제 사고 이력 있음 | 알려진 사고 + 코드 확인 |

### 3-4. 템플릿·문서 P1 (vhk init 생성물 품질)

| ID | 위치 | 내용 |
|---|---|---|
| F1-01 | `src/templates/commands-md.ts:27` | `git add . && git commit` 안내 — PowerShell 5.1에서 파서 에러(자기 헌법에도 명시된 함정). recap.ts는 win32 분기 있음(제품 내 비일관) |
| F1-02·03 | `src/templates/rules-md.ts` | SoT(RULES.md) 시드에 "디자인 Anti-patterns"·"트러블슈팅/TIL" 규칙 부재 — .cursorrules·claude-md 시드에는 있어서 **첫 `vhk sync` 한 번에 해당 규칙 조용히 소실** |
| F1-04 | `src/templates/claude-md.ts:36-40` | 존재하지 않는 `/done` 커맨드 안내 (vhk가 설치하지 않음) |
| G-01 | `CHANGELOG.md:7` | Unreleased "항목 없음" vs 실측 v2.5.1 이후 커밋 37건(feat/fix/perf 21건) — "publish 전 CHANGELOG 대조" 사고 패턴 재현 위험 |
| G-02 | `README.md:36` | "Node.js 20 이상" vs engines `>=22` vs README:217 ">= 22" — 자체 모순 |

### 3-5. 테스트 갭 P1 (버그 아님 — 회귀 무방비 상태)

- **E-01**: secret-patterns 10패턴 중 직접 단위테스트 2개(AWS·ghp)뿐 — regex 수정 시 false-negative 회귀 무방비
- **E-02·03**: MCP save의 시크릿 commit 거부 경로·commit/push 본 플로우 미테스트(HARD_STOP 차단만 테스트됨)
- **중요 정정(E-12)**: 사전 조사의 "무테스트 51개"는 과대 — 실측 결과 doctor·daily·seo·lib 대부분 이미 테스트 존재. 진짜 무테스트는 **18개**(얇은 래퍼 7 + templates 6 + prompt/mcp-index/fetch-prd 등)

---

## 4. P2/P3 전체 목록 (부록 표)

### P2 (60건 — 품질·유지보수)

| ID | 파일:줄 | 제목 |
|---|---|---|
| A1-02 | lib/command-registry.ts:16-17 | `design palette`·`env check` 유령 서브커맨드 → excess-argument 에러 |
| A1-04(+A2-07 병합) | mcp/server.ts:30-38 외 | HARD_STOP 갭 — learn·pattern-detect·evolve-suggest·context·brief·readMemory 영구화·recordLesson 가드 없음 (의도 확정 필요) |
| A1-05 | commands/memory.ts:319-479 | memoryMigrate만 HARD_STOP 가드 누락 |
| A1-06 | mcp/server.ts:655 | MCP update tool이 cli-path fallback 미사용 |
| A2-01(+B1-05 병합) | commands/evolve.ts:178 | 손상 queue.json → 무경고 빈 큐 (.bak 보호는 확인됨 — 복구 안내만 부재) |
| A2-04 | commands/sync.ts:562 | CLAUDE.md 비원자 쓰기 + drift 없으면 백업 미생성 |
| A2-05 | commands/sync.ts:212-217 | vhk:rules 마커 쌍 중복 시 스테일 블록 영구 잔존 |
| A2-06 | commands/sync.ts:53,242,257 | 섹션 파서 코드펜스 미인지 — 펜스 내 `## `에서 오분할, 사용자 콘텐츠 제거 가능 |
| A2-08 | commands/memory.ts:389 외 | 수동 편집으로 tags/id 누락 시 TypeError 크래시 |
| A2-09 | commands/evolve.ts:561 | evolve undo가 apply 후 수동 편집을 무경고 소실 |
| A3-04 | commands/publish.ts:161-162 | dirty 가드 fail-open (git 실패 시 clean 간주) |
| A3-05 | commands/publish.ts:269-282 | 최종 confirm Ctrl+C 시 버전 롤백 누락 |
| A3-06 | commands/work.ts:23-26 | git 실패를 "(변경 없음)"으로 단정 |
| A3-07 | lib/goal-frontmatter.ts:30,38 | 잘린 frontmatter 이중 silent skip |
| A3-08 | commands/review.ts:289-296 | latest.json gates 누락 시 TypeError |
| A3-09 | commands/mission.ts:46-51 | glob `**/`→`.*` 과잉 매칭 |
| A3-10 | commands/init.ts:324-332 | 손상 package.json → 반쪽 초기화 크래시 |
| A3-11 | lib/preflight.ts:17,179 | `mode('publish'/'pr')` dead option |
| B1-03 | commands/restore.ts:56 | 복원 예외 전부 "백업 없음" 오진 |
| B1-04 | commands/evolve.ts:446 | 롤백 실패 삼킨 뒤 "원본 복원됨" |
| B1-06 | commands/publish.ts:189 | publish 실패 시 exitCode 미설정(파일 전체 0회) |
| B1-07 | commands/mcp-init.ts:83 | 손상 mcp.json 백업 없이 덮어쓰기(타 서버 항목 소실) |
| B2-01 | lib/recall-log.ts:29 | recall 로그 기록 실패 무신호 — measure-first 데이터 유실 |
| B2-02 | lib/safety-guard.ts:60 | 감사 원장 기록 실패 무신호 |
| B2-03 | lib/cost-ledger.ts:34 | 손상 라인 skip → 예산 합산 undercount(트립와이어 미발동 가능) |
| B2-04 | lib/git.ts:111 | getSessionDiff가 git 에러를 "변경 0건"으로 바꿔치기 |
| B2-05 | lib/check-secure.ts:64 | 보안 스캔 readdir 실패 서브트리 무신호 제외(거짓 음성) |
| C-02 | lib/exec.ts:25-30 | Windows shim 인자가 cmd.exe 재파싱(잠재 인젝션 — 현재 미악용) |
| C-03 | commands/cloud.ts:178-199 | pull이 원격 파일명 무검증 + config.json(safetyMode) 덮어쓰기 가능 |
| D-01~06 | (아래 §6) | 대형파일 분할 권고 6건 |
| E-04~08 | mcp/server.ts 외 | undo dry-run·정보 핸들러·fetch-prd·secure exitCode·memory-eval 파싱 미테스트 |
| F1-05 | templates/claude-md.ts | init이 vhk:rules 마커 미시드 → 첫 sync가 휴리스틱 경로(오삭제 위험) |
| F1-06 | templates/rules-md.ts:36-38 | 작성자 개인 Notion 설정 하드코딩 |
| F1-07 | templates/commands-md.ts:7 | vitest 전용 `--run`을 무조건 안내 |
| F1-08 | templates/claude-md.ts:3 | `_stack` 미사용 — 생성 CLAUDE.md에 스택 정보 0 |
| F2-05 | nlp-router.ts:332 | recap이 work handoff 가림 |
| F2-06 | commands/work.ts:78 | 시작 프롬프트에 blockers.md·미발행분 누락 |
| F2-07 | commands/work.ts:119-126 | 핸드오프 프롬프트에 dev log append-only 지시 부재 |
| F2-08 | nlp-router.ts:264-268 | memory 제외목록 무력 — "기억 저장해줘"→save |
| F2-09 | commands/diff.ts 외 7파일 | printNextStep 부재(헌법 위반) |
| F2-10 | i18n/ko.ts:71,77 | 비개발자 선언과 달리 git 원어 다수 노출 |
| G-03 | docs/ARCHITECTURE.md | v1.4.0 동결 — "MCP 24 tool" 오기 |
| G-04 | README.md:177-192 | 신규 명령 5종(diff-cover/recall/stats/seo/cost) 미반영 |
| G-05 | docs/state/next-task.md:13 | 상태 SoT가 실측보다 낡음(이슈 1 vs 0) |
| G-06 | COMMANDS.md | 신규 명령군 미반영 |
| H-01 | scripts/check-goal-*.mjs | 61개 스캐폴드 ~65% 중복(4,501줄 중 ~2,900) — `runBaseGate(id)` 통합안 |
| H-02 | (git hooks 부재) | pre-commit(secure scan+정적 가드 3종)·pre-push(tsc) 도입안 — 자체 `.githooks/`+`core.hooksPath` 권장 |
| H-03 | .github/workflows/ci.yml:55-58 | check-no-raw-output·check-no-silent-fallback CI 미배선(회귀 무방비) |

### P3 (54건 — 사소·제안, 대표만 발췌)

| ID | 내용 |
|---|---|
| A1-07~11 | KO_ALIASES 7건 누락 · seo/ref/mission 한글 별칭 전무 · 신규 명령 10종 NLP 미등록 · CLI 경로해석 이중 실행 · MCP 동기 실행(기존 TODO) |
| A2-10~15 | `Number('')→0` 관대 파싱 · latest.json null 크래시 · RULES.md BOM 미제거 · CRLF 혼합 EOL · 서문 드롭 · 중복 룰 pending 고착 |
| A3-12~15 | prerelease 버전 절단 · checkBranch fail-pass · **context.md 생성 문서 오타("고칠 땀")** · cloud pull trailing newline |
| B1-08·09, B2-06~12 | mission 손상 오진 · daily git 실패 무표기 · cloud.json 손상→이중 gist · config 손상 무경고 기본값 · JSONL 리더 공통화 제안 |
| C-04~06 | maskSecret 앞 8자 과다 노출 · 주석 depth 불일치 · secret gist 고지 |
| D-07~10, E-09~12 | evolve/goal 분할 후순위 · worktree 래퍼·템플릿 스냅샷 테스트 |
| F1-09~15 | 체크리스트 동사 부재 · 미존재 AGENTS.md 참조 · frontmatter 불요 토큰 · placeholder 불일치 · "Cursor에게" 열 중립화 · 시드 .cursorrules 배너 부재 |
| F2-11~14 | notGitRepo 4중복·톤 불일치 · "고쳐줘/릴리즈해줘" 미커버 · secure '비밀' 과민 · 시작 프롬프트 SoT 중복 기술 |
| G-07~09 | COMMANDS.md 유령 표기(`memory failure --lesson`) · 표 분절 · LIVE 미발행분 축소 기재 |
| H-04~09 | CI concurrency 미설정 · install+build 중복 · dogfood 신규 명령 미포함 · CodeQL 기본 쿼리만 · .claude/ 훅 0개 · 일회성 허용항목 잔재 |

---

## 5. 즉시수정 Top 10 (이번 세션에서 수정)

1. **시크릿 패턴 7종 추가 + 패턴별 단위테스트** (C-01+E-01) — 보안 가드 본연 기능
2. **NLP 오라우팅 픽스** (F2-01~05·08) — update 동반조건·save 제외목록·gate 축소·status 과민 제거·handoff 순서
3. **goal done BOM 거짓 성공** (A3-02) — update측 stripBom + 변경 검증
4. **audit 거짓 음성** (B1-01) — 파싱 실패 시 "감사 실패(결과 불명)" + exitCode
5. **ref.ts 손상 → 전체 소실** (B1-02) — 손상 경고 + 쓰기 전 .bak
6. **recap 거짓 성공** (A3-03) — 무매치 감지 + 현 형식(`**마지막 갱신:**`) 동시 지원
7. **memory 원자쓰기 통일** (A2-02) — atomicWriteFile 재사용
8. **publish untracked src 가드 + fail-closed** (A3-01+A3-04)
9. **MCP 거짓 ✅** (A1-03) — 비대화형 차단 시 exitCode 설정
10. **템플릿·문서 묶음** (F1-01·04·08 + G-02·07 + F2-06·07 + G-01 CHANGELOG 백필)

## 6. 리팩토링 로드맵 (백로그 — 이번 미수정, 무테스트 파일 리팩토링 금지 원칙)

우선순위(가치/위험): **mcp/server.ts(785줄→tool 그룹 5분할) > memory.ts(recall 엔진 lib 추출) > ko.ts(도메인 6분할, 최저위험) > sync.ts(파서+생성기 추출) > verify.ts > index.ts(register 분리 — 선행조건: safety-coverage.test.ts의 'src/index.ts' 정적 스캔을 glob으로 갱신) > evolve.ts > goal.ts**.
전부 "lib 추출 + commands에서 re-export" 패턴으로 기존 테스트 무수정 생존 가능. D-05 주의: index.ts 분할은 가드 정적 검사 계약 갱신이 핵심 위험.

## 7. 테스트 보강 플랜 (백로그)

1순위 secret-patterns 표 driven(이번 수정에 포함) → 2순위 MCP save/undo 핸들러 단위(L2: child_process mock — #161 check 테스트 패턴 재사용) → 3순위 secure exitCode·memory-eval 파싱·fetch-prd 휴리스틱 → 4순위 templates 스냅샷. mcp/server.ts는 기존 3-레이어(introspect 계약 + 핸들러 단위 + 스모크 1개) 확장으로 충분 — 새 인프라 불필요.

## 8. 프롬프트 개선안 요약

- **시드 템플릿 3종 정합화**(F1-02·03): RULES.md 시드에 디자인 Anti-patterns·트러블슈팅/TIL 추가 — sync 소실 방지
- **init이 vhk:rules 마커를 처음부터 시드**(F1-05) — 휴리스틱 마이그레이션 경로 제거
- **work 시작 프롬프트**: blockers.md 읽기 추가, 핸드오프에 dev log append-only 지시(F2-06·07)
- ko.ts: git 원어에 쉬운 말 병기, notGitRepo 통합(F2-10·11)

## 9. DX 제안 (백로그)

- **파이썬 도입: 불필요 (명시 결론)** — 게이트·CI·도구 100% Node 단일 런타임, Windows 주환경 python 보장 없음, recall 2차 ML도 transformers.js/ONNX로 해결 가능. 런타임 2원화 비용 > 효익.
- **git hooks**: 자체 `.githooks/` + `core.hooksPath`(prepare 스크립트) — pre-commit=secure scan+정적 가드 3종(수 초), pre-push=tsc. test:run은 CI 전담 유지.
- **.claude/ 훅**: ⓐ PreToolUse(Bash)에 HARD_STOP 체크(헌법 의례→하네스 강제) ⓑ SessionStart에 vhk work 상태 주입 ⓒ Stop에 handoff 리마인더(자동 append는 노이즈 위험 — 알림형). 슬래시 커맨드 `.claude/commands/handoff.md`.
- **check-goal 통합**(H-01): `_lib.mjs`에 `runBaseGate(id)` 추출 — 4,501줄→~1,800줄, 템플릿 버그 1곳 수정으로 61개 일괄 반영.
- **CI**: check-no-raw-output·check-no-silent-fallback을 ci.yml에 배선(H-03), concurrency 그룹(H-04), dogfood에 stats/check/recap 추가(H-06), CodeQL security-extended(H-07).

## 10. 부록

- 기각 finding: 0건. 강등 3건: A2-01(.bak 보호 확인)·B1-03·B1-04(희귀 경로) P1→P2.
- 중복 병합 2건: A2-01=B1-05, A1-04≈A2-07.
- 이상 없음 확인(녹색): 명령 인젝션 경로 없음 · ReDoS 위험 패턴 없음 · 토큰 평문 저장 없음 · .env 값 비노출 · 버전/MCP tool 수 문서 일치 · RULES.md→파생 7종 동기 정상 · atomic-write.ts/backup.ts/git-session.ts 에러 처리 모범.
- 원본 finding 전문: 워크플로 산출물(12 에이전트 보고서 원문)은 세션 아카이브에 보존. 본 문서가 검증 반영 최종본.
