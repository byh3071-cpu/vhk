---
패턴명: 대화형 인증 단계는 stdio inherit 필수 (spinner 중단)
카테고리: ux
출처프로젝트: VHK (vhk-cli)
태그: [npm, 2FA, OTP, WebAuthn, child_process, ora, spinner, UX]
발견일: 2026-05-24
출처DevLog: docs/log/2026-05-24-v0.8-release.md
---

# 패턴: 대화형 인증 단계는 `stdio: inherit` 필수 (spinner 중단)

## 증상

자동화된 CLI에서 `npm publish` / `git push` / `vercel deploy` 등 호출 시 사일런트 실패:

```
✖ npm 배포 실패
Command failed: cmd.exe /d /s /c npm.cmd publish
npm notice 📦  package@1.0.0
npm notice Tarball Contents
... (출력 절단)
```

빌드는 됐고 tarball도 만들었으나 인증 단계에서 멈춤.

## 원인

자식 프로세스를 `stdio: 'pipe'`로 호출 → 인증 프롬프트(OTP 6자리 또는 웹 URL)가 사용자에게 안 보임. ora spinner까지 켜져 있으면 더 가려짐.

```ts
// 문제 코드
const spinner = ora('배포 중...').start()
const result = safeExecFile('npm', ['publish'])
// → npm: "Authenticate at https://..." URL을 stdout pipe로 흘려보냄
// → 사용자 화면엔 spinner만 → 인증 못 함 → 타임아웃/실패
```

## 해결

인터랙티브 단계 직전 spinner 중단 + `stdio: 'inherit'` 사용. 사용자에게 안내 메시지 명시.

```ts
console.log(chalk.cyan('\n📤 npm 배포 중...'))
console.log(chalk.gray('   2FA 활성화 시: OTP 6자리 입력 또는 브라우저 인증 URL 클릭 (Windows Hello / PIN 지원)'))
const result = safeExecFileStream('npm', ['publish', '--access', 'public'])
// → npm "Authenticate at: <url>" 그대로 표시
// → 사용자 URL 클릭 → 브라우저 인증 → publish 자동 완료
```

`safeExecFileStream`:
```ts
function safeExecFileStream(cmd: string, args: string[]) {
  return execFileSync(cmd, args, { stdio: 'inherit' })
}
```

## 핵심 원리

**Stdin/stdout 점유하는 도구(spinner, progress bar)는 인터랙티브 자식 프로세스와 충돌한다.**

자식이 stdin 읽기 또는 stdout 쓰기 필관리자 단계:
- 비밀번호/passphrase 입력
- 2FA OTP TOTP 코드
- WebAuthn / Windows Hello 인증 URL
- Y/N 확인
- 파일 충돌 해결 prompt

→ 모두 stdio inherit, spinner 끄기.

## 적용 조건

- ✅ npm publish (2FA 활성화 계정)
- ✅ git push (SSH passphrase, GitHub credential prompt)
- ✅ vercel deploy / netlify deploy (브라우저 인증 URL)
- ✅ gh auth login
- ✅ aws / gcloud 인증 명령
- ⚠️ CI/CD 환경 — env 변수로 자격증명 주입 (인터랙티브 없음)
- ❌ 비대화 빌드/테스트/lint — stdio:pipe로 출력 캡처 OK

## 결정 규칙

각 자식 프로세스 호출 시 자문:
1. "이 명령은 사용자 입력이 필관리자가?" → YES면 inherit
2. "이 명령은 사용자가 봐야 할 URL/코드를 출력하는가?" → YES면 inherit
3. "긴 빌드/배포 로그 실시간으로 보고 싶은가?" → YES면 inherit (UX 개선)
4. 그 외 (결과만 필요) → pipe

## 검증

수동 검증 (자동화 어려움):
```powershell
# 2FA 활성화 계정으로 publish
npm publish
# → "Authenticate at: https://..." URL 출력 확인
# → 클릭 → 브라우저 인증 → 자동 진행 확인
```

## 참고

- npm 2FA web-based auth: https://docs.npmjs.com/configuring-two-factor-authentication
- Node child_process stdio docs: https://nodejs.org/api/child_process.html#optionsstdio
