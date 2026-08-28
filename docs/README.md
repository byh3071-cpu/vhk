# docs/ — 문서 대시보드

> vhk의 모든 기록이 모이는 곳. 무엇이 어디 있는지 이 파일 하나로 찾는다.
> 기록 경로 판단(무엇을 어디에 쓰나)은 [RULES.md §기록 규칙](../RULES.md) 참조.

## 읽는 순서 (처음 온 사람)

1. [../CLAUDE.md](../CLAUDE.md) — 헌법(의례·금지) + 현재 상태
2. [roadmap/2.x-roadmap.md](roadmap/2.x-roadmap.md) — **현 사이클의 원본** (작업 단위·순서·릴리스 종료 조건)
3. [PRD-2.x.md](PRD-2.x.md) — 현 사이클 수용 기준
4. [vhk-big-picture.html](vhk-big-picture.html) — 작업 루프·책임·발행 경계를 한눈에 보는 큰그림
5. [spec.md](spec.md) — `.vhk/` 데이터 규격
6. [ARCHITECTURE.md](ARCHITECTURE.md) — 코드 구조

## 카테고리 맵 (11)

| 폴더 | 목적 | 네이밍 |
|------|------|--------|
| [adr/](adr/) | 의사결정 기록 (패키지·아키텍처·정책) | `ADR-NNN-슬러그.md` |
| [rfc/](rfc/) | 설계·제안 (구현 전 검토) | `NNNN-슬러그.md` |
| [roadmap/](roadmap/) | 계열별 로드맵 — 작업 항목의 원본 | `<계열>-roadmap.md` |
| [troubleshooting/](troubleshooting/) | 에러·해결 과정 | `TS-NNN-슬러그.md` |
| [patterns/](patterns/) | 프로젝트 무관 범용 패턴 | `PAT-NNN-영문명.md` (구: `{카테고리}-{이름}.md`) |
| [audits/](audits/) | 도그푸딩·감사 결과 | 날짜 기반 |
| [evals/](evals/) | 평가·측정 산출물 | 자유 |
| [reference/](reference/) | 외부 참고 자료 정리 | 자유 |
| [superpowers/](superpowers/) | 구현 전 설계 spec | `specs/YYYY-MM-DD-주제-design.md` |
| [context/](context/) | 세션 컨텍스트 스냅샷 | 날짜 기반 |
| [blog/](blog/) | 외부 공개용 글 초안 | 자유 |

### 추적하지 않는 경로

공개 경계 정리(ADR-008 · ADR-010)로 저장소에서 제외됐다. 로컬에만 존재하므로 이 대시보드에서 링크하지 않는다.

| 경로 | 무엇 | 대체 |
|---|---|---|
| `docs/devlog/` | 세션 작업 내역 | Notion Dev Log 또는 로컬 파일 |
| `docs/log/` | 구 세션 dev log | 위와 같음 |
| `goals/` | 작업 단위 카드 (실행 단위) | 원본 = [roadmap/](roadmap/) · 재생성 후 `vhk goal sync` |
| `.vhk/context.md` | `vhk context`가 만든 로컬 맥락 스냅샷 | 원본이 아니며 다시 생성 가능 |

## 루트 문서

- [ARCHITECTURE.md](ARCHITECTURE.md) — 모듈 구조·데이터 흐름
- [spec.md](spec.md) — `.vhk/` 파일 규격 (버전 명시·변경 시 범프)
- [PRD.md](PRD.md) — 제품 요구사항
- [PRD-2.x.md](PRD-2.x.md) — 2.x 계열 요구사항·수용 기준
- [til.md](til.md) — 배움 메모 (가벼운 한 줄들)
- [mcp-evolution.md](mcp-evolution.md) — MCP 0→29 tools 진화 카탈로그
- [vhk-big-picture.html](vhk-big-picture.html) — VHK 작업 루프·책임·발행 경계 큰그림
- [vhk-feature-guide.md](vhk-feature-guide.md) — 기능 안내 (쉬운 말)
- [seo-key-setup.md](seo-key-setup.md) — 검색 노출 설정 절차

## 집행 (governance-v2)

- 실질 코드변경 커밋 시 **오늘자 세션 기록 필수** — `scripts/check-records.mjs` 가 차단 (탈출구 `[skip-record]`)
  - 기록 위치는 **비추적** `docs/devlog/<날짜>-<주제>.md` 다. 공개 경계상 추적하지 않으므로 `git add` 하지 않는다
  - 게이트는 스테이지가 아니라 **파일 존재**로 판정한다 — 추적되지 않는 경로는 git 으로 검사할 수 없기 때문
- 세션 종료 시 미기록 ADR/TS 후보 자동 보고 — `vhk work handoff` (RFC 0051)
- 작업 단위 검사 스크립트 백필 — `vhk goal sync`
