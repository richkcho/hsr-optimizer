import type { Parts, PathName } from 'lib/constants/constants'
import type { StatKeyValue } from 'lib/optimization/engine/config/keys'
import type { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'
import type { SimulationRelic } from 'lib/simulations/statSimulationTypes'
import type { OptimizerAction, OptimizerContext } from 'types/optimizer'
import type { CharacterId, Eidolon } from 'types/character'
import type { LightConeId } from 'types/lightCone'

// =============================================================================
// Slots and actors
// =============================================================================

export type SlotIndex = 0 | 1 | 2 | 3
export const SLOT_INDEXES: readonly SlotIndex[] = [0, 1, 2, 3]

// An actor is a thing on the AV queue. Each team slot has one primary actor
// and 0..1 memo/summon actors that take their own turns.
export type ActorKind = 'primary' | 'memo' | 'summon'

export interface ActorId {
  slot: SlotIndex
  kind: ActorKind
  entityName?: string  // matches characterController.entityDeclaration() value for memo/summon
}

// Stable string form used as Record key. Keep in sync with serializeActorId().
export type ActorIdKey = string

// =============================================================================
// Team configuration (inputs to a sim run)
// =============================================================================

export interface TeamMember {
  slot: SlotIndex
  characterId: CharacterId
  eidolon: Eidolon
  lightConeId: LightConeId
  lightConeSuperimposition: number
  equippedRelics: Partial<Record<Parts, SimulationRelic>>
  path: PathName
  maxEnergy: number                                  // game_data.json max_sp (ult cost)
  baseSpd: number
  tendency: Tendency
  characterData: CharacterData
  actors: ActorId[]                                  // primary + optional memo
}

// =============================================================================
// Live battle state
// =============================================================================

export interface ActorClock {
  id: ActorId
  remainingAv: number
}

export interface ResourceState {
  // Team-wide skill point pool, 0..5 (integer)
  skillPoints: number
  // Per-slot energy, clamped to [0, member.maxEnergy]
  energy: Record<SlotIndex, number>
  // Stack-based resources (Acheron 'nihility' stacks, etc.). Opaque per-character bag.
  stacks: Record<SlotIndex, Record<string, number>>
  // Counters used by FUA trigger system (e.g. Feixiao "every N teammate attacks")
  fuaTriggerCounters: Record<SlotIndex, Record<string, number>>
}

export interface EnemyState {
  count: number
  spd: number          // configurable; default ~134 (avg lvl 95 elite)
  clockAv: number      // ticks down by dt; resets to 10000/spd; triggers DoT ticks
  dots: ActiveDot[]
}

export interface ActiveDot {
  appliedBy: SlotIndex
  // Reference into the applier's preBuiltActions hits[] so we can re-run the DoT
  // damage function on each enemy turn without rebuilding the hit.
  hitTemplateRef: {
    ownerSlot: SlotIndex
    abilityKind: AbilityKind
    hitIndex: number
  }
  stacks: number
  remainingTurns: number  // decrements on each enemy turn
}

export type BuffTickMode = 'av' | 'turnsOnTarget' | 'turnsOnSource' | 'turnsOnEnemy'

export type BuffTarget =
  | { kind: 'team' }
  | { kind: 'slot'; slot: SlotIndex }
  | { kind: 'enemy' }

export interface ActiveBuff {
  id: string                // unique per (source, effect), e.g. 'Robin.concerto', 'Bronya.ultBuff'
  sourceSlot: SlotIndex
  target: BuffTarget
  // The buff flips a conditional flag on the affected character's OptimizerAction
  // teammateN.characterConditionals, so existing precomputeMutualEffectsContainer
  // hooks fire naturally. Fallback statOverride applies directly via x.buff().
  conditionalKey?: string
  statOverride?: { statKey: StatKeyValue; value: number }
  remaining: number
  mode: BuffTickMode
}

export interface DamageLedger {
  // dmg[actorIdKey][AbilityKind] = total damage attributed to that actor for that source
  byActorBySource: Record<ActorIdKey, Partial<Record<AbilityKind, number>>>
  totalsByActor: Record<ActorIdKey, number>
  grandTotal: number
}

export type TurnLogKind = AbilityKind | 'TICK' | 'DOT_TICK' | 'BUFF_EXPIRE' | 'ENEMY_TURN'

// Where the ability aims. Damage in v1 is scalar (per-actor x per-kind), so target is mainly
// intent/documentation + forward-compat for per-enemy state. Side-effect routing (energy,
// advance, buffs to teammates) still goes through GrantTarget on CharacterData/BuffGrant.
//
// Convention for hints: AbilityTarget describes where the *damage* lands. Side-effects like
// allied heals/shields attached to an enemy-aimed ability still get expressed via GrantTarget
// on grantsBuffsOnAction etc. — they don't change the AbilityTarget.
export type AbilityTarget =
  | 'mainEnemy'
  | 'allEnemies'
  | 'self'
  | 'singleAlly'
  | 'allAllies'
  | { kind: 'slot'; slot: SlotIndex }
  | { kind: 'enemy'; enemyIndex: number }

export interface TurnLogEntry {
  elapsedAv: number      // cumulative
  deltaAv: number        // how much AV advanced for this step (0 for out-of-turn ult)
  actor: ActorId
  kind: TurnLogKind
  description: string
  damage?: number
  spBefore?: number
  spAfter?: number
  energyAfter?: number
  notes?: string[]       // tendency reasons, e.g. ['skill: SP>=1', 'energy<max']
  target?: AbilityTarget // resolved target — precedence: chosen.target → data hint → kind default
}

export interface BattleState {
  enemy: EnemyState
  totalAv: number
  elapsedAv: number
  mainDpsSlot: SlotIndex                                  // resolves 'singleAlly' grants

  members: Record<SlotIndex, TeamMember>
  clocks: ActorClock[]                                    // includes primary + memo clocks
  resources: ResourceState
  activeBuffs: ActiveBuff[]
  ledger: DamageLedger
  log: TurnLogEntry[]

  // Cached objects (built once at sim-start, mutated each turn)
  contexts: Record<SlotIndex, OptimizerContext>
  preBuiltActions: Record<ActorIdKey, Partial<Record<AbilityKind, OptimizerAction>>>
}

// =============================================================================
// Sim inputs and outputs (the worker's serializable contract)
// =============================================================================

export interface TeamMemberInput {
  slot: SlotIndex
  characterId: CharacterId
  eidolon: Eidolon
  lightConeId: LightConeId
  lightConeSuperimposition: number
  // Resolved by the caller (UI hook reads relicStore; tests construct SimulationRelic directly).
  // Each entry needs `set` and `condensedStats` to feed calculateRelicStats.
  equippedRelics: Partial<Record<Parts, SimulationRelic>>
  baseSpd: number
  maxEnergy: number
  path: PathName
}

export interface AutobattleInput {
  team: TeamMemberInput[]                                  // length 1..4
  mainDpsSlot: SlotIndex
  enemyCount: number
  enemySpd: number
  totalAv: number
}

export interface AutobattleResult {
  ledger: DamageLedger
  log: TurnLogEntry[]
  finalElapsedAv: number
  // For debugging / future UI
  finalSp: number
  finalEnergyBySlot: Record<SlotIndex, number>
}

// =============================================================================
// Character data layer (FACTS — game-mechanic numbers and triggers)
// =============================================================================

export type GrantTarget =
  | 'allAllies'        // every slot except self
  | 'singleAlly'       // resolves to mainDpsSlot (excluded: self)
  | 'self'             // the actor itself
  | { slot: SlotIndex } // explicit

export interface GrantSpec {
  target: GrantTarget
}

export type EnergyGrant = GrantSpec & { amount: number }
export type AdvanceGrant = GrantSpec & { avPercent: number }
export type BuffGrant = GrantSpec & {
  // Buff template; sourceSlot + target are filled in by the executor.
  buff: Omit<ActiveBuff, 'sourceSlot' | 'target'>
}

export type FuaTriggerEvent =
  | 'teammateAttack'           // any teammate basic/skill/ult
  | 'teammateAttackVsTarget'   // requires conditionMark to be active on enemy
  | 'ownAttack'
  | 'ownSkill'
  | 'beingAttacked'            // v1: never fires (enemies don't attack), included for forward compat

export interface FuaTrigger {
  on: FuaTriggerEvent
  everyN?: number              // e.g. Feixiao: 2 ally attacks
  conditionMark?: string       // e.g. Topaz: 'numbyMark'
  // Which of this character's FUA hits fires when triggered (in case actionDefinition has variants)
  selector?: { abilityKind: AbilityKind; variant?: string }
  // Stable id used to key the counter in ResourceState.fuaTriggerCounters
  id: string
}

export interface StackResource {
  name: string
  onAction: Partial<Record<AbilityKind, number>>
  onTeammateAction?: Partial<Record<AbilityKind, number>>
  threshold: number
  consumeOnUlt: number | 'all'
}

export interface MemoData {
  entityName: string  // matches the character's entityDeclaration() value
  // 'entityDefinition' = use the EntityDefinition.memoBaseSpd{Flat,Scaling} fields directly.
  // { fromOwnerSpd: f } = memo SPD = owner SPD * f (Hyacine/Ica style).
  spdSource: 'entityDefinition' | { fromOwnerSpd: number }
  // Memos typically don't generate owner energy. Defaults to {} (no energy gen).
  energyOnAction?: Partial<Record<AbilityKind, number>>
}

export interface CharacterData {
  // Energy gained by this character when *it* takes the given action.
  // Falls back to defaults (BASIC: 20, SKILL: 30, FUA: 5, ULT: 5).
  energyOnAction?: Partial<Record<AbilityKind, number>>
  ultResource?: 'energy' | 'stacks'  // default 'energy'
  stacks?: StackResource

  // FUA trigger conditions (codifies "Feixiao every 2 ally attacks", Numby on marked target).
  fuaTriggers?: FuaTrigger[]

  // Memosprite/summon. Adds a memo actor to the AV queue when present.
  memo?: MemoData

  // Cross-slot grants triggered by this character's own actions.
  grantsEnergyOnAction?: Partial<Record<AbilityKind, EnergyGrant>>
  grantsAdvanceOnAction?: Partial<Record<AbilityKind, AdvanceGrant>>
  grantsBuffsOnAction?: Partial<Record<AbilityKind, BuffGrant[]>>

  // Per-character target defaults for each ability kind. Overrides the executor's
  // kind-based default; can itself be overridden by ChosenAbility.target on a given turn.
  abilityTargetHint?: Partial<Record<AbilityKind, AbilityTarget>>

  // v1 approximation flags for mechanics we don't fully simulate.
  v1Approx?: {
    // For Aventurine/Clara/Fu Xuan/March 7th: enemies don't attack, so we
    // synthesize energy regen as if they did, per enemy turn.
    energyFromEnemyAttacks?: { avgPerEnemyTurn: number }
  }
}

// =============================================================================
// Tendency layer (POLICY — decision logic; reads facts via ctx.data())
// =============================================================================

export type ArchetypeId =
  | 'pureDps'
  | 'fuaDps'
  | 'aoeDps'
  | 'stackDps'
  | 'spPositiveBuffer'
  | 'fieldBuffer'
  | 'healer'
  | 'debuffer'

export interface ChosenAbility {
  kind: AbilityKind
  reason: string
  // Optional. When unset, the executor falls back to CharacterData.abilityTargetHint[kind],
  // then to a kind-based default (most attacks → mainEnemy; ult → allEnemies).
  target?: AbilityTarget
  // Explicit overrides — tendency can apply buffs/advances/energy grants that aren't
  // expressible via characterData. The executor merges these on top of characterData grants.
  buffsApplied?: Omit<ActiveBuff, 'sourceSlot'>[]
  advancesTeammates?: { slot: SlotIndex; avPercent: number }[]
  grantsEnergy?: { slot: SlotIndex; amount: number }[]
}

export interface TendencyCtx {
  state: BattleState
  self: SlotIndex
  sp(): number
  energy(): number
  stacks(name: string): number
  hasActiveBuff(id: string): boolean
  spCost(kind: AbilityKind): number   // reads action.hits[].skillPointsUsed
  data(): CharacterData
}

export interface Tendency {
  archetype: ArchetypeId
  decideTurn(ctx: TendencyCtx): ChosenAbility
  decideUlt(ctx: TendencyCtx): ChosenAbility | null
  // Optional: lets a tendency veto an FUA the trigger system says should fire
  shouldFireFua?(triggerSource: ActorId, ctx: TendencyCtx): boolean
}

// =============================================================================
// Helpers
// =============================================================================

export function serializeActorId(id: ActorId): ActorIdKey {
  return id.entityName ? `${id.slot}:${id.kind}:${id.entityName}` : `${id.slot}:${id.kind}`
}
