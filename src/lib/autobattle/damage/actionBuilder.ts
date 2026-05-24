import {
  type ActorId,
  type ActorIdKey,
  serializeActorId,
} from 'lib/autobattle/types'
import type { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'
import type {
  OptimizerAction,
  OptimizerContext,
} from 'types/optimizer'

// Indexes context.defaultActions by AbilityKind for the slot's primary actor. Memo actor hits
// are reachable via the same actions — characters with summons (e.g. Topaz/Numby) declare the
// summon's hits as part of their own actionDefinition with sourceEntity(MemoEntityName).
export function buildPreBuiltActionsForSlot(
  actorId: ActorId,
  context: OptimizerContext,
): Record<ActorIdKey, Partial<Record<AbilityKind, OptimizerAction>>> {
  const result: Record<ActorIdKey, Partial<Record<AbilityKind, OptimizerAction>>> = {}
  const primaryKey = serializeActorId({ slot: actorId.slot, kind: 'primary' })
  const byKind: Partial<Record<AbilityKind, OptimizerAction>> = {}

  for (const action of context.defaultActions) {
    const kind = action.actionType as AbilityKind
    if (kind == null) continue
    // First declaration wins; an AbilityKind appearing twice in defaultActions would only
    // happen via duplicate actionDeclaration entries — not seen in current characters.
    if (byKind[kind] === undefined) byKind[kind] = action
  }

  result[primaryKey] = byKind
  return result
}
