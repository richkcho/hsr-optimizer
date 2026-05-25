/**
 * BattleRecord — a self-contained snapshot of a single battle that can be
 * used to (a) replay it through our autobattle sim and (b) validate that our
 * sim produces matching per-ability damage numbers.
 *
 * A record carries:
 *   1. The full build config (team + enemies + scenario) — enough to drive a
 *      deterministic replay through `runAutobattle`.
 *   2. The observed outcome (damage totals + a required turn-by-turn timeline
 *      of damage events) — what we validate our sim's output against.
 *
 * Records are produced externally (e.g. by a damage logger reading from a
 * live game) and consumed by `tests/integration/crossCheck.test.ts`, which
 * builds an `AutobattleInput` from the record and diffs the resulting ledger
 * against `record.outcome`.
 *
 * Schema is versioned via `schemaVersion`. Breaking changes bump the number
 * and the consumer migrates or skips older records.
 */

import type {
  ElementName,
  MainStats,
  Parts,
  PathName,
  Sets,
  SubStats,
} from 'lib/constants/constants'
import type { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'
import type { ActorKind, SlotIndex } from 'lib/autobattle/types'
import type { CharacterId, Eidolon } from 'types/character'
import type { LightConeId } from 'types/lightCone'

/** Damage element label. 'true' is non-elemental (rare additional/break hits). */
export type DamageType = ElementName | 'true'

// ─────────────────────────────────────────────────────────────────────────────
// Top-level record
// ─────────────────────────────────────────────────────────────────────────────

export interface BattleRecord {
  /** Schema version. Bumps on breaking changes; consumers gate on this. */
  schemaVersion: 1

  /** Human-readable identifier for this record. Optional. */
  name?: string

  /** 1..4 ally team members in slot order. */
  team: BattleRecordMember[]

  /** Enemies present at battle start. Wave mechanics aren't modeled in v1. */
  enemies: BattleRecordEnemy[]

  /** Scenario inputs: AV duration, starting resources, etc. */
  scenario: BattleRecordScenario

  /** What the producer observed in the captured run. */
  outcome: BattleRecordOutcome

  /** Optional per-record tolerance overrides for the validation harness. */
  tolerance?: ToleranceBands
}

// ─────────────────────────────────────────────────────────────────────────────
// Inputs — enough to replay this battle deterministically
// ─────────────────────────────────────────────────────────────────────────────

export interface BattleRecordMember {
  slot: SlotIndex
  characterId: CharacterId
  /** Display name; not load-bearing. */
  characterName?: string

  eidolon: Eidolon
  lightConeId: LightConeId
  lightConeSuperimposition: 1 | 2 | 3 | 4 | 5
  /** Character path. Must match the character's actual path. */
  path: PathName

  /**
   * Ability levels (1-based). Absent fields default to max:
   *   basic=10, skill=15, ult=15, talent=15.
   */
  abilityLevels?: {
    basic?: number
    skill?: number
    ult?: number
    talent?: number
  }

  /**
   * Major-trace selections (the 3 "A2/A4/A6"-style stat boosts in the trace tree).
   * Absent → assumed all unlocked.
   */
  majorTraces?: {
    atkBoost?: boolean
    hpBoost?: boolean
    defBoost?: boolean
  }

  /** Pre-buff base SPD (used for our scheduler's clock cadence). */
  baseSpd: number

  /** Max energy (ult cost). Game's `max_sp` value. */
  maxEnergy: number

  /**
   * Equipped relics — 6 entries in canonical part order
   * (Head, Hands, Body, Feet, PlanarSphere, LinkRope). Sets are 2-piece units
   * so a full 4-piece is two entries declaring the same `set`.
   */
  relics: BattleRecordRelic[]

  /**
   * Energy at battle start. Overrides `scenario.startingEnergyPercent` for this
   * slot when set.
   */
  startingEnergy?: number
}

export interface BattleRecordRelic {
  part: Parts
  set: Sets
  mainStat: MainStats
  /** Resolved main-stat value (flat or %; convention matches StatCalculator). */
  mainValue: number
  /** 0..4 substats. Resolved values, not roll counts. */
  substats: BattleRecordRelicSubstat[]
}

export interface BattleRecordRelicSubstat {
  stat: SubStats
  /** Resolved value (flat or %; convention matches StatCalculator). */
  value: number
}

export interface BattleRecordEnemy {
  /** 0..n-1 in declaration order. */
  index: number
  /** Game's enemy archetype ID, if known. Not load-bearing. */
  enemyId?: string
  name?: string

  level: number
  baseSpd: number
  maxHp: number

  /** Toughness gauge total. Default 100. */
  toughness?: number

  /** Element weaknesses (broken state when toughness depleted). */
  weaknesses?: ElementName[]

  /**
   * Per-element resistance. Absent → defaults (0.0 for non-listed elements, 0.20
   * baseline if 'all' set). The 'all' key applies to every element when present.
   */
  resistances?: Partial<Record<ElementName | 'all', number>>

  /** Default 0.30 — matches HSR's standard elite/boss effect RES. */
  effectRes?: number
}

export interface BattleRecordScenario {
  /** Target battle duration in action value. */
  totalAv: number

  /** Starting skill points. Default 3. */
  startingSp?: number

  /** Starting energy as a fraction of maxEnergy. Default 0.5. */
  startingEnergyPercent?: number

  /** Slot to treat as the main DPS for tendency-driven 'singleAlly' routing. Default 0. */
  mainDpsSlot?: SlotIndex
}

// ─────────────────────────────────────────────────────────────────────────────
// Outputs — what actually happened
// ─────────────────────────────────────────────────────────────────────────────

export interface BattleRecordOutcome {
  /** Total elapsed AV at the end of the captured run. */
  totalAv: number

  /** Sum of all damage dealt to enemies. */
  totalDamage: number

  /** Convenience cache of totalDamage / totalAv. Producers may omit; consumers can derive. */
  damagePerAv?: number

  byActor: BattleRecordActorOutcome[]

  /**
   * Required turn-by-turn trace. Validation aggregates this and compares to
   * our sim's emitted log; the totals in `byActor` should be derivable from
   * the timeline as well.
   */
  timeline: BattleRecordEvent[]
}

export interface BattleRecordActorOutcome {
  slot: SlotIndex
  /**
   * Which actor on this slot — primary (the character) or memo/summon. Absent
   * → 'primary'. A team member with a memospsrite produces two outcomes for
   * the same slot, distinguished by this field.
   */
  actorKind?: ActorKind
  /**
   * Owning character. Optional because producers like the reference converter
   * don't necessarily know the CharacterId for each properName; consumers can
   * cross-reference against the input team config if they need it.
   */
  characterId?: CharacterId
  totalDamage: number
  /** Damage by AbilityKind. BASIC, SKILL, ULT, FUA, DOT, BREAK. */
  bySkillType: Partial<Record<AbilityKind, number>>
  /** How many times each ability was used. Optional — derivable from the timeline. */
  skillUseCount?: Partial<Record<AbilityKind, number>>
  /** Turn count this actor took. Optional — derivable. */
  turnsTaken?: number
}

export type BattleRecordActorRef =
  | {
    kind: 'ally'
    slot: SlotIndex
    /**
     * Which actor on this slot fired. Absent → 'primary' (the character themselves).
     * Memosprites and summons (Numby, Fuyuan, Mem, etc.) take their own turns and
     * deal their own damage; tagging the actor lets the validator distinguish
     * "Topaz's FUA" from "Numby's basic" even though both attribute to slot 0.
     */
    actorKind?: ActorKind
  }
  | { kind: 'enemy'; index: number }

/**
 * Event kinds in the timeline. ABILITY entries carry an `ability` field with
 * the AbilityKind and (for damage events) `damage` / `damageType` / target.
 */
export type BattleRecordEventKind =
  | 'TURN_START'
  | 'TURN_END'
  | 'ABILITY'
  | 'DOT_TICK'
  | 'WAVE_START'
  | 'WAVE_END'

export interface BattleRecordEvent {
  /** Cumulative AV at this event. Monotonically non-decreasing across the timeline. */
  actionValue: number

  actor: BattleRecordActorRef

  kind: BattleRecordEventKind

  /** Present when kind === 'ABILITY'. The skill type that fired. */
  ability?: AbilityKind

  /** Damage instance for ABILITY or DOT_TICK. Absent on TURN_START/_END/WAVE_*. */
  damage?: number

  /** Damage element. Absent → defaults to the character's element. */
  damageType?: DamageType

  /** Which enemy received the damage. Useful for AoE / mark validation. */
  targetEnemyIndex?: number

  /**
   * Per-hit breakdown for multi-hit abilities (Sparkle skill = 12 hits, etc.).
   * When present, `sum(hits)` should ≈ `damage`, which remains authoritative for diffing.
   * Optional — producers fill when available; consumers may ignore.
   */
  hits?: number[]

  /**
   * Event fires outside the natural AV-driven turn order — out-of-turn ult, FUA trigger,
   * immediate extra turn (Sparkle's gift). Lets validators group consecutive events into
   * the correct logical turn when diffing against another sim's timeline.
   */
  outOfTurn?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Tolerance + utility
// ─────────────────────────────────────────────────────────────────────────────

export interface ToleranceBands {
  /** Relative delta allowed on total team damage. Default 0.10. */
  totalDamage?: number
  /** Relative delta allowed on any single actor's total damage. Default 0.15. */
  perActorTotal?: number
  /** Relative delta allowed on any single (actor, skill-type) bucket. Default 0.25. */
  perAbility?: number
}

