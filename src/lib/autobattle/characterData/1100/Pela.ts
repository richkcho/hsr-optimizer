import type { CharacterData } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Pela is straight-forward: standard energy. Her Ult is the AoE "Zone Suppression" which
// inflicts the "Exposed" debuff on all enemies.
//
// Per-resolve precompute buff propagation (per gamedata SkillID 110603):
//   - "Zone Suppression": "When Exposed, enemies' DEF is reduced by #2[i]% for #3[i] turn(s)."
//     ParamList[1]=0.3 (30% — gamedata's higher-level scaling brings it to 40% at lv10),
//     ParamList[2]=2 turns. Multi-enemy debuff (single kind:'enemy' ActiveBuff in v1).
//     Drives Pela's `ultDefPenDebuff` teammate conditional gating team DEF PEN.
//
// `teamEhrBuff` is a passive trace (always-on 10% EHR). E4 Ice RES shred is described as
// Skill-windowed in-game but coded ungated by skill use — left as a passive trace here.
export const PelaData: CharacterData = {
  grantsBuffsOnAction: {
    [AbilityKind.ULT]: [
      {
        target: 'enemy',
        buff: {
          id: 'Pela.exposed',
          remaining: 2,
          mode: 'turnsOnEnemy',
          conditionalKey: 'ultDefPenDebuff',
        },
      },
    ],
  },
  abilityTargetHint: {
    [AbilityKind.ULT]: 'allEnemies',
  },
}
