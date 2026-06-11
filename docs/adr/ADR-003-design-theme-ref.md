---
id: ADR-003
date: 2026-05-24
status: accepted
tags: [design, cli, backfill]
---

# ADR-003: design/theme/ref 를 CLI 자산 생성기로 도입한다 (v0.8.0)

> ⚠️ **백필**(governance T5, 2026-06-11 작성): CHANGELOG v0.8.0 기반 재구성.
> 당시 토론 기록이 없어 "대안"은 결과 코드에서의 **추정**.

## 맥락 (Context)

vhk 의 대상 사용자는 비개발자 바이브코더 — 디자인 시스템을 직접 구성하기 어렵다.
프로젝트 시작 시 컬러 토큰·다크모드·레퍼런스 관리가 반복 수작업이었다.

## 결정 (Decision)

- `vhk design` — 팔레트 프리셋 4종(Minimal/Vibrant/Corporate/Pastel) 선택 →
  Tailwind config 또는 CSS 변수 토큰 파일 생성. `vhk design-palette` 별칭.
- `vhk theme` — 다크/라이트 CSS + 토글 유틸(getTheme/setTheme/toggleTheme/initTheme) 생성.
- `vhk ref add|list|open` — `.vhk/refs.json` 기반 레퍼런스 URL 관리 + 크로스플랫폼
  브라우저 오픈.
- NL 라우터에 키워드 연결("디자인 토큰 만들어줘" 등). 단 `ref add/open` 은 인자 추출
  인프라 부재로 NL 진입점에서 **의도적 배제** — commander 서브커맨드만.

## 대안 (Alternatives)

1. **외부 디자인 도구 연동(Figma 등)** — (추정) 기각: 비개발자 대상 CLI 의 범위 밖,
   파일 생성이 즉시 가치.
2. **프리셋 없이 자유 입력** — (추정) 기각: 디자인 Anti-pattern(보라-파랑 그라디언트 등)
   규칙과 함께 "안전한 기본값" 철학 채택.

## 결과 (Consequences)

- (+) 프로젝트 초기 디자인 부트스트랩 1분 — 이후 디자인 Anti-patterns 가 RULES.md
  고정 섹션이 됨.
- (−) 대화형 커맨드(design palette/theme)는 MCP 제외 대상으로 남음(TTY 필요) —
  MCP 규칙 "대화형 커맨드 MCP 제외"의 사례.
- `refs.json` 은 spec 1.0 부터 로컬 전용(개인 링크 보호) — `.vhk` 트래킹 정책의 일부.
