import type { ActiveBuff, ActorId, BattleState, SlotIndex } from 'lib/autobattle/types'
import type { OptimizerAction } from 'types/optimizer'

// Flips teammateN.characterConditionals flags on the actor's OptimizerAction based on the live
// buff registry. This reaches the dynamic-conditional path inside calculateComputedStats, but
// it does NOT re-run the static precomputeMutualEffectsContainer hooks — those are baked into
// action.precomputedStats at context-build time using the form's default teammate conditionals.
//
// Phase C consequence: team buffs are effectively "always on at their default value" for the
// purposes of damage. The autobattle still differentiates by SP economy, ult cadence, FUA
// triggers, and DoT ticks, but per-resolution buff toggling for static precompute effects
// is deferred to a later phase (Phase D-G or later, when we add re-precompute support).
export function applyTeamBuffsForActor(
  state: BattleState,
  actor: ActorId,
  action: OptimizerAction,
  teammateSlotByBattleSlot: Partial<Record<SlotIndex, 0 | 1 | 2>>,
): void {
  // Reset all teammate conditionals to their pre-built defaults before re-applying. The
  // pre-built conditionals already capture the "buffs on" baseline; we only override per-buff.
  for (const buff of state.activeBuffs) {
    if (!buff.conditionalKey) continue
    if (!buffTargetsActor(buff, actor)) continue
    const teammateIndex = teammateSlotByBattleSlot[buff.sourceSlot]
    if (teammateIndex === undefined) continue
    const teammateAction = teammateActionAt(action, teammateIndex)
    if (!teammateAction) continue
    teammateAction.characterConditionals[buff.conditionalKey] = true
  }
}

function buffTargetsActor(buff: ActiveBuff, actor: ActorId): boolean {
  if (buff.target.kind === 'team') return true
  if (buff.target.kind === 'slot') return buff.target.slot === actor.slot
  return false
}

function teammateActionAt(action: OptimizerAction, idx: 0 | 1 | 2) {
  if (idx === 0) return action.teammate0
  if (idx === 1) return action.teammate1
  return action.teammate2
}
