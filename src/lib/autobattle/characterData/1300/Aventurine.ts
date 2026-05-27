import type { CharacterData } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Aventurine's Talent FUA ("Shot Loaded Right") is driven by a stack pool — "Blind Bet" — not
// by a count-based teammate-attack trigger. Stacks accumulate from three sources and the FUA
// fires synchronously when stacks reach 7. See the FuaStackPool docstring + the implementation
// plan in `.tmp/notes/cross-check-gap-investigation.md` (section "Aventurine FUA stack-pool —
// implementation plan") for the design rationale and reference citations.
export const AventurineData: CharacterData = {
  // FUA energy: 7 bounces × 1 energy/bounce per the talent's energyRegen=1 × bounceCount=7.
  // Overrides the default FUA=5.
  energyOnAction: {
    [AbilityKind.FUA]: 7,
  },
  fuaStackPool: {
    name: 'aventurine.blindBets',
    threshold: 7,
    consumeOnFire: 7,
    cap: 10,
    firesAbility: AbilityKind.FUA,
    gain: {
      // Bingo! trace: +1 stack when any ally fires a FUA, capped at 3 per Aventurine turn
      // (reset on his primary processActorTurn). Source filter restricts to FUA-kind only.
      onAllyAttack: {
        amount: 1,
        sourceKindFilter: [AbilityKind.FUA],
        maxPerOwnerTurn: 3,
      },
      // Roulette Shark ULT: random 1-7 stacks, modelled as the averaged +4.
      onOwnUlt: 4,
      // v1 approximation of "ally with Fortified Wager hit by enemy → +1 stack" (and +2 if
      // Aventurine himself is hit). The real mechanic needs per-ally shield uptime + enemy
      // attack routing, neither of which the sim does in v1 — collapsed to a flat drip.
      onEnemyTurnApprox: 1.3,
    },
  },
  // Per gamedata (SkillID 130402 "Cornerstone Deluxe" / 130403 "Roulette Shark"):
  //   - SKILL provides Fortified Wager shield to ALL allies for 3 turns. Buff-style
  //     (per-ally turnsOnTarget), so target:'eachAlly' fans out one ActiveBuff per ally
  //     including Aventurine; each entry ticks on its bound ally's turn.
  //   - ULT inflicts "Unnerved" on ONE designated enemy target for 3 turns. Single-enemy
  //     debuff (kind:'enemy' via target:'enemy', mode:'turnsOnEnemy'). The team-wide CR DMG
  //     buff in Aventurine's kit is gated on "an ally hits an Unnerved enemy" — modeled
  //     here via a separate conditional flag (`enemyUnnervedDebuff`) the debuff drives.
  //   - At E2+, the Ult also extends Fortified Wager to allies, and at E4+ the talent FUA
  //     becomes 10 hits. We don't model eidolon-conditional grants here yet — current data
  //     reflects the E0 kit. TODO: thread eidolon through characterData to express the
  //     E2 shield-on-ult and E4 FUA-hit-bump.
  grantsBuffsOnAction: {
    [AbilityKind.SKILL]: [
      {
        target: 'eachAlly',
        buff: { id: 'Aventurine.shield', remaining: 3, mode: 'turnsOnTarget', conditionalKey: 'fortifiedWagerBuff' },
      },
    ],
    [AbilityKind.ULT]: [
      {
        // Single-enemy "Unnerved" debuff. Drives the `enemyUnnervedDebuff` teammate
        // conditional that gates Aventurine's team CR DMG buff in
        // precomputeTeammateEffectsContainer.
        target: 'enemy',
        buff: { id: 'Aventurine.unnerved', remaining: 3, mode: 'turnsOnEnemy', conditionalKey: 'enemyUnnervedDebuff' },
      },
    ],
  },
  abilityTargetHint: {
    [AbilityKind.SKILL]: 'allEnemies',  // AoE Imaginary attack (Imaginary Numinosity)
    [AbilityKind.ULT]: 'allEnemies',
  },
}
