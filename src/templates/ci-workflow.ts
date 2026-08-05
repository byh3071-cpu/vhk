const FALLBACK_VERSION = 'latest'

function packageSpec(version: string): string {
  const normalized = version.trim()
  const safeVersion = /^[0-9A-Za-z][0-9A-Za-z._+-]*$/.test(normalized)
  return safeVersion && normalized !== '0.0.0' ? normalized : FALLBACK_VERSION
}

export function CI_WORKFLOW_TEMPLATE(version: string): string {
  const vhk = `npx --yes @byh3071/vhk@${packageSpec(version)}`

  return `# 만든 뒤 GitHub Settings → Rules에서 상태 검사 "VHK Gate"를 필수로 지정하세요.
name: VHK Required Check

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  gate:
    name: VHK Gate
    runs-on: ubuntu-latest
    steps:
      - name: 코드 받기
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
        with:
          fetch-depth: 0

      - name: Node.js 준비
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
        with:
          node-version: 22

      - name: 프로젝트 의존성 설치
        shell: bash
        run: |
          if [ -f pnpm-lock.yaml ]; then
            corepack enable
            pnpm install --frozen-lockfile
          elif [ -f yarn.lock ]; then
            corepack enable
            yarn install --frozen-lockfile
          elif [ -f package-lock.json ]; then
            npm ci
          elif [ -f package.json ]; then
            npm install
          fi

      - name: 프로젝트 검증
        run: ${vhk} verify

      - name: 규칙 파일 전파 확인
        run: ${vhk} sync --check

      - name: 연결된 규칙 검사
        run: ${vhk} check

      - name: 공개 경계 검사
        shell: bash
        run: |
          ${vhk} secure scan
          if [ -f package.json ]; then
            npm run boundary:check --if-present
          fi
`
}
