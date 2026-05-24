import { runAutobattle } from 'lib/autobattle/scheduler/scheduler'
import type { AutobattleWorkerInput } from 'lib/autobattle/worker/autobattleWorkerRunner'
import { Metadata } from 'lib/state/metadataInitializer'

let metadataInitialized = false

export function autobattleWorker(e: MessageEvent<AutobattleWorkerInput>): void {
  if (!metadataInitialized) {
    Metadata.initialize()
    metadataInitialized = true
  }
  const result = runAutobattle(e.data.payload, { buildResolvers: true })
  self.postMessage({ result })
}
