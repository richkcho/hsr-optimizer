import type { CharacterData } from 'lib/autobattle/types'

// Hyacine summons Ica. Ica's SPD inherits Hyacine's directly (×1.0) — the EntityDefinition
// shows memoBaseSpdFlat: 0 + memoBaseSpdScaling: 0 because the actual SPD calc happens via
// in-engine buff conversions we don't model in v1. We use the fromOwnerSpd override so the
// scheduler clock fires at Hyacine's cadence.
export const HyacineData: CharacterData = {
  memo: {
    entityName: 'Ica',
    spdSource: { fromOwnerSpd: 1.0 },
  },
}
