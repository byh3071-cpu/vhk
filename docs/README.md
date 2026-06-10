# docs/ — 문서 대시보드

> vhk의 모든 기록이 모이는 곳. 무엇이 어디 있는지 이 파일 하나로 찾는다.
> 기록 경로 판단(무엇을 어디에 쓰나)은 [RULES.md §기록 규칙](../RULES.md) 참조.

## 읽는 순서 (처음 온 사람)

1. [../CLAUDE.md](../CLAUDE.md) — 헌법(의례·금지) + 현재 상태(LIVE)
2. [spec.md](spec.md) — `.vhk/` 데이터 규격
3. [ARCHITECTURE.md](ARCHITECTURE.md) — 코드 구조
4. [state/next-task.md](state/next-task.md) — 지금 할 일 (상태 SoT)
5. [../goals/README.md](../goals/README.md) — 62개 goal 인덱스(자동 생성)

## 카테고리 맵 (9)

| 폴더 | 목적 | 네이밍 |
|------|------|--------|
| [adr/](adr/) | 의사결정 기록 (패키지·아키텍처·정책) | `ADR-NNN-슬러그.md` |
| [rfc/](rfc/) | 설계·제안 (구현 전 검토) | `NNNN-슬러그.md` |
| [log/](log/) | 세션 dev log (append-only) | `YYYY-MM-DD-작업명.md` |
| [troubleshooting/](troubleshooting/) | 에러·해결 과정 | `TS-NNN-슬러그.md` |
| [patterns/](patterns/) | 프로젝트 무관 범용 패턴 | `PAT-NNN-영문명.md` (구: `{카테고리}-{이름}.md`) |
| [state/](state/) | 상태 SoT (next-task·blockers) | 고정 파일명 |
| [superpowers/](superpowers/) | 구현 전 설계 spec | `specs/YYYY-MM-DD-주제-design.md` |
| [context/](context/) | 세션 컨텍스트 스냅샷 | 날짜 기반 |
| [blog/](blog/) | 외부 공개용 글 초안 | 자유 |

## 루트 문서

- [ARCHITECTURE.md](ARCHITECTURE.md) — 모듈 구조·데이터 흐름
- [spec.md](spec.md) — `.vhk/` 파일 규격 (버전 명시·변경 시 범프)
- [PRD.md](PRD.md) — 제품 요구사항
- [til.md](til.md) — 배움 메모 (가벼운 한 줄들)
- [mcp-evolution.md](mcp-evolution.md) — MCP 0→29 tools 진화 카탈로그 (T5 백필)

## 집행 (governance-v2)

- 실질 코드변경 커밋 시 오늘자 dev log 필수 — `scripts/check-records.mjs`가 차단 (탈출구 `[skip-record]`)
- 세션 종료 시 미기록 ADR/TS 후보 자동 보고 — `vhk work handoff` (RFC 0051)
- goal 인덱스 재생성 — `node scripts/gen-goals-index.mjs`
