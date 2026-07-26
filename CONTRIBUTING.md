# VHK에 기여하기

이슈와 풀 리퀘스트를 환영합니다. 큰 동작 변경은 구현 전에 이슈로 의도와 호환성 범위를 먼저 맞춰 주세요.

## 개발 환경

Node.js 22 이상과 pnpm을 사용합니다.

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd run typecheck
pnpm.cmd run lint
pnpm.cmd run test:run
pnpm.cmd run build
pnpm.cmd run boundary:check
```

코드는 TypeScript strict를 유지하고, 새 CLI 명령은 영문·한국어 별칭과 명령 레지스트리·문서·테스트를 함께 갱신해 주세요. 공개 변경에는 개인 저장소명, 로컬 절대경로, 토큰 또는 개인 운영 기록을 넣지 마세요.

커밋 메시지는 `feat:`, `fix:`, `refactor:`, `docs:`, `chore:` 중 하나로 시작합니다. 보안 취약점은 공개 이슈 대신 [보안 정책](SECURITY.md)의 비공개 제보 경로를 이용해 주세요.
