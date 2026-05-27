import type { ActiveBuff, ActorId, BattleState, SlotIndex, TeamMember } from 'lib/autobattle/types'
import type { TeammateConditionalOverride } from 'lib/optimization/rotation/comboStateTransform'

// Builds the per-resolve "live conditional overrides" map fed into rebuildPrecomputedStats.
//
// Phase-D model (replacing the old all-on-baseline approach):
//
//   1. Every buff-controlled conditional defaults to FALSE for any teammate whose character
//      data declares it as such (via grantsBuffsOnAction[*][*].buff.conditionalKey).
//   2. For each ActiveBuff in state.activeBuffs that (a) targets this actor and (b) carries
//      a conditionalKey, the corresponding flag on the buff's source teammate is flipped
//      back to TRUE.
//
// The result is then handed to rebuildPrecomputedStats, which zeros the action's
// precomputedStats and re-runs every precomputeMutualEffectsContainer /
// precomputeTeammateEffectsContainer hook against the overridden conditionals. Buffs
// without conditionalKey are still tracked in activeBuffs as sim signals (tendency gates,
// timing markers) but contribute no stats here.
//
// Self-conditionals are NOT modulated by this layer in v1: the firing slot's own
// characterConditionals stay at form defaults. The autobattle inflation we measured was
// teammate-buff-driven; self-conditional dynamic timing (e.g. Aventurine's own shield
// uptime affecting his own Knight of Purity Palace 4pc) is a follow-up.
export function buildLiveConditionalOverrides(
  state: BattleState,
  actor: ActorId,
  teammateSlotByBattleSlot: Partial<Record<SlotIndex, 0 | 1 | 2>>,
): TeammateConditionalOverride[] {
  const overridesByIndex: Partial<Record<0 | 1 | 2, TeammateConditionalOverride>> = {}

  // Step 1: seed each teammate's buff-controlled conditionals to FALSE.
  for (const slotStr of Object.keys(state.members) as unknown as SlotIndex[]) {
    if (slotStr === actor.slot) continue
    const teammateIndex = teammateSlotByBattleSlot[slotStr]
    if (teammateIndex === undefined) continue
    const member = state.members[slotStr]
    if (!member) continue
    const { character, lc } = collectBuffControlledKeys(member)
    if (character.size === 0 && lc.size === 0) continue
    const charCond: Record<string, boolean> = {}
    const lcCond: Record<string, boolean> = {}
    for (const k of character) charCond[k] = false
    for (const k of lc) lcCond[k] = false
    overridesByIndex[teammateIndex] = {
      teammateIndex,
      characterConditionals: charCond,
      lightConeConditionals: lcCond,
    }
  }

  // Step 2: walk activeBuffs and flip conditional keys back on for buffs that apply to
  // this actor. The buff's source teammate is the one whose conditional gets the flip.
  for (const buff of state.activeBuffs) {
    if (!buff.conditionalKey) continue
    if (!buffAppliesToActor(buff, actor)) continue
    const teammateIndex = teammateSlotByBattleSlot[buff.sourceSlot]
    if (teammateIndex === undefined) continue
    let entry = overridesByIndex[teammateIndex]
    if (!entry) {
      entry = {
        teammateIndex,
        characterConditionals: {},
        lightConeConditionals: {},
      }
      overridesByIndex[teammateIndex] = entry
    }
    const kind = buff.conditionalKind ?? 'character'
    if (kind === 'lc') {
      entry.lightConeConditionals![buff.conditionalKey] = true
    } else {
      entry.characterConditionals![buff.conditionalKey] = true
    }
  }

  return Object.values(overridesByIndex) as TeammateConditionalOverride[]
}

// Walks a character's grantsBuffsOnAction to derive the set of conditional keys that are
// driven by active buffs. Any key referenced by a grant is "windowed" — reset to false
// before activeBuffs are applied. Cached on the member to avoid repeating the walk.
function collectBuffControlledKeys(member: TeamMember): { character: Set<string>; lc: Set<string> } {
  const cached = (member as any)._buffControlledKeysCache
  if (cached) return cached
  const character = new Set<string>()
  const lc = new Set<string>()
  const grants = member.characterData.grantsBuffsOnAction
  if (grants) {
    for (const kind in grants) {
      const list = grants[kind as keyof typeof grants]
      if (!list) continue
      for (const grant of list) {
        const key = grant.buff.conditionalKey
        if (!key) continue
        if (grant.buff.conditionalKind === 'lc') lc.add(key)
        else character.add(key)
      }
    }
  }
  const result = { character, lc }
  ;(member as any)._buffControlledKeysCache = result
  return result
}

// Whether a buff's target reaches the resolving actor. Team and slot targets follow the
// existing semantics; enemy targets are treated as team-wide because the "debuff on the
// enemy" expresses itself as a damage multiplier for any ally that hits it.
function buffAppliesToActor(buff: ActiveBuff, actor: ActorId): boolean {
  if (buff.target.kind === 'team') return true
  if (buff.target.kind === 'enemy') return true
  if (buff.target.kind === 'slot') return buff.target.slot === actor.slot
  return false
}
