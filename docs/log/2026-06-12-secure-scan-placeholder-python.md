# 2026-06-12 secure scan placeholder/Python 회귀 수정

## 증상

- `.env.example`의 `your_*_api_key_*` 예시 값이 HIGH 시크릿으로 오탐됐다.
- `missing_api_key` 같은 상태 객체 키가 Generic API Key로 오탐됐다.
- Python 파일의 실제 `api_key` 리터럴은 검사 확장자에서 빠져 미탐됐다.

## 수정

- `.py`를 프로젝트 시크릿 스캔 대상에 추가했다.
- Generic API Key 패턴에 식별자 경계를 추가했다.
- Generic 패턴에 한해 대입값의 명시적 placeholder와 상태 키 접두사를 제외했다.
- placeholder 단어가 변수명에만 있는 실제 키는 계속 탐지하도록 했다.
- 예시 env, 상태 객체, 실제 generic key, Python 파일 스캔 회귀 테스트를 추가했다.

## 검증

- `npm run test:run -- tests/scan-files.test.ts -t "Python" --maxWorkers=1 --no-file-parallelism`
- `node node_modules/vitest/vitest.mjs run tests/scan-secrets.test.ts -t "generic|Python" --maxWorkers=1 --no-file-parallelism`
- `npm run test:run -- tests/secure.test.ts --maxWorkers=1 --no-file-parallelism`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `node dist/index.js secure scan`
