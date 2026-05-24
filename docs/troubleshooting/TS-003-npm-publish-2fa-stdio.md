---
id: TS-003
date: 2026-05-24
project: VHK
category: ux
severity: HIGH
---

# TS-003 — `npm publish` 2FA OTP/Web 인증 프롬프트 미표시

## 증상

```
✖ npm 배포 실패
Command failed: cmd.exe /d /s /c npm.cmd publish --access public
npm notice 📦  @byh3071/vhk@0.8.1
npm notice Tarball Contents
... (Tarball De... 출력 절단)
📦 package.json 버전을 v0.8.0로 복구했습니다.
```

npm이 tarball까지는 만들었으나 OTP/인증 단계에서 사일런트 실패. package.json 자동 롤백.

## 원인

`safeExecFile(stdio: 'pipe')`로 호출 → npm이 사용자에게 OTP 입력 프롬프트 또는 웹 인증 URL을 표시 못 함.

```ts
// 문제 코드
const pubSpinner = ora('npm 배포 중...').start()
const pubResult = safeExecFile('npm', ['publish', '--access', 'public'])
// → npm "Authenticate at: https://..." URL이 stdout pipe로 사용자에게 안 보임
// → 사용자가 인증 못 함 → publish 타임아웃/실패
```

ora spinner가 추가로 stdin/stdout 점유.

## 해결

`safeExecFileStream(stdio: 'inherit')` 사용 + spinner 제거. 사용자에게 인증 안내 메시지 추가.

```ts
console.log(chalk.cyan('\n📤 npm 배포 중...'))
console.log(chalk.gray('   2FA 활성화 시: OTP 6자리 입력 또는 브라우저 인증 URL 클릭 (Windows Hello / PIN 지원)'))
const pubResult = safeExecFileStream('npm', ['publish', '--access', 'public'])
// → npm "Authenticate at: <url>" 그대로 사용자에게 표시
// → 사용자가 URL 클릭 → 브라우저 인증 → publish 자동 완료
```

build/test 단계는 인터랙티브 아니라서 `safeExecFile`(pipe) 유지.

## 적용 조건

- npm registry에 2FA(OTP TOTP 또는 webauthn) 활성화된 계정으로 publish
- 자동화 도구(CI/CD가 아닌 사람이 실행하는 CLI)에서 대화형 인증 필관리자 단계

## 일반화

**대화형 입력(OTP/PIN/Y-N)이 필관리자 단계는 stdio: inherit이 필수**:
- npm publish (2FA)
- git push (SSH passphrase, GitHub credential)
- vercel deploy (인증 URL)
- gh login

ora spinner 등 stdout/stdin 점유 도구는 해당 단계 직전 stop().

## 관련 파일

- `src/commands/publish.ts` (publish 명령)
- `src/lib/exec.ts` (`safeExecFileStream` / `safeExecFile` 구분)

## 참고

- PR #9 (c1c54ea)
- npm 2FA web-based auth: https://docs.npmjs.com/configuring-two-factor-authentication
