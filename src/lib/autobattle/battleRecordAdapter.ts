/**
 * Convert an `AutobattleResult` into the `BattleRecordOutcome` shape so it can
 * be diffed against an externally captured outcome (see `battleRecord.ts` and
 * `.tmp/ext/extract-battle-record.cjs`).
 *
 * Conventions chosen to match the reference converter:
 *   - ULT and FUA fires get `outOfTurn: true` (the reference emits
 *     `UltimateStart` and `FUAStart` for both, which are always tagged
 *     out-of-turn in our schema).
 *   - `damageType` and `targetEnemyIndex` are omitted — our sim doesn't model
 *     per-enemy state, and consumers default damageType to the character's
 *     element when missing.
 *   - `hits[]` is omitted — `damageRunner.ts` computes a per-hit array but
 *     discards it before logging. If we ever wire that through, populate here.
 */
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'
import type {
  BattleRecordActorOutcome,
  BattleRecordActorRef,
  BattleRecordEvent,
  BattleRecordOutcome,
} from 'lib/autobattle/battleRecord'
import type {
  ActorId,
  ActorKind,
  AutobattleResult,
  SlotIndex,
  TurnLogEntry,
  TurnLogKind,
} from 'lib/autobattle/types'
import type { CharacterId } from 'types/character'

type AbilityKindSet = ReadonlySet<TurnLogKind>
const ABILITY_KINDS: AbilityKindSet = new Set(Object.values(AbilityKind))

function isAbilityKind(kind: TurnLogKind): kind is AbilityKind {
  return ABILITY_KINDS.has(kind)
}

function toActorRef(actor: ActorId): BattleRecordActorRef {
  if (actor.kind === 'primary') return { kind: 'ally', slot: actor.slot }
  return { kind: 'ally', slot: actor.slot, actorKind: actor.kind }
}

function convertEntry(entry: TurnLogEntry): BattleRecordEvent | null {
  const actor = toActorRef(entry.actor)
  const base = { actionValue: entry.elapsedAv, actor }

  if (entry.kind === 'DOT_TICK') {
    return { ...base, kind: 'DOT_TICK', ability: AbilityKind.DOT, damage: entry.damage ?? 0 }
  }
  if (isAbilityKind(entry.kind)) {
    const outOfTurn = entry.kind === AbilityKind.ULT || entry.kind === AbilityKind.FUA
    return {
      ...base,
      kind: 'ABILITY',
      ability: entry.kind,
      damage: entry.damage ?? 0,
      ...(outOfTurn ? { outOfTurn: true } : {}),
    }
  }
  // 'TICK' / 'BUFF_EXPIRE' / 'ENEMY_TURN' carry no damage and don't map to our
  // schema kinds. Skip.
  return null
}

interface ByActorAccum {
  slot: SlotIndex
  actorKind: ActorKind
  characterId: CharacterId
  totalDamage: number
  bySkillType: Partial<Record<AbilityKind, number>>
  skillUseCount: Partial<Record<AbilityKind, number>>
  turnsTaken: number
}

function byActorKey(slot: SlotIndex, actorKind: ActorKind): string {
  return `${slot}:${actorKind}`
}

export interface AdapterInput {
  team: { slot: SlotIndex; characterId: CharacterId }[]
}

/**
 * Build a BattleRecord.outcome view of the sim's result. `input.team` provides
 * the slot→characterId map needed to populate `BattleRecordActorOutcome.characterId`.
 */
export function toBattleRecordOutcome(result: AutobattleResult, input: AdapterInput): BattleRecordOutcome {
  const timeline: BattleRecordEvent[] = []
  for (const entry of result.log) {
    const ev = convertEntry(entry)
    if (ev) timeline.push(ev)
  }

  const charByslot: Partial<Record<SlotIndex, CharacterId>> = {}
  for (const m of input.team) charByslot[m.slot] = m.characterId

  const acc = new Map<string, ByActorAccum>()
  function bucket(actor: BattleRecordActorRef): ByActorAccum | null {
    if (actor.kind !== 'ally') return null
    const kind = actor.actorKind ?? 'primary'
    const key = byActorKey(actor.slot, kind)
    let b = acc.get(key)
    if (!b) {
      const cid = charByslot[actor.slot]
      if (!cid) return null  // damage from a slot not in the input team — skip
      b = {
        slot: actor.slot,
        actorKind: kind,
        characterId: cid,
        totalDamage: 0,
        bySkillType: {},
        skillUseCount: {},
        turnsTaken: 0,
      }
      acc.set(key, b)
    }
    return b
  }

  for (const ev of timeline) {
    const b = bucket(ev.actor)
    if (!b) continue
    if (ev.kind === 'ABILITY' || ev.kind === 'DOT_TICK') {
      if (typeof ev.damage === 'number') b.totalDamage += ev.damage
      if (ev.ability) {
        b.bySkillType[ev.ability] = (b.bySkillType[ev.ability] ?? 0) + (ev.damage ?? 0)
        b.skillUseCount[ev.ability] = (b.skillUseCount[ev.ability] ?? 0) + 1
      }
    }
    if (ev.kind === 'TURN_START') b.turnsTaken += 1
  }

  const byActor: BattleRecordActorOutcome[] = [...acc.values()]
    .sort((a, b) =>
      a.slot - b.slot
      || (a.actorKind === b.actorKind ? 0 : a.actorKind === 'primary' ? -1 : 1)
    )
    .map((b) => ({
      slot: b.slot,
      // Omit actorKind when 'primary' to match the schema convention.
      ...(b.actorKind === 'primary' ? {} : { actorKind: b.actorKind }),
      characterId: b.characterId,
      totalDamage: b.totalDamage,
      bySkillType: b.bySkillType,
      skillUseCount: b.skillUseCount,
      turnsTaken: b.turnsTaken,
    }))

  return {
    totalAv: result.finalElapsedAv,
    totalDamage: result.ledger.grandTotal,
    damagePerAv: result.finalElapsedAv > 0 ? result.ledger.grandTotal / result.finalElapsedAv : 0,
    byActor,
    timeline,
  }
}
