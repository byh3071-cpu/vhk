---
문서종류: reference
제목: 정적 웹·프로필 스타터킷 — 아이콘·폰트·스택·인터랙션
출처프로젝트: my-profile-site (YOHAN'S CAFÉ & CODE)
검증: Playwright 헤드리스 (2026-07-02)
태그: [web, starter-kit, frontend, tailwind, lucide, simple-icons, icons, fonts]
---

# 정적 웹·프로필 스타터킷

> 새 **정적 웹/프로필/랜딩**을 만들 때 처음부터 정하지 말고 이 검증된 스펙을 재사용한다.
> 빌드 도구 없이 브라우저에서 바로 도는 정적 원페이지(HTML + Tailwind CDN + Vanilla JS)용.
> Next.js 앱은 스택 사전의 Next.js 조합을 쓰고, 이 킷은 경량 정적 사이트 전용.

## CSS 프레임워크

| 항목 | 값 | 비고 |
| --- | --- | --- |
| Tailwind | CDN `cdn.tailwindcss.com/3.4.17` | **버전 고정**(latest 태그 드리프트 방지). `darkMode:'class'` |
| 커스텀 팔레트 | 프로젝트별 12단계(50~950) + 보조색 | Tailwind config `theme.extend.colors` |
| 프로덕션 주의 | CDN은 콘솔에 "not for production" 경고 | 트래픽 사이트는 Tailwind CLI 빌드 또는 Next.js 이관 |

## 폰트

| 용도 | 폰트 | CDN |
| --- | --- | --- |
| 한글 UI | Pretendard Variable v1.3.9 (dynamic subset) | `cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css` |
| 모노 악센트 | JetBrains Mono | Google Fonts |

## 아이콘 — 검증된 오픈소스만 (이모지·수제 SVG 금지)

### Lucide v1.23.0 (라이선스: ISC)

- 방식: 공식 SVG 원본을 `<symbol id="i-...">` 스프라이트로 **HTML에 인라인** → 런타임 의존성 0, CDN 실패 리스크 0.
- 사용: `<svg class="h-5 w-5"><use href="#i-coffee" /></svg>`
- 원본: `cdn.jsdelivr.net/npm/lucide-static@1.23.0/icons/<name>.svg`
- ⚠️ Lucide 1.x는 브라우저 `<script>`(UMD) 번들이 **없음** → 인라인 스프라이트가 정답.

### Simple Icons v15 (라이선스: CC0)

- 방식: 브랜드/기술 로고를 jsDelivr `<img>` + `onerror`로 로드 실패 시 자동 숨김.
- 원본: `cdn.jsdelivr.net/npm/simple-icons@15/icons/<slug>.svg`
- 검증 slug: `html5, css, javascript, typescript, react, nextdotjs, tailwindcss, nodedotjs, vercel, github, claude, modelcontextprotocol, git, mdx`
- ⚠️ **PowerShell 로고는 Simple Icons에서 제거됨**(트레이드마크, 404) → Lucide `terminal`로 대체.

## 재사용 인터랙션 패턴

| 패턴 | 요약 |
| --- | --- |
| 모드 게이트 | `html.dark` 클래스 하나로 테마+콘텐츠 동시 전환(`.day-only`/`.night-only`). JS는 클래스 토글만 |
| 시간 자동 모드 | 저장값 없으면 현지 시간대로 초기 모드, 수동 전환은 localStorage |
| 롤러 셔터 전환 | `repeating-linear-gradient` 슬랫 오버레이 `translateY` 하강/상승, 방향별 이징 |
| 3D 플립 | `preserve-3d` + `rotateY(180deg)` + `backface-visibility:hidden` |
| 스크롤 리빌 | IntersectionObserver로 `.reveal` opacity/translate, `transition-delay` 스태거 |
| 접근성 | 모든 연출 `@media (prefers-reduced-motion: reduce)`에서 즉시 폴백 |
| 클립보드 복사 | `navigator.clipboard` + `execCommand` 폴백 + 토스트 |

## 검증 (Playwright — Chrome 확장 대체)

- `npx -y playwright install chromium` → 헤드리스로 전환·리빌·클립보드·reduced-motion·콘솔에러 자동 점검.
- GIF 녹화: Playwright `recordVideo`(webm) → `ffmpeg-static`(npx 캐시)로 변환. **Playwright 번들 ffmpeg는 gif 먹서가 없어 사용 불가.**
- 한글 경로는 ffmpeg에 직접 넘기면 확장자 인식 깨짐 → ASCII 경로로 출력 후 Node `fs.copyFileSync`로 이동.

## 관련

- 소스 프로젝트: `my-profile-site` — 로컬 인프런 실습 프로젝트 (GitHub 미등록, STACK-KIT.md 원본)
- Notion: 바이브코딩 스타터킷 › reference/ › 정적 웹·프로필 스타터킷
- 관리자 MCP: `memory:ingest` id `web-static-starter-kit`
