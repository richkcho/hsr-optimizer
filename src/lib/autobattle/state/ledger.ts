import {
  type ActorId,
  type ActorIdKey,
  type DamageLedger,
  serializeActorId,
} from 'lib/autobattle/types'
import type { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

export function createLedger(): DamageLedger {
  return {
    byActorBySource: {},
    totalsByActor: {},
    grandTotal: 0,
  }
}

export function addDamage(ledger: DamageLedger, actor: ActorId, source: AbilityKind, dmg: number): void {
  if (dmg <= 0) return
  const key: ActorIdKey = serializeActorId(actor)
  const sources = ledger.byActorBySource[key] ??= {}
  sources[source] = (sources[source] ?? 0) + dmg
  ledger.totalsByActor[key] = (ledger.totalsByActor[key] ?? 0) + dmg
  ledger.grandTotal += dmg
}
