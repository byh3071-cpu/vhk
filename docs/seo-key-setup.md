# SEO 자격증명 발급 가이드 (goals 21~26 실가동 선행)

> 대상: 사이트 운영자(사람 전용 — 콘솔 로그인·2FA 필요라 AI 불가). 소요 ~15분.
> ⚠️ **정직 표기**: 현재 `vhk seo check/submit` 은 scaffold 단계 — 키를 넣어도 실 HTTP 수집은 아직 안 돈다.
> 키 확보가 **실 연동 구현(다음 레그)의 선행 조건**이며, 구현 시 이 키들로 라이브 검증한다.
> 값은 전부 `.env` 에만(커밋 금지 — `vhk secure scan` 이 감시). `.vhk/seo/config.json` 엔 `$변수명` 참조만 저장된다.

## 0. 선행 — `vhk seo init` (터미널 1회, ~2분)

```
cd <프로젝트 루트>
vhk seo init
```
대화형으로 도메인(예: yohan.studio)을 등록하고 `.vhk/seo/config.json` 과 IndexNow 키를 만든다.

## 1. Google — GSC + GA4 (서비스 계정 하나로 둘 다, ~10분)

1. 프로젝트 생성: https://console.cloud.google.com/projectcreate (이름 예: `vhk-seo`)
2. API 2개 활성화(각 페이지에서 "사용" 클릭):
   - Search Console API: https://console.cloud.google.com/apis/library/searchconsole.googleapis.com
   - Analytics Data API: https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com
3. 서비스 계정 생성: https://console.cloud.google.com/iam-admin/serviceaccounts → "서비스 계정 만들기"(역할 불필요) → 만든 계정 → **키 탭 → 키 추가 → JSON** 다운로드.
4. JSON 파일을 **레포 밖** 안전한 곳에 보관 — 예: `C:\Users\<나>\.vhk-secrets\vhk-seo-sa.json`
5. 권한 부여(서비스 계정 이메일 `...@...iam.gserviceaccount.com` 복사해서):
   - **GSC**: https://search.google.com/search-console → 해당 속성 → 설정 → 사용자 및 권한 → 추가(권한: 전체)
   - **GA4**: https://analytics.google.com/ → 관리 → 속성 액세스 관리 → 추가(역할: 뷰어)

## 2. Bing Webmaster (~3분)

1. https://www.bing.com/webmasters 로그인 — 사이트 미등록이면 "GSC 에서 가져오기" 1클릭.
2. 설정(톱니) → **API access** → API key 발급.

## 3. AdSense — 지금 안 함 (의도)

AdSense Management API 는 OAuth 동의 흐름이라 손이 가장 많이 감 — 수익 데이터가 실제로 필요해질 때 별도 진행.

## 4. `.env` 에 넣기

프로젝트 루트 `.env`(없으면 생성 — `.gitignore` 에 이미 등록됨)에 아래 블록 추가, 값 채우기:

```dotenv
# --- VHK SEO (goals 21~26) — 값은 이 파일에만, 커밋 절대 금지 ---
VHK_SEO_GSC_SA_JSON=C:\Users\<나>\.vhk-secrets\vhk-seo-sa.json
VHK_SEO_GA4_SA_JSON=C:\Users\<나>\.vhk-secrets\vhk-seo-sa.json
VHK_SEO_BING_API_KEY=<Bing API key>
VHK_SEO_ADSENSE_TOKEN=
# VHK_SEO_INDEXNOW_KEY 는 vhk seo init 이 생성·안내
```

(GSC/GA4 는 같은 서비스 계정 JSON — 경로 하나를 두 변수에.)

## 5. 확인

```
vhk secure scan     # .env 유출 감시 습관
vhk env-check       # 누락 변수 점검
```

끝나면 AI 세션에 "SEO 키 넣었어" 한마디 — 실 HTTP 연동 구현 + 첫 수집을 이어서 진행한다.
