import {
  type BasicStatsArray,
  BasicStatsArrayCore,
} from 'lib/optimization/basicStatsArray'
import {
  calculateBaseStats,
  calculateBasicSetEffects,
  calculateElementalStats,
  calculateRelicStats,
  calculateSetCounts,
} from 'lib/optimization/calculateStats'
import { generateContext } from 'lib/optimization/context/calculateContext'
import { ComputedStatsContainer } from 'lib/optimization/engine/container/computedStatsContainer'
import {
  type AutobattleInput,
  type SlotIndex,
  SLOT_INDEXES,
  type TeamMemberInput,
} from 'lib/autobattle/types'
import { Parts } from 'lib/constants/constants'
import {
  OrnamentSetCount,
  OrnamentSetToIndex,
  RelicSetCount,
  RelicSetToIndex,
  type SetsOrnaments,
  type SetsRelics,
} from 'lib/sets/setConfigRegistry'
import {
  type SimulationRelic,
  type SimulationRelicByPart,
} from 'lib/simulations/statSimulationTypes'
import { generateFullDefaultForm } from 'lib/simulations/utils/benchmarkForm'
import type { Form } from 'types/form'
import type { OptimizerContext } from 'types/optimizer'

// Per-slot resolver state. Built once at sim-start and reused across every ability resolution.
// The damage runner resets x via clearRegisters + setConfig + setPrecompute between calls,
// so a single x can be reused for all of this slot's abilities.
export interface SlotResolverState {
  context: OptimizerContext
  c: BasicStatsArray
  x: ComputedStatsContainer
  // Maps another slot index to which teammateN slot (0/1/2) it occupies in this context.
  // Used by teamBuffApplier to find the right action.teammateN to mutate.
  teammateSlotByBattleSlot: Partial<Record<SlotIndex, 0 | 1 | 2>>
}

export interface BuildSlotResolversResult {
  states: Partial<Record<SlotIndex, SlotResolverState>>
}

const EMPTY_RELIC: SimulationRelic = { set: '', condensedStats: [] }

// Standard autobattle enemy params. `enemyMaxToughness` flows from the input (default 100)
// and feeds context.enemyMaxToughness, which `BreakDamageFunction` uses in its base multi.
const AUTOBATTLE_ENEMY_DEFAULTS = {
  enemyLevel: 95,
  enemyMaxToughness: 100,
  enemyWeaknessBroken: false,
  enemyResistance: 0,
  enemyEffectResistance: 0.4,
  enemyElementalWeak: false,
} as const

// Builds per-slot OptimizerContext + initialized BasicStatsArrayCore + ComputedStatsContainer.
// The other 3 slots become teammate0/teammate1/teammate2 in stable battle-slot order.
export function buildSlotResolvers(input: AutobattleInput): BuildSlotResolversResult {
  const states: Partial<Record<SlotIndex, SlotResolverState>> = {}
  const teamBySlot = new Map<SlotIndex, TeamMemberInput>()
  for (const member of input.team) teamBySlot.set(member.slot, member)

  for (const member of input.team) {
    const form = buildFormForSlot(member, input, teamBySlot)
    const context = generateContext(form)
    const c = buildBasicStatsArray(member.equippedRelics, context)
    const x = buildComputedStatsContainer(c, context)

    states[member.slot] = {
      context,
      c,
      x,
      teammateSlotByBattleSlot: computeTeammateAssignment(member.slot, teamBySlot),
    }
  }

  return { states }
}

// ---------------------------------------------------------------------------
// Form construction
// ---------------------------------------------------------------------------

function buildFormForSlot(
  member: TeamMemberInput,
  input: AutobattleInput,
  teamBySlot: Map<SlotIndex, TeamMemberInput>,
): Form {
  const form = generateFullDefaultForm(
    member.characterId,
    member.lightConeId,
    member.eidolon,
    member.lightConeSuperimposition,
    false,
  )

  let teammateIndex = 0
  for (const slot of SLOT_INDEXES) {
    if (slot === member.slot) continue
    const other = teamBySlot.get(slot)
    if (!other) continue
    const teammateForm = generateFullDefaultForm(
      other.characterId,
      other.lightConeId,
      other.eidolon,
      other.lightConeSuperimposition,
      true,
    )
    if (teammateIndex === 0) form.teammate0 = teammateForm
    else if (teammateIndex === 1) form.teammate1 = teammateForm
    else form.teammate2 = teammateForm
    teammateIndex++
  }

  // Override enemy fields with autobattle v1 defaults
  form.enemyCount = input.enemyCount
  form.enemyLevel = AUTOBATTLE_ENEMY_DEFAULTS.enemyLevel
  form.enemyMaxToughness = input.enemyMaxToughness ?? AUTOBATTLE_ENEMY_DEFAULTS.enemyMaxToughness
  form.enemyWeaknessBroken = AUTOBATTLE_ENEMY_DEFAULTS.enemyWeaknessBroken
  form.enemyResistance = AUTOBATTLE_ENEMY_DEFAULTS.enemyResistance
  form.enemyEffectResistance = AUTOBATTLE_ENEMY_DEFAULTS.enemyEffectResistance
  form.enemyElementalWeak = AUTOBATTLE_ENEMY_DEFAULTS.enemyElementalWeak

  return form
}

function computeTeammateAssignment(
  selfSlot: SlotIndex,
  teamBySlot: Map<SlotIndex, TeamMemberInput>,
): Partial<Record<SlotIndex, 0 | 1 | 2>> {
  const result: Partial<Record<SlotIndex, 0 | 1 | 2>> = {}
  let idx: 0 | 1 | 2 = 0
  for (const slot of SLOT_INDEXES) {
    if (slot === selfSlot) continue
    if (!teamBySlot.has(slot)) continue
    result[slot] = idx
    if (idx < 2) idx = (idx + 1) as 0 | 1 | 2
  }
  return result
}

// ---------------------------------------------------------------------------
// Basic stats + container init
// ---------------------------------------------------------------------------

function buildBasicStatsArray(
  equipped: Partial<Record<Parts, SimulationRelic>>,
  context: OptimizerContext,
): BasicStatsArray {
  const head = equipped[Parts.Head] ?? EMPTY_RELIC
  const hands = equipped[Parts.Hands] ?? EMPTY_RELIC
  const body = equipped[Parts.Body] ?? EMPTY_RELIC
  const feet = equipped[Parts.Feet] ?? EMPTY_RELIC
  const planarSphere = equipped[Parts.PlanarSphere] ?? EMPTY_RELIC
  const linkRope = equipped[Parts.LinkRope] ?? EMPTY_RELIC

  // Mirror simulateBuild: when a relic has no recognized set (e.g. broken set), assign it a
  // distinct unused index from 0..5 so 2/4-piece logic doesn't falsely activate.
  const relics: SimulationRelicByPart = { Head: head, Hands: hands, Body: body, Feet: feet, PlanarSphere: planarSphere, LinkRope: linkRope }
  let unusedSetCounter = 0
  const unusedSets = generateUnusedSets(relics)
  const setH = RelicSetToIndex[head.set as SetsRelics] ?? unusedSets[unusedSetCounter++]
  const setG = RelicSetToIndex[hands.set as SetsRelics] ?? unusedSets[unusedSetCounter++]
  const setB = RelicSetToIndex[body.set as SetsRelics] ?? unusedSets[unusedSetCounter++]
  const setF = RelicSetToIndex[feet.set as SetsRelics] ?? unusedSets[unusedSetCounter++]
  const setP = OrnamentSetToIndex[planarSphere.set as SetsOrnaments] ?? unusedSets[unusedSetCounter++]
  const setL = OrnamentSetToIndex[linkRope.set as SetsOrnaments] ?? unusedSets[unusedSetCounter++]

  const c = (new BasicStatsArrayCore(false)) as BasicStatsArray
  const sets = [setH, setG, setB, setF, setP, setL]
  const setCounts = calculateSetCounts(sets)
  const relicSetIndex =
    setH
    + setB * RelicSetCount
    + setG * RelicSetCount * RelicSetCount
    + setF * RelicSetCount * RelicSetCount * RelicSetCount
  const ornamentSetIndex = setP + setL * OrnamentSetCount
  c.init(relicSetIndex, ornamentSetIndex, setCounts, sets, -1)

  calculateBasicSetEffects(c, context, setCounts, sets)
  calculateRelicStats(c, head, hands, body, feet, planarSphere, linkRope)
  calculateBaseStats(c, context)
  calculateElementalStats(c, context)

  return c
}

function generateUnusedSets(relics: SimulationRelicByPart): number[] {
  const usedSets = new Set([
    RelicSetToIndex[relics.Head.set as SetsRelics],
    RelicSetToIndex[relics.Hands.set as SetsRelics],
    RelicSetToIndex[relics.Body.set as SetsRelics],
    RelicSetToIndex[relics.Feet.set as SetsRelics],
    OrnamentSetToIndex[relics.PlanarSphere.set as SetsOrnaments],
    OrnamentSetToIndex[relics.LinkRope.set as SetsOrnaments],
  ])
  return [0, 1, 2, 3, 4, 5].filter((x) => !usedSets.has(x))
}

function buildComputedStatsContainer(
  c: BasicStatsArray,
  context: OptimizerContext,
): ComputedStatsContainer {
  const x = new ComputedStatsContainer()
  x.initializeArrays(context.maxContainerArrayLength, context)
  x.setBasic(c)
  return x
}
