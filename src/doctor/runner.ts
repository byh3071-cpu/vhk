import type { Diagnostic, DiagFn, DoctorOptions, DiagDeps } from './types.js'

// 진단 병렬 실행(Promise.all). 각 진단을 try/catch 로 감싸 throw → fail 로 격리:
// 한 진단이 죽어도 전체는 멈추지 않고 끝까지 진행한다.
export async function runDiagnostics(
  diags: DiagFn[],
  opts: DoctorOptions,
  deps: DiagDeps
): Promise<Diagnostic[]> {
  return Promise.all(
    diags.map(async (fn): Promise<Diagnostic> => {
      try {
        return await fn(opts, deps)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { name: fn.name || 'diagnostic', status: 'fail', value: '진단 실패', advice: msg.slice(0, 200) }
      }
    })
  )
}
