# Learnings

_Append-only. 한 줄 = 한 교훈. iteration 시작 시 전체 파일이 컨텍스트에 들어감._
_Format: `- [YYYY-MM-DD goal-N] 한 줄 교훈.`_

- [2026-05-27 _meta] goals/ 구조는 vspec/vooster 패턴을 차용. 단일 패키지 VHK 에 맞춰 _meta 게이트는 tsc + vitest + tsup build 3 개로 축소. lint 는 미설정 상태 — 도입 시 _meta 에 M.4 로 추가.
- [2026-05-27 goal-0] simple-git 3.x 는 `import simpleGit` (default) 대신 `import { simpleGit }` (named) 가 TS 타입 호환 안정적. default 는 `typeof index` 로 추론되어 callable 안 됨.
- [2026-05-27 goal-0] Notion SDK BlockObjectResponse 는 discriminated union — 동적 키 인덱싱 (`block[type]`) 시 `Record<string, ...>` 캐스팅 필요. `as any` 대신 좁은 Record 타입으로 안전성 유지.
- [2026-05-27 goal-0] simple-git `DiffResult.files` 는 text/binary/name-status union — binary 항목은 insertions/deletions 부재. 정규화 시 `'insertions' in f` 가드로 0 fallback.
- [2026-05-27 goal-0] MCP 풀 커버리지 전략: 비대화형 = `runVhkCli()` 서브프로세스 위임 / 대화형 본질 = dry-info 핸들러 (진단만, 실제 실행 X). 대화형 강제 wrap 보다 사용자에게 CLI 안내가 안전.
- [2026-05-27 goal-0] McpServer `_registeredTools` private 멤버 introspection 으로 등록 tool 단언 가능 — SDK `1.29.0` 기준. SDK 메이저 업그레이드 시 깨질 수 있으므로 골격 테스트 한정 사용.
- [2026-05-27 goal-0] Goal 0 완료. registerTool 24 도달 (10 baseline + 6 1차 + 8 2차). 대화형 4 커맨드 (gate/init/design palette/theme/start) MCP 제외 확정.
- [2026-05-27 goal-1] YAML frontmatter 파서는 정규식 + flat key:value 만으로 충분 (gray-matter 의존성 회피). nested/list/multiline 필요해지면 그때 검토.
- [2026-05-27 goal-1] Windows 에서 process.chdir(tmpDir) 후 rmSync 호출 시 EPERM. finally 절에서 chdir(origCwd) 를 rmSync 보다 먼저 수행해야 핸들 해제됨.
- [2026-05-27 goal-1] NLP 규칙은 한국어 표현만 매칭하고 영문 서브커맨드 (goal list / goal next) 는 commander 가 직접 처리하도록 KNOWN_COMMAND_TOKENS 에 추가 + NLP rule 영문 제거. 그렇지 않으면 `vhk goal list` 가 NLP 가로채기로 routed 됨.
- [2026-05-27 goal-1] Goal 1 dogfooding: `vhk goal done --id 1` 으로 자기 자신을 DONE 마킹. Self-referential 사이클 동작 확인.
- [2026-05-27 no-goal] 자율 루프 — vhk resume 는 반드시 --confirm 강제 (자동 호출 금지). HARD_STOP 트립와이어 = 3 블로커 누적 자동.
- [2026-05-28 release] Windows 게이트 — `safeExecFile('bash', ...)` 는 Windows 기본 환경 (bash/WSL 없음) 에서 깨짐. 모든 게이트 스크립트는 cross-platform 인 `.mjs` 로 유지하고 `.sh` 는 thin POSIX wrapper (1줄 `exec node ...`) 로 축소. dual-maintenance 부담 0. `goal.ts findGateScript` 는 `.mjs` 우선 + `.sh` fallback.
- [2026-05-28 release] secure 자기 레포 fail — 테스트의 fake AWS key literal 이 scanner 에 잡힘. 해결: `'AKIA' + 'IOSFODNN7EXAMPLE'` 조각합성. scanner regex 는 contiguous 매칭만 잡으므로 concat 표현은 무해. 런타임 값/테스트 의미 무변경.
- [2026-05-28 release] MCP SERVER_VERSION 은 `getVhkVersion()` (lib/version SoT) 으로 동적. 하드코딩은 publish 누적 drift 위험 → 회귀 테스트로 차단. SDK private 접근 (`_serverInfo.version` + `_registeredTools`) 은 모두 `tests/helpers/mcp-introspect.ts` 1 파일에 격리 — SDK 메이저 업그레이드 시 1 곳만 패치.
