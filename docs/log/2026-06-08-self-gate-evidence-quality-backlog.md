# 2026-06-08 — self-gate·증거·품질 백로그 (Goal 19 정정 + 42·43·44·45·46 + 27·28)

> append-only dev log. 추가만, 수정·삭제 금지.

## 한 일 (PR 8건, 전부 main 머지)

| Goal | 내용 | PR | 머지 커밋 |
| --- | --- | --- | --- |
| 19 (드리프트 교정) | pattern status NOT_STARTED → DONE | #190 | e59e41f |
| 43 | `vhk goal drift` — goal 상태↔코드 드리프트 게이트 | #192 | c09eb7b |
| 44 | 증거↔커밋 SHA 바인딩 + `vhk verify --check-fresh` | #194 | 890a6e5 |
| 45 | 증거 원장 `.vhk/ledger.jsonl`(git 추적) | #196 | 6c45c89 |
| 46 | git-access 단일 통로화(safeExecFile 통일) | #198 | 83a5de1 |
| 28 | test-first 매핑 게이트 `vhk testmap` | #200 | 02a3f72 |
| 42 (P0) | 릴리즈 준비 게이트 — CHANGELOG 빈/placeholder 차단 | #206 | b48e830 |
| 27 | silent fallback 린트 `check-no-silent-fallback`(리포트 v0) | #207 | 886f13c |

- 우선순위 합의: P1(43·44·45) → P2 일부(46·28·27) → P0(42, 릴리즈 세션 안착 후) 순. 릴리즈 게이트(42)는 publish/ci.yml 충돌 회피로 v2.5.1 발행 후 착수.
- 각 goal: **격리 worktree(origin/main 기준) + pnpm install + dist build → 전체 테스트 0 fail + 전용 게이트 + 도그푸딩 → CI(test+dogfood) green → squash 머지**. 동시 진행 중인 타 세션(릴리즈·mcp·deploy·doctor)과 파일 충돌 0.

## 핵심 결정

- **45 원장 위치** = 카드의 `reports/ledger.jsonl` 대신 `.vhk/ledger.jsonl`. `reports/` 는 디렉터리 통째 gitignore(+`ensureVhkIgnored` 재삽입)라 재추적 불가 → `.vhk/` 루트(특정 파일만 제외)에 둬 자연 추적. 수용기준 동일 충족.
- **46 git 통로** = `git-repo.ts` 직접 `execFileSync('git')` 전부 제거 → `safeExecFile` 경유. exec.ts 에 `cwd`·`trimOutput`·(실패)`stderr` 가산(backward-compatible). `gitOut` 은 raw 보존(porcelain 선행 공백). simple-git 은 diff/log 파싱용으로 유지. mcp/server.ts isGitRepo 통합은 당시 열린 #195 충돌 회피로 follow-up.
- **27 silent fallback** = baseline 스캔 **28건**(대부분 의도적 폴백) → 카드 지침대로 **리포트 전용 v0**(기본 exit 0, `--strict` opt-in) + `// vhk-allow-fallback:` 화이트리스트. check-meta 미연결.
- **28 red→green 증거** = 카드 "(옵션)·[추론]" → v0 deferred(테스트 러너 2회 계측 과투자). 매핑+opt-in 으로 핵심 충족.
- **42 enforcement** = `release.yml`은 태그 후라 늦고 goal게이트는 CI 미연결 → CI `test` 잡에 도는 **vitest 회귀 가드**(repo CHANGELOG placeholder 0)로 enforce. ci.yml 안 건드림.

## 에러·교훈

- **stale 로컬 → 거짓 드리프트 오판**: 첫 세션 시작 시 로컬이 origin/main보다 2커밋 뒤져 Goal 31·32를 드리프트로 오인(실제 #177·#178로 이미 DONE). 진짜 드리프트는 Goal 19 하나. **교훈**: 작업 전 `git fetch` + origin/main 기준 확인. (잘못 만든 #187 폐기.)
- **CI 전 머지 = "base branch policy prohibits"**: PR 직후 `gh pr merge`하면 test+dogfood pending이라 차단됨(정책 우회 아님). **교훈**: `gh pr checks`로 필수 체크 green 확인 후 머지. UNSTABLE(필수 pass+비필수 pending)이면 머지 가능. → 메모리 `feedback_vhk_merge_needs_ci_and_worktree_isolation`.
- **fresh worktree dist 미빌드 → 테스트 MODULE_NOT_FOUND**: safety-guard 등 spawn 기반 테스트가 dist 필요. **교훈**: worktree 테스트 전 `pnpm build` 먼저.
- **porcelain trim 버그**: safeExecFile 의 `out.trim()` 이 `git status --porcelain` 선행 공백(" M file")을 깎아 파싱 깨짐 → `trimOutput:false` 추가. testmap 은 새 디렉터리 collapse 막으려 `--untracked-files=all`.
- **KNOWN_COMMAND_TOKENS 드리프트**: 새 top-level 명령(testmap)은 TOP_LEVEL_COMMANDS + cli-args.ts `KNOWN_COMMAND_TOKENS`(하드코딩 별도 목록) 둘 다 등록해야 NLP 라우터가 안 가로챔. (후자는 드리프트 가드 미적용 — 잠재 개선점.)
- **cleanup glob 사고**: 세션 종료 정리 중 `vhk-wt-*` glob 이 타 세션 worktree `vhk-wt-validate`(detached HEAD b48e830) 물리 디렉터리까지 삭제. 커밋은 git 보존(안전), 미커밋 변경만 손실 가능. **교훈**: worktree 정리는 개별 이름 지정(glob 금지).

## 다음 할 일

- **SEO 21~26** (6개) — GSC/GA4/AdSense/Bing/IndexNow/Notion 외부 API. **인증정보 준비 후** 착수. goal 카드 `NOT_STARTED` → `vhk goal next` 가 이어받음.
- follow-up: mcp/server.ts 로컬 isGitRepo → git-repo SoT 통합(Goal 46 잔여). KNOWN_COMMAND_TOKENS 드리프트 가드.
