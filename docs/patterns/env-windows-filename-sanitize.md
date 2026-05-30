---
패턴명: ISO 타임스탬프를 파일명에 쓰기 전 Windows 금지문자(:·.)를 sanitize 한다
카테고리: env
출처프로젝트: VHK (vhk-cli)
태그: [windows, filename, cross-platform, iso-timestamp, sanitize, fs, ring-buffer, idempotency, sort-stability]
발견일: 2026-05-31
출처DevLog: docs/log/2026-05-31-safety-batches.md
---

# 패턴: 크로스플랫폼 파일명은 OS 금지문자를 sanitize 한 뒤 쓴다

## 증상

타임스탬프 기반으로 백업/로그/스냅샷 디렉터리·파일을 만들 때, `Date#toISOString()` 결과를 그대로 이름으로 사용하면 Windows(NTFS/exFAT)에서 쓰기가 실패한다.

```ts
const id = new Date().toISOString()        // "2026-05-31T12:34:56.789Z"
fs.mkdirSync(path.join(root, id))          // ❌ Windows
```

```
Error: ENOENT: no such file or directory, mkdir '...\2026-05-31T12:34:56.789Z'
// 또는 EINVAL — 파일명에 ':' 사용 불가
```

- `:` 는 Windows 에서 파일명 금지문자(드라이브 문자/ADS 구분자로 예약). POSIX 에서는 통과하므로 macOS/Linux CI 에서만 녹색, Windows 사용자 환경에서만 깨지는 "내 머신에선 됐는데" 버그가 된다.
- `.` 는 금지문자는 아니지만 확장자 경계로 오인되어, 같은 타임스탬프를 폴더명/파일명으로 재사용할 때 도구가 잘못 자르거나 혼동할 수 있다.

여기에 더해, 타임스탬프 이름을 쓰는 ring buffer(최근 N개 보존) 구조에서 두 가지 2차 결함이 따라온다.

1. **동일-ms 충돌로 인한 데이터 유실** — 같은 밀리초 안에 두 번 저장하면 디렉터리명이 충돌해 첫 백업이 두 번째에 덮여 영구 소실된다.
2. **비멱등 정렬 churn 으로 인한 잘못된 evict** — 충돌 회피 suffix(`-1`, `-2`, …)를 단순 문자열로 정렬하면 `base-1000 < base-999`(렉시컬 뒤틀림)가 되어, 보존 정책이 "오래된 것"으로 오판하고 진짜 최신 백업을 지운다.

## 원인

- 파일시스템마다 파일명 금지문자 집합이 다르다. Windows 예약 문자: `< > : " / \ | ? *`. ISO 8601 타임스탬프는 시:분:초를 `:` 로, 밀리초를 `.` 로 구분하므로 Windows 금지문자를 항상 포함한다.
- 단순 문자열 정렬(`localeCompare`/`<`)은 숫자를 자릿수가 아니라 문자 단위로 비교한다. 그래서 `"-1000" < "-999"`(첫 글자 `1` vs `9`) 가 되어, 1000회 이상 충돌하거나 zero-pad 자릿수를 넘기는 순간 시간순이 무너진다.
- ring buffer 의 `prune` 는 "정렬된 목록의 앞 N개만 남긴다"는 가정에 의존한다. 정렬이 한 번이라도 비멱등하게 뒤틀리면 prune 은 멀쩡한 데이터를 evict 한다.

## 해결

핵심은 **이름을 짓는 순간 OS 금지문자를 정규화**하는 단일 헬퍼를 두고, 모든 경로 생성이 이를 거치게 하는 것. vhk 의 실제 구현(`src/lib/backup.ts`):

```ts
/**
 * 파일시스템 안전 타임스탬프 — ISO 의 ':' '.' 를 '-' 로 치환.
 * ⚠️ Windows 는 파일명에 ':' 를 허용하지 않으므로 raw ISO 를 디렉터리명으로 쓰면 실패한다.
 * 예: 2026-05-30T09:19:17.358Z → 2026-05-30T09-19-17-358Z
 */
export function fsSafeStamp(d: Date): string {
  return d.toISOString().replace(/[:.]/g, '-')
}
```

`-` 로 치환하면 (1) 금지문자가 사라지고 (2) `Z` 로 끝나는 ISO 자릿수 고정 포맷이 유지되어 **렉시컬 정렬 == 시간순**이 보존된다.

**동일-ms 충돌 방지** — 디렉터리가 이미 있으면 zero-pad suffix 로 유니크화:

```ts
export function saveBackup(files: string[], rootDir: string, stamp?: string): BackupInfo {
  // 충돌 방지: 같은 ms(또는 같은 명시 stamp)로 재호출 시 기존 백업을 덮어쓰면 직전 원본이
  // 영구 유실된다. 디렉터리가 이미 있으면 suffix 를 붙여 유니크화(시간순 정렬도 보존).
  const baseId = stamp ?? fsSafeStamp(new Date())
  let id = baseId
  let n = 1
  while (fs.existsSync(path.join(rootDir, BACKUPS_REL, id))) {
    id = `${baseId}-${String(n++).padStart(3, '0')}`
  }
  // ... backupDir 생성 후 존재하는 파일만 구조 보존 복사
}
```

**비멱등 정렬 churn 차단** — suffix 를 문자열이 아니라 숫자로 비교해, zero-pad 자릿수를 넘겨도 시간순을 보장:

```ts
/**
 * 백업 id 정렬 키 — baseId(시간순 ISO 문자열, 'Z' 종료) + 숫자 suffix.
 * 단순 문자열 정렬은 충돌 suffix 에서 base-1000 < base-999 처럼 렉시컬 뒤틀림이 생긴다
 * (zero-pad 도 자릿수 넘으면 재발). 숫자로 비교해 어떤 suffix 폭에서도 시간순을 보장.
 */
function backupOrderKey(id: string): [string, number] {
  const m = /^(.*Z)(?:-(\d+))?$/.exec(id)
  return m ? [m[1], m[2] ? parseInt(m[2], 10) : 0] : [id, 0]
}

export function listBackups(rootDir: string): BackupInfo[] {
  // ...
  return fs.readdirSync(root)
    .filter((e) => fs.statSync(path.join(root, e)).isDirectory())
    .sort((a, b) => {
      const [ba, na] = backupOrderKey(a)
      const [bb, nb] = backupOrderKey(b)
      if (ba !== bb) return ba < bb ? 1 : -1 // base 시간 역순(최신 먼저)
      return nb - na                          // 같은 base 면 suffix 큰(나중) 것 먼저
    })
    .map(/* ... */)
}
```

보존 정책은 이 안정 정렬에만 의존하므로 단순하게 유지된다:

```ts
/** 보존 정책 — 최근 keepN 개만 남기고 오래된 백업 삭제. 삭제한 id 목록 반환. */
export function pruneBackups(keepN: number, rootDir: string): string[] {
  const all = listBackups(rootDir) // 최신순
  const toDelete = all.slice(Math.max(0, keepN))
  for (const b of toDelete) fs.rmSync(b.dir, { recursive: true, force: true })
  return toDelete.map((b) => b.id)
}
```

일반화 규칙:
1. 외부 입력(타임스탬프, 사용자 라벨, 브랜치명 등)을 파일명으로 쓰기 전 **항상 OS 금지문자를 sanitize** 하는 단일 함수를 통과시킨다.
2. 치환 문자는 **정렬 안정성을 깨지 않는 것**(자릿수 고정 포맷이면 `-`)을 고른다.
3. 동일 키 충돌 가능성이 있으면 **유니크 suffix** 로 덮어쓰기를 막는다.
4. suffix 정렬은 **문자열이 아니라 숫자**로 비교한다.

## 적용 조건

- ✅ 타임스탬프/사용자 입력으로 파일·디렉터리 이름을 만들고, Windows를 포함한 다중 OS를 지원할 때
- ✅ 최근 N개만 남기는 ring buffer / 보존 정책이 "정렬 후 앞 N개" 가정에 의존할 때
- ✅ 동일 시각(ms)에 두 번 이상 같은 작업이 일어날 수 있을 때(루프, 배치, 빠른 연속 호출)
- ❌ POSIX 전용 환경이 보장되고 이름이 항상 유일하며 정렬에 의존하지 않을 때(과한 방어)
- ❌ 이름이 라이브러리/OS가 생성하는 안전한 식별자(UUID 등)이고 금지문자가 원천적으로 없을 때

## 검증

vitest 회귀 테스트(`tests/backup.test.ts`)가 sanitize·충돌·정렬 churn 세 결함을 모두 고정한다.

```ts
describe('fsSafeStamp', () => {
  it('콜론·점 제거 — Windows 파일명 금지문자 안전', () => {
    const s = fsSafeStamp(new Date('2026-05-30T09:19:17.358Z'))
    expect(s).not.toMatch(/[:.]/)
    expect(s).toBe('2026-05-30T09-19-17-358Z')
  })
})

// 회귀: 같은 ms 타임스탬프로 연속 백업 시 디렉터리 충돌로 첫 백업이 덮여 영구 유실되면 안 됨.
it('같은 stamp 재호출 → 유니크 디렉터리 (첫 백업 덮어쓰기 방지)', () => {
  write('.cursorrules', 'FIRST')
  const a = saveBackup(['.cursorrules'], dir, '2026-09-09T00-00-00-000Z')
  write('.cursorrules', 'SECOND')
  const b = saveBackup(['.cursorrules'], dir, '2026-09-09T00-00-00-000Z')
  expect(a.id).not.toBe(b.id)
  expect(fs.readFileSync(path.join(a.dir, '.cursorrules'), 'utf-8')).toBe('FIRST')
  expect(fs.readFileSync(path.join(b.dir, '.cursorrules'), 'utf-8')).toBe('SECOND')
})

// 회귀: 문자열 정렬이면 'base-999' > 'base-1001' 로 뒤틀려 pruneBackups 가 진짜 최신을 evict.
it('suffix 4자리 경계도 숫자 정렬 (base-1001 > base-1000 > base-999)', () => {
  const base = '2026-09-09T00-00-00-000Z'
  // base-999 / base-1000 / base-1001 디렉터리 생성 후
  expect(listBackups(dir).map((b) => b.id)).toEqual([
    `${base}-1001`, `${base}-1000`, `${base}-999`,
  ])
})
```
