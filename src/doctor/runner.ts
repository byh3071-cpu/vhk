import type { Diagnostic, DiagFn, DoctorOptions, DiagDeps } from './types.js'

// 각 진단을 독립 실행하고 try/catch 로 throw → fail 로 격리: 한 진단이 죽어도 전체는 끝까지 진행.
// Promise.all 로 모으지만, 현재 deps.run(safeExecFile)은 동기라 실제 병렬 가속은 없다
// (Phase 2 에서 run 을 비동기화하면 진짜 병렬이 된다). 지금의 핵심 가치는 throw 격리.
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
