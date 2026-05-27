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
