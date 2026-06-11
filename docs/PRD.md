# PRD — vhk

## 한 줄 정의
바이브코딩 풀사이클 CLI — AI 코딩 세션을 목표·증거·기억·규칙으로 묶는 한국어 도구.

## 문제 (Problem)
- AI 코딩 세션은 세션이 끝나면 맥락이 증발한다 — 다음 세션이 "어디까지 했지"부터 다시 시작.
- 규칙 파일이 도구마다 따로 논다(.cursorrules·CLAUDE.md·AGENTS.md…) — 한 곳을 고치면 나머지가 드리프트.
- AI의 "완료" 주장에 증거가 없다 — 게이트 없이 done 처리되면 거짓완료가 쌓인다.
- 비개발자 사용자는 영어 CLI·전문용어 장벽에 막힌다.

## 해결 (Solution)
세션 의례(work/handoff) + 규칙 단일소스(RULES.md→sync) + 증거 게이트(goal/check/verify) +
프로젝트 기억(memory/recall)을 하나의 한국어 CLI로 묶는다. MCP 29 tools로 에이전트에서도 동일 동작.

## v1 IN (필수 기능)
| # | 기능 | 설명 | 우선순위 |
|---|------|------|----------|
| 1 | 규칙 동기화 | RULES.md 단일소스 → 8개 도구 규칙 파일 생성(vhk sync) | P0 |
| 2 | goal 체계 | goals/ 카드 + 게이트 스크립트 + 드리프트 검증(vhk goal/check) | P0 |
| 3 | 세션 의례 | vhk work(시작 프롬프트)·work handoff(인수인계) 클립보드 | P0 |
| 4 | 프로젝트 기억 | memory 4버킷·learn·recall (.vhk/memory.json) | P1 |
| 5 | MCP 서버 | CLI와 단일 SoT 29 tools(vhk-mcp) | P1 |

## v1 OUT (명시적 제외)
- GUI/웹 대시보드 (CLI·MCP 전용)
- 영어 외 다국어 i18n (한국어 우선)
- 클라우드 호스팅 동기화 서버 (gist 백업으로 충분)

## 화면 인벤토리
| 화면 | 핵심 요소 |
|------|----------|
| 터미널 CLI | 한국어 별칭·printNextStep 다음 행동 안내·게이트 결과 |
| MCP (에이전트 내) | runVhkCli 헬퍼 경유 동일 출력 (비대화형) |

## 성공 지표
- 세션 시작→작업 재개까지 1분 이내 (vhk work 프롬프트 1회 붙여넣기)
- 규칙 드리프트 0 (check-rules-sync 게이트 green 유지)
- 거짓완료 0 (DONE 전이는 게이트 통과시에만 — goal43·meta M.4)

> 이 PRD는 governance T4에서 빈 템플릿(__FILL__)을 실내용으로 채운 것 — 사실값(버전·테스트 수)은
> package.json·CHANGELOG가 SoT.
