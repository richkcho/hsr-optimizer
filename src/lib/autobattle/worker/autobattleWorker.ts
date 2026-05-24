import { createMockDamageResolver } from 'lib/autobattle/damage/damageRunner'
import { runAutobattle } from 'lib/autobattle/scheduler/scheduler'
import type { AutobattleWorkerInput } from 'lib/autobattle/worker/autobattleWorkerRunner'

// Phase B: this worker runs the scheduler against the mock damage resolver. Phase C swaps
// in the real OptimizerContext-backed resolver — at that point the worker will also need to
// Metadata.initialize() the way the optimizer worker does today.
export function autobattleWorker(e: MessageEvent<AutobattleWorkerInput>): void {
  const result = runAutobattle(e.data.payload, { resolver: createMockDamageResolver() })
  self.postMessage({ result })
}
