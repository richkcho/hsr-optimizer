import type { AutobattleInput, AutobattleResult } from 'lib/autobattle/types'
import {
  type BaseWorkerInput,
  type BaseWorkerOutput,
  workerPool,
} from 'lib/worker/workerPool'
import { WorkerType } from 'lib/worker/workerUtils'

export interface AutobattleWorkerInput extends BaseWorkerInput {
  workerType: WorkerType.AUTOBATTLE
  payload: AutobattleInput
}

export interface AutobattleWorkerOutput extends BaseWorkerOutput {
  result: AutobattleResult
}

export function runAutobattleViaWorker(payload: AutobattleInput): Promise<AutobattleResult> {
  const input: AutobattleWorkerInput = {
    workerType: WorkerType.AUTOBATTLE,
    payload,
  }
  return workerPool
    .runTask<AutobattleWorkerInput, AutobattleWorkerOutput>(input)
    .then((output) => output.result)
}
