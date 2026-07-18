# 2026-07-18 — 사람 큐 실행 세트 (위에서부터 순서대로)

> AI 사전작업 전부 완료 상태에서 뽑은 실행 카드. 각 항목 = 네가 할 일만 남김.
> 카드 순서 = 로드맵 임계경로 순. ①②③은 오늘 가능, ④는 게시 타이밍 판단, ⑤는 게시 주간.

## ① PR #505·#504 머지 (예상 5분)

- AI 사전작업: 적대 리뷰 완료 — 판정은 아래 "리뷰 판정" 참조.
- 할 일: 판정 읽고 → 동의하면 채팅에 "505, 504 머지해" (또는 GitHub에서 직접 버튼).
- 링크: https://github.com/byh3071-cpu/vhk/pull/505 · https://github.com/byh3071-cpu/vhk/pull/504

## ② G3 육안 채점 (예상 5분)

- AI 사전작업: 소실됐던 스파이크 스크립트 재생성 + 스모크 통과(`scripts/spike-g3-process-wrap.mjs`).
- 할 일: 터미널에서 아래 실행 → 자식 셸에서 5개 항목 O/X → exit → 결과를 채팅에 말하면 AI가 기록·판정(G3 강행/축소/보류).

```powershell
cd C:\Users\Public\dev\yohan-ecosystem\vhk
node scripts/spike-g3-process-wrap.mjs        # 기본 powershell 래핑. 체크리스트가 화면에 뜸
```

## ③ Recall 라벨 시작 (예상 10분+, 부담 없이 끊어도 됨)

- 할 일: 아래 실행 → 실쿼리 기반 대화형 라벨링. **건수 목표 없음 — 급조 금지가 헌법**(합성은 함정). 몇 개든 실제 판단만.

```powershell
cd C:\Users\Public\dev\yohan-ecosystem\vhk
vhk memory eval --init
```

- 라벨 ≥30 자연 도달하면 RFC 0049 kill-gate 판정이 열림(Phase 4 재료).

## ④ GTM 게시 (판단 = 너, 재료 = 준비 완료)

- **Show HN**: 초안·제목 후보 3·게시 체크리스트·예상 질문 3 → [docs/blog/2026-07-18-show-hn-draft.md](../blog/2026-07-18-show-hn-draft.md)
  - 할 일: 초안 읽고 → 고칠 것 채팅으로 → 게시 타이밍(한국 밤 10시~새벽 1시 권장)에 제출 버튼.
- **블로그(v2.11.0 릴리즈 글)**: 초안 실재 → [docs/blog/2026-07-13-v2.11.0-record-onboarding.md](../blog/2026-07-13-v2.11.0-record-onboarding.md)
  - 할 일: "블로그 발행 준비해줘" 한마디 → studio-post 절차(검증→발행→8채널)는 AI가 안내.
- 게시 1회 집행 = **Phase 2 exit 마지막 조각**.

## ⑤ SEO 키 발급·투입 (게시 주간에)

- 발급 신청(지금 해도 됨): Google Search Console 서비스계정 JSON · GA4 · AdSense API 토큰 · Bing Webmaster API 키.
- 투입: vhk 프로젝트 `.env`에 아래 이름으로 (IndexNow 키는 `vhk seo`가 생성 안내):

```text
VHK_SEO_GSC_SA_JSON=<서비스계정 JSON 경로>
VHK_SEO_GA=<GA4 자격증명>
VHK_SEO_ADSENSE_TOKEN=<AdSense 토큰>
VHK_SEO_BING_API_KEY=<Bing 키>
VHK_SEO_INDEXNOW_KEY=<IndexNow 키>
```

- 투입 후 "vhk seo 실연동 확인해줘" 한마디면 AI가 goals 22–26 scaffold 실연동 검증.

## 리뷰 판정 (① 첨부 — critic 적대리뷰 2026-07-18)

| PR | 판정 | 근거 요약 |
|----|------|-----------|
| **#504** (Cursor sessionStart 슬라이스) | **머지 권고** | 독립·하위호환·전 경로 fail-soft. 잔여위험 = Cursor 훅 상대경로 외부가정 1건(최악이 무음 no-op, 회귀 없음). 머지 후 Cursor 실환경 넛지 1회 육안 권장 |
| **#505** (goal 65 record-net 자가적용) | **머지 권고 (결함 수정 완료)** | 높음 1건 = `.githooks/commit-msg` 실행비트 100644 → Unix에서 훅 무음 미집행. **AI가 100755로 수정·push 완료(8f70e8e)** — CI 재green 확인 후 머지. 경미 2건(HARD_STOP 범위 과잉·hooksPath 무력화 미문서화)은 비차단 기록 |

- 상호 충돌 0(파일·심볼 겹침 없음), main 최신과 드리프트 없음. 순서 무관 — 편한 대로.
- 경미 2건은 후속 백로그감(차단 아님): commitMsgMode의 HARD_STOP 우회문서화 · hooks:install 안내문.
