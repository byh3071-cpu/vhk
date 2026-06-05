import { spawnSync } from 'node:child_process'

// 외부 의존성 없이 OS 기본 도구로 클립보드에 복사한다.
// 성공 시 true, 어떤 경로도 실패하면 false (호출자가 화면/파일 폴백 책임).
// safeExecFile(exec.ts) 은 stdin(input) 을 지원하지 않으므로 spawnSync 를 직접 쓴다.
export function copyToClipboard(text: string): boolean {
  try {
    if (process.platform === 'win32') return copyWin32(text)
    if (process.platform === 'darwin') return runWithInput('pbcopy', [], text)
    // linux/기타 — 사용 가능한 첫 도구 (Wayland → X11 순)
    return (
      runWithInput('wl-copy', [], text) ||
      runWithInput('xclip', ['-selection', 'clipboard'], text) ||
      runWithInput('xsel', ['--clipboard', '--input'], text)
    )
  } catch {
    return false
  }
}

// Windows: clip.exe 는 입력을 콘솔 코드페이지로 해석해 한글이 깨지기 쉽다.
// 대신 PowerShell Set-Clipboard 에 텍스트를 base64(UTF-8)로 안전 전달한다.
// base64 는 ASCII 라 따옴표·개행 인자 오염이 없고, 한글은 UTF-8 바이트로 보존된다.
// base64 는 -Command 인자가 아니라 stdin 으로 흘려보낸다 — 명령줄 32K 길이 한계를 우회
// (변경 파일 수백 개로 프롬프트가 커져도 복사 성공). Set-Clipboard 는 Windows PowerShell 5.1+ 내장.
function copyWin32(text: string): boolean {
  const b64 = Buffer.from(text, 'utf8').toString('base64')
  const psScript =
    '$b=[Console]::In.ReadToEnd();' +
    '$t=[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($b));' +
    'Set-Clipboard -Value $t'
  const r = spawnSync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', psScript],
    { input: b64, encoding: 'utf8', windowsHide: true }
  )
  return r.status === 0 && !r.error
}

// stdin 으로 텍스트를 흘려보내는 클립보드 도구(pbcopy/xclip/xsel/wl-copy) 호출.
// 명령이 없으면(ENOENT) r.error 가 설정된다 → status 0 + error 없음만 성공으로 본다.
function runWithInput(cmd: string, args: string[], input: string): boolean {
  const r = spawnSync(cmd, args, { input, encoding: 'utf8' })
  return r.status === 0 && !r.error
}
