---
id: ADR-002
date: 2026-05-24
status: accepted
tags: [mcp, architecture, backfill]
---

# ADR-002: MCP 서버를 CLI 위의 stdio 레이어로 도입한다 (v0.6.0)

> ⚠️ **백필**(governance T5, 2026-06-11 작성): 결정 당시 ADR 부재 — git log·CHANGELOG
> v0.6.0 기반 재구성. "대안" 일부는 코드 정황에서의 **추정**임을 명시한다.

## 맥락 (Context)

v0.5까지 vhk 는 터미널 CLI 전용이었다. 사용자는 Cursor 등 AI 에이전트 안에서
"저장해줘" 같은 자연어로 vhk 기능을 부르고 싶어 했고, MCP(Model Context Protocol)가
에이전트-도구 표준으로 자리잡고 있었다.

## 결정 (Decision)

- `vhk mcp` — **stdio MCP 서버**를 별도 bin(`vhk-mcp`)으로 노출. 첫 8개 tool =
  save/undo/status/diff/ship/doctor/check/recap (CHANGELOG v0.6.0, 2026-05-24).
- `vhk mcp-init` — `.cursor/mcp.json` 자동 생성으로 연동 마찰 제거.
- 보안: MCP `save` 의 shell injection 차단 — git 호출 전부 `execFileSync`(aed5b47).
  이후 "execSync 신규 금지 → safeExecFile" 규칙의 원형이 됨.
- tool 은 CLI 명령을 감싸는 구조 — 이후 v1.x에서 `runVhkCli(args, headline)` 헬퍼로
  표준화되고(goal 0 Phase 3), goal 48 에서 MCP↔CLI 단일 SoT 로 굳어짐.

## 대안 (Alternatives)

1. **CLI 전용 유지** — 기각: 에이전트 시대에 자연어 진입점 부재는 제품 정체성(바이브코딩
   하네스)과 모순.
2. **HTTP/SSE 서버** — (추정) stdio 가 Cursor 로컬 연동의 최소 마찰 경로라 채택.
   포트/방화벽/수명주기 관리가 없는 stdio 가 로컬 CLI 도구에 자연스럽다.
3. **MCP 전면 재작성(CLI 로직 분리)** — 기각(정황): CLI 함수를 재사용하는 래퍼 구조를
   선택해 중복 없이 시작 — 이 선택이 후일 goal 48(단일 SoT)의 토대.

## 결과 (Consequences)

- (+) 8 tools → 29 tools(v2.3)까지 같은 아키텍처로 무파괴 확장.
- (+) CLI=SoT 라 기능 추가 시 MCP 는 등록만 — 단 "4지점 등록" 누락 함정이 생김(후일
  goal 56 가드·체크리스트로 보완).
- (−) 비대화형 제약(TTY 없음)이 모든 커맨드에 전파 — inquirer 호출 금지 규칙,
  goal 11/12(비대화형 가드)로 이어짐.
- 진화 전체 기록: [docs/mcp-evolution.md](../mcp-evolution.md).
