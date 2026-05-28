import type { ElementName, Parts, PathName } from 'lib/constants/constants'
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
  // Energy Regen Rate as a decimal (e.g. 0.30 for 30% ERR). Snapshotted at sim-init
  // from the character's relics+light-cone+traces+conditionals; every positive energy
  // delta in changeEnergy() is scaled by (1 + errPercent). Mock-resolver tests leave
  // this at 0. Mid-battle ERR buffs are not modeled in v1.
  errPercent: number
  tendency: Tendency
  characterData: CharacterData
  actors: ActorId[]                                  // primary + optional memo
  // Resolved SPD for the memo/summon actor (matches computeMemoSpd at init-time). Undefined
  // when this member has no memo. Cached here so the scheduler can reset the memo clock to
  // the right base SPD without re-resolving spdSource — using member.baseSpd would tick the
  // memo at the owner's cadence.
  memoSpd?: number
}

// =============================================================================
// Live battle state
// =============================================================================

export interface ActorClock {
  id: ActorId
  remainingAv: number
  // When true, the clock is frozen: it does not tick in advanceAllClocks and argminClock
  // skips it. Used to model HSR "frozen" states like Robin's Concerto, where the unit
  // cannot take any actions for the duration of the state.
  paused?: boolean
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
  count: number       // derived === toughness.length; kept for read-site clarity
  // Per-enemy action gauge state. All arrays have length === count.
  // spd: per-enemy SPD. v1 takes a single scalar from AutobattleInput.enemySpd and replicates
  //   it across enemies (HSR mob SPDs do differ — boss vs elite — but we don't surface that
  //   in the input schema yet). Per-enemy SPD via input is forward-compat work.
  // clockAv: per-enemy AV countdown. Ticks down by dt; resets to 10000/spd on that enemy's
  //   turn; pushed back by 0.25 × baseAV on break (action delay).
  spd: number[]
  clockAv: number[]
  dots: ActiveDot[]

  // Per-enemy toughness/break state. All arrays have length === count.
  // Each ability decrements only its target enemy's gauge (or each, for AoE), and
  // break credits the breaker once per broken enemy using that enemy's maxToughness.
  maxToughness: number[]
  toughness: number[]
  // Per-enemy element weakness lists. `undefined` / empty means "weak to all" (the
  // pre-routing default — every hit reduces toughness). A non-empty list gates the
  // toughness decrement on the breaking ability's element matching one entry.
  weaknesses: (ElementName[] | undefined)[]
  // Countdown in enemy clock cycles per enemy. Set to 1 on break, decremented in
  // processEnemyTurn; when 0 the broken state ends and toughness restores to maxToughness.
  // `undefined` at a given index means that enemy is not currently broken.
  brokenForEnemyTurns: (number | undefined)[]
}

export interface ActiveDot {
  appliedBy: SlotIndex
  // Reference into the applier's preBuiltActions hits[] so we can re-run the DoT
  // damage function on each enemy turn without rebuilding the hit. For break-effect
  // DoTs (`breakDotKind` set) the hit template is a sentinel — the runtime computes
  // damage inline via resolver.resolveBreakDot from the breaker's stat container
  // rather than re-running a hit.
  hitTemplateRef: {
    ownerSlot: SlotIndex
    abilityKind: AbilityKind
    hitIndex: number
  }
  stacks: number
  remainingTurns: number  // decrements on each enemy turn

  // Break-effect DoT (Burn/Shock/Bleed/Wind Shear/etc.) registered when this dot's
  // applier broke the target enemy. The DoT is bound to a single enemy via
  // targetEnemyIndex (per-enemy attribution) and carries the breaking hit's element
  // for resistance/penetration calculations. v1 collapses per-element variants into
  // one generic damage DoT — Freeze action-skip, Wind Shear stacking, Entanglement
  // multi-hit scaling are unmodeled but tagged TODOs for v2.
  breakDotKind?: 'generic'
  targetEnemyIndex?: number
  element?: ElementName
}

export type BuffTickMode = 'av' | 'turnsOnTarget' | 'turnsOnSource' | 'turnsOnEnemy' | 'sticky'

export type BuffTarget =
  | { kind: 'team' }
  | { kind: 'slot'; slot: SlotIndex }
  | { kind: 'enemy' }

export interface ActiveBuff {
  id: string                // unique per (source, effect), e.g. 'Robin.concerto', 'Bronya.ultBuff'
  sourceSlot: SlotIndex
  target: BuffTarget
  // The buff flips a conditional flag on the buff source's OptimizerAction conditionals
  // when the damage runner rebuilds precomputedStats for any team member targeted by the
  // buff. Choose `conditionalKind` based on whether the flag lives on the character's own
  // characterConditionals (default, omit to use 'character') or on the wielder's
  // lightConeConditionals ('lc' — for LC-driven buffs like FlowingNightglow.cadenzaActive
  // that fire alongside the wielder's ability).
  conditionalKey?: string
  conditionalKind?: 'character' | 'lc'
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
  // Snapshot of action.config.enemyWeaknessBroken as the character/light-cone
  // initializeConfigurationsContainer hooks set it at action build time. Kits like Feixiao's
  // ULT and Firefly's SKILL/ULT pre-set true to model self-induced break (the attack itself
  // applies the break before the damage step). The scheduler ORs this kit override with the
  // observed broken state on each resolve so kit assumptions stick even when the actual
  // enemy is not currently broken.
  kitOverrideEnemyWeaknessBroken: Record<ActorIdKey, Partial<Record<AbilityKind, boolean>>>
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

export interface AutobattleInputEnemy {
  // Per-enemy toughness gauge for break detection. Standard elites run 100; bosses run
  // 120–240.
  maxToughness: number
  // Element weaknesses. Omitted / empty → weak to every element (preserves the pre-routing
  // default used by goldens captured with `weaknessOverrides: All`). When populated, only
  // hits whose primary element is in the list will reduce this enemy's toughness gauge.
  weaknesses?: ElementName[]
}

export interface AutobattleInput {
  team: TeamMemberInput[]                                  // length 1..4
  mainDpsSlot: SlotIndex
  enemies: AutobattleInputEnemy[]                          // length 1..N; sets enemy.count
  enemySpd: number
  totalAv: number
  // Scenario-level starting energy as fraction of maxEnergy (default 0.5 — HSR's
  // standard 50% start). Per-character override on CharacterData.startingEnergyPercent
  // takes precedence over this; this in turn takes precedence over the 0.5 default.
  startingEnergyPercent?: number
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
  | 'allAllies'        // every slot except self (energy/advance: per-ally; buff: one per ally excluding self)
  | 'singleAlly'       // resolves to mainDpsSlot (excluded: self)
  | 'self'             // the actor itself
  | 'team'             // buff grants only: emits a single kind:'team' ActiveBuff that applies to every actor (incl. source). Use for fields (turnsOnSource), where the conditional flag should be visible in every resolver's view of the source.
  | 'eachAlly'         // every slot INCLUDING source. For buffs: fan-out to one ActiveBuff per ally (turnsOnTarget tracks duration independently). For energy/advance: per-ally grant including source (e.g. wave-start Overture +5 to all four).
  | 'enemy'            // primary enemy; for buff grants only (debuff-as-team-DMG-buff)
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
  // Active-buff id that must be present on the trigger owner for the trigger to fire. The
  // buff is typically a self-marker applied by the owner's ult (Robin's 'Robin.concerto'),
  // letting non-FUA triggers like Robin's Concerto Additional gate by a kit state the sim
  // doesn't otherwise track. Checked by id only — namespaced buff ids keep this collision-free.
  requiresSourceBuff?: string
  // Which of this character's hits fires when triggered. The scheduler executes the trigger
  // as this AbilityKind (defaults to FUA for back-compat with classic FUA chargers).
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

// A stack pool that fires a non-ULT ability (typically FUA) when threshold reached.
// Distinct from StackResource above: StackResource gates an ULT via ultResource:'stacks'
// (Acheron's nihility stacks), this pool sits alongside normal energy and fires its own
// ability synchronously when the threshold is crossed. Coexists with energy + StackResource.
//
// Modeled after Aventurine's "Blind Bet" (`.tmp/ext/cowaii.io/HonkaiSR/Calculator/dCharacters.js`
// at byte-offset 218662-218904 for the Talent desc — "Upon reaching 7 points of 'Blind Bet,'
// Aventurine consumes the 7 points to launch a Follow-Up ATK [...] capped at 10 points").
export interface FuaStackPool {
  name: string                          // namespaced, e.g. 'aventurine.blindBets'
  threshold: number                     // stacks needed to fire
  consumeOnFire: number                 // stacks consumed when firing
  cap: number                           // hard upper bound (overflow lost)
  firesAbility: AbilityKind             // which AbilityKind to execute on fire (FUA, etc.)
  gain: {
    // +amount stacks when any teammate (different slot) takes an attack matching the kind
    // filter. Cap-per-owner-turn resets on the pool owner's primary processActorTurn.
    onAllyAttack?: {
      amount: number
      sourceKindFilter?: AbilityKind[]
      maxPerOwnerTurn?: number
    }
    // +N stacks when the pool owner casts their own ULT (Roulette Shark grants random 1-7,
    // modelled as the averaged value here).
    onOwnUlt?: number
    // v1 approximation for "ally with shield hit by enemy". The reference mechanic requires
    // tracking per-ally shield possession and enemy attack routing — neither of which the
    // sim does in v1 — so it's collapsed to a flat per-enemy-turn drip.
    onEnemyTurnApprox?: number
  }
}

export interface MemoData {
  entityName: string  // matches the character's entityDeclaration() value
  // Which ActorKind to surface this entity as. Distinguishes pure summons (Numby, Fuyuan
  // — no HP, no energy, fixed action repertoire) from memosprites (Path of Remembrance:
  // Ica, Netherwing — have HP, energy, multiple abilities). Defaults to 'memo' for the
  // memosprite case; explicitly set to 'summon' for summons. The actorKind threads through
  // serializeActorId → ledger keys → BattleRecord outcome's actorKind field.
  actorKind?: 'memo' | 'summon'
  // 'entityDefinition' = use the EntityDefinition.memoBaseSpd{Flat,Scaling} fields directly.
  // { fromOwnerSpd: f } = memo SPD = owner SPD * f (Hyacine/Ica style).
  spdSource: 'entityDefinition' | { fromOwnerSpd: number }
  // Explicit base SPD for the memo/summon, used when spdSource is 'entityDefinition' and we
  // can't (yet) read EntityDefinition.memoBaseSpdFlat off the OptimizerContext at scheduler-
  // init time. Numby=80, Netherwing=165, etc. When unset, the 'entityDefinition' case falls
  // back to the owner's baseSpd as a coarse approximation.
  entitySpd?: number
  // Memos typically don't generate owner energy. Defaults to {} (no energy gen).
  energyOnAction?: Partial<Record<AbilityKind, number>>
  // The action the memo/summon fires when its own clock hits zero. The AbilityKind selects
  // a hit definition from the owner's actionDefinition (memo/summon hits live there, tagged
  // sourceEntity(MemoName)). When the memo fires, damage is attributed to the memo's ActorId
  // — landing in slotN:memo:<entityName> rather than the owner's primary bucket.
  //
  // Summons (Topaz/Numby, Lingsha/Fuyuan) have exactly one own-turn action — typically
  // AbilityKind.FUA, the same hit data that also fires when an ally triggers it. Memosprites
  // (Hyacine/Ica, Castorice/Netherwing) own SKILL/ULT/etc. and would conceptually need
  // tendency-driven selection, but v1 simplifies to a single default action for all.
  onTurn?: { abilityKind: AbilityKind; reason?: string }
  // When a non-owner ally takes a primary action matching abilityKindFilter (defaults to
  // every attack-class kind), advance this memo's clock by avPercent of its baseline AV.
  //
  // Models Topaz's Talent: ally BASIC/SKILL/ULT on a Proof-of-Debt-marked enemy advances
  // Numby's gauge by 50%. v1 ignores conditionMark (treated as always satisfied — same
  // approximation `teammateAttackVsTarget` triggers use for fire conditions).
  //
  // The advance accumulates across multiple ally actions in the same scheduler iteration:
  // each call reduces remainingAv by avPercent * baseAv; the memo fires as soon as it
  // drops to zero (HSR action gauge does not waste overflow on the firing turn itself).
  advanceOnTeammateAttack?: {
    avPercent: number
    abilityKindFilter?: AbilityKind[]
    conditionMark?: string
  }
}

export interface CharacterData {
  // Energy gained by this character when *it* takes the given action.
  // Falls back to defaults (BASIC: 20, SKILL: 30, FUA: 5, ULT: 5).
  energyOnAction?: Partial<Record<AbilityKind, number>>
  ultResource?: 'energy' | 'stacks'  // default 'energy'
  stacks?: StackResource

  // FUA trigger conditions (codifies "Feixiao every 2 ally attacks", Numby on marked target).
  fuaTriggers?: FuaTrigger[]

  // Stack pool that fires a non-ULT ability (typically FUA) when threshold reached.
  // Aventurine's Blind Bet pool — see FuaStackPool docstring.
  fuaStackPool?: FuaStackPool

  // Memosprite/summon. Adds a memo actor to the AV queue when present.
  memo?: MemoData

  // Cross-slot grants triggered by this character's own actions.
  grantsEnergyOnAction?: Partial<Record<AbilityKind, EnergyGrant>>
  grantsAdvanceOnAction?: Partial<Record<AbilityKind, AdvanceGrant>>
  grantsBuffsOnAction?: Partial<Record<AbilityKind, BuffGrant[]>>

  // Per-character target defaults for each ability kind. Overrides the executor's
  // kind-based default; can itself be overridden by ChosenAbility.target on a given turn.
  abilityTargetHint?: Partial<Record<AbilityKind, AbilityTarget>>

  // Starting energy as fraction of maxEnergy (default 0.5 if neither this nor the
  // scenario override is set). Used for rare kits whose traces or light cones grant
  // a non-standard on-entry energy bonus.
  startingEnergyPercent?: number

  // While the named buff is active on this character, freeze the primary clock — the
  // unit cannot take its own turn or accrue energy from self-actions. When the buff
  // expires, the clock unpauses; if `actOnResume` is true, the clock is also set to 0
  // so the unit acts immediately (HSR Concerto semantics).
  clockPausedByBuff?: { buffId: string; actOnResume?: boolean }

  // Passive energy this character gains whenever ANY non-enemy actor fires the given
  // attack ability kind (including their own actions). Models talents like Robin's
  // "Tonal Resonance" — "after allies attack enemy targets, Robin additionally
  // regenerates N Energy for herself" — which fires per-attack regardless of source.
  // Subject to standard ERR scaling via changeEnergy. Limited to attack kinds
  // (BASIC/SKILL/ULT/FUA); DOT, BREAK, UNIQUE/Additional don't count as attacks.
  energyPassiveOnAnyAttack?: Partial<Record<AbilityKind, number>>

  // Battle-start AV advance applied once at sim-init, before the first clock tick. Expressed
  // as a fraction of the unit's base AV (0.25 = 25% of 10000/baseSpd). Models traces like
  // Robin's "Coloratura Cadenza" ("When the battle begins, action advances this character by
  // 25%"). Affects the primary clock only.
  battleStartAvAdvance?: number

  // Bonus raw energy applied once at sim-init, after the default starting-energy roll, subject
  // to standard ERR scaling via changeEnergy. Self-only legacy field; for team-wide / per-ally
  // wave-start energy use grantsEnergyOnBattleStart with target: 'eachAlly' instead.
  battleStartBonusEnergy?: number

  // Wave-start grants — analog of grantsXxxOnAction for the one-shot fire that happens at
  // sim-init. Applied once after the team is initialized and resources/buffs are set up. Use
  // these for technique-style effects (Robin's Overture +5 to allies, Topaz's Proof of Debt
  // pre-applied to enemy, Aventurine's wave-start DEF buff). Energy uses changeEnergy so ERR
  // scaling matches in-combat; advance uses advancePercent against the target's baseSpd; buffs
  // route through the shared grant-dispatch helper (same enemy/team/eachAlly fan-out as the
  // in-battle path).
  grantsEnergyOnBattleStart?: EnergyGrant
  grantsAdvanceOnBattleStart?: AdvanceGrant
  grantsBuffsOnBattleStart?: BuffGrant[]

  // Auto-fire one ability at wave start with no SP cost (technique-style invoke). Dispatched
  // via the normal executeAbility path after init + resolver creation but before the main
  // scheduler loop, so all knock-on effects (damage, energy gain, grants, traces, buff
  // application) flow through the same code paths as an in-battle cast. Models Ruan Mei's
  // Silken Serenade: on battle start her Skill (130302) fires once, applying her Overtone
  // field to the team. The dispatched ability picks its target via abilityTargetHint[kind]
  // or defaultTargetForKind, matching how the scheduler resolves in-battle casts.
  autoFireOnBattleStart?: AbilityKind

  // Fires when an enemy recovers from weakness break (transitions broken → unbroken on its
  // own turn). v1 hardcodes the firedAs case to BREAK damage credited to the listener,
  // using the listener's stat container + the broken enemy's maxToughness via
  // resolver.resolveBreak. Gated on `requiresActiveBuff` — the listener must have the
  // named buff active (typically a self-marker applied by their own ult creating a field,
  // e.g. Ruan Mei's RuanMei.ultField for Thanataplum Rebloom).
  onEnemyWeaknessRecovery?: {
    requiresActiveBuff: string
    firedAs: AbilityKind
  }

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
