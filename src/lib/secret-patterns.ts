export type SecretSeverity = 'critical' | 'high' | 'medium'

export interface SecretPattern {
  id: string
  name: string
  severity: SecretSeverity
  pattern: RegExp
}

export interface SecretFinding {
  patternId: string
  patternName: string
  severity: SecretSeverity
  file: string
  line: number
  match: string
}

export const SECRET_PATTERNS: SecretPattern[] = [
  {
    id: 'aws-access-key',
    name: 'AWS Access Key',
    severity: 'critical',
    pattern: /AKIA[0-9A-Z]{16}/,
  },
  {
    id: 'aws-secret-key',
    name: 'AWS Secret Key',
    severity: 'critical',
    pattern: /aws_secret_access_key\s*=\s*['"]?[A-Za-z0-9/+=]{40}['"]?/i,
  },
  {
    id: 'private-key',
    name: 'Private Key',
    severity: 'critical',
    pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    id: 'notion-token',
    name: 'Notion Integration Token',
    severity: 'critical',
    pattern: /secret_[A-Za-z0-9]{40,50}/,
  },
  {
    id: 'github-token',
    name: 'GitHub Token',
    severity: 'critical',
    pattern: /ghp_[A-Za-z0-9]{36,}/,
  },
  {
    id: 'openai-key',
    name: 'OpenAI API Key',
    severity: 'critical',
    pattern: /\bsk-(?:proj-|ant-api03-|live-)[A-Za-z0-9_-]{16,}\b/,
  },
  {
    id: 'generic-api-key',
    name: 'Generic API Key',
    severity: 'high',
    pattern: /(?:api[_-]?key|apikey|access[_-]?token)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}['"]?/i,
  },
  {
    // #170: 리터럴 Authorization: Bearer 자격증명. 토큰 문자 클래스가 '$','{' 를 제외하므로
    // ${env:AUTH_HEADER} 같은 환경변수 참조는 매칭되지 않는다(오탐 방지).
    id: 'authorization-bearer',
    name: 'Authorization Bearer Token',
    severity: 'high',
    pattern: /Authorization\s*:\s*Bearer\s+[A-Za-z0-9._\-~+/=]{8,}/i,
  },
  {
    id: 'password-inline',
    name: 'Inline Password',
    severity: 'high',
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/i,
  },
  {
    id: 'jwt',
    name: 'JWT Token',
    severity: 'medium',
    pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  },
]

export function maskSecret(value: string): string {
  if (value.length <= 8) return '****'
  const visible = Math.min(8, value.length - 4)
  return value.slice(0, visible) + '****'
}
