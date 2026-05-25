import { toBattleRecordOutcome } from 'lib/autobattle/battleRecordAdapter'
import type { ActorId, AutobattleResult, SlotIndex, TurnLogEntry, TurnLogKind } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'
import { describe, expect, test } from 'vitest'

function makeEntry(
  actor: ActorId,
  kind: TurnLogKind,
  damage: number,
  elapsedAv: number,
): TurnLogEntry {
  return { elapsedAv, deltaAv: 0, actor, kind, description: '', damage }
}

function makeResult(log: TurnLogEntry[], finalElapsedAv: number): AutobattleResult {
  const ledger = {
    byActorBySource: {} as Record<string, Partial<Record<AbilityKind, number>>>,
    totalsByActor: {} as Record<string, number>,
    grandTotal: 0,
  }
  for (const e of log) {
    if (e.kind === 'TICK' || e.kind === 'BUFF_EXPIRE' || e.kind === 'ENEMY_TURN') continue
    const key = e.actor.entityName ? `${e.actor.slot}:${e.actor.kind}:${e.actor.entityName}` : `${e.actor.slot}:${e.actor.kind}`
    const ability = (e.kind === 'DOT_TICK' ? AbilityKind.DOT : (e.kind as AbilityKind))
    const sources = ledger.byActorBySource[key] ??= {}
    sources[ability] = (sources[ability] ?? 0) + (e.damage ?? 0)
    ledger.totalsByActor[key] = (ledger.totalsByActor[key] ?? 0) + (e.damage ?? 0)
    ledger.grandTotal += e.damage ?? 0
  }
  return {
    ledger,
    log,
    finalElapsedAv,
    finalSp: 3,
    finalEnergyBySlot: {} as Record<SlotIndex, number>,
  }
}

describe('toBattleRecordOutcome', () => {
  const topaz: ActorId = { slot: 0, kind: 'primary' }
  const numby: ActorId = { slot: 0, kind: 'memo', entityName: 'Numby' }
  const robin: ActorId = { slot: 1, kind: 'primary' }
  const team = [
    { slot: 0 as SlotIndex, characterId: '1112' as const },
    { slot: 1 as SlotIndex, characterId: '1309' as const },
  ]

  test('converts ability fires into ABILITY events', () => {
    const log = [
      makeEntry(topaz, AbilityKind.BASIC, 1000, 100),
      makeEntry(topaz, AbilityKind.SKILL, 5000, 200),
      makeEntry(robin, AbilityKind.BASIC, 800, 300),
    ]
    const out = toBattleRecordOutcome(makeResult(log, 300), { team })
    const abilities = out.timeline.filter((e) => e.kind === 'ABILITY')
    expect(abilities).toHaveLength(3)
    expect(abilities[0]).toMatchObject({ ability: AbilityKind.BASIC, damage: 1000, actor: { kind: 'ally', slot: 0 } })
    expect(abilities[0].outOfTurn).toBeUndefined()
    expect(out.totalDamage).toBe(6800)
    expect(out.totalAv).toBe(300)
  })

  test('FUA and ULT fires get outOfTurn: true', () => {
    const log = [
      makeEntry(topaz, AbilityKind.BASIC, 1000, 100),
      makeEntry(robin, AbilityKind.FUA, 500, 100),
      makeEntry(topaz, AbilityKind.ULT, 8000, 100),
    ]
    const out = toBattleRecordOutcome(makeResult(log, 100), { team })
    const fua = out.timeline.find((e) => e.ability === AbilityKind.FUA)
    const ult = out.timeline.find((e) => e.ability === AbilityKind.ULT)
    const basic = out.timeline.find((e) => e.ability === AbilityKind.BASIC)
    expect(fua?.outOfTurn).toBe(true)
    expect(ult?.outOfTurn).toBe(true)
    expect(basic?.outOfTurn).toBeUndefined()
  })

  test('memo actor produces a separate byActor bucket on the same slot', () => {
    const log = [
      makeEntry(topaz, AbilityKind.BASIC, 1000, 100),
      makeEntry(numby, AbilityKind.FUA, 5000, 100),
      makeEntry(numby, AbilityKind.FUA, 5000, 200),
    ]
    const out = toBattleRecordOutcome(makeResult(log, 200), { team })

    const primary = out.byActor.find((a) => a.slot === 0 && (a.actorKind ?? 'primary') === 'primary')
    const memo = out.byActor.find((a) => a.slot === 0 && a.actorKind === 'memo')
    expect(primary).toBeDefined()
    expect(memo).toBeDefined()
    expect(primary!.totalDamage).toBe(1000)
    expect(memo!.totalDamage).toBe(10000)
    expect(memo!.bySkillType[AbilityKind.FUA]).toBe(10000)
    expect(memo!.skillUseCount![AbilityKind.FUA]).toBe(2)
    expect(memo!.characterId).toBe('1112')   // memo inherits owner's characterId
  })

  test('omits actorKind in output when primary (schema convention)', () => {
    const log = [makeEntry(topaz, AbilityKind.BASIC, 1000, 100)]
    const out = toBattleRecordOutcome(makeResult(log, 100), { team })
    const topazBucket = out.byActor.find((a) => a.slot === 0)
    expect(topazBucket).toBeDefined()
    expect(topazBucket!.actorKind).toBeUndefined()
  })

  test('DOT_TICK entries map to DOT_TICK events with ability=DOT', () => {
    const log: TurnLogEntry[] = [
      { elapsedAv: 50, deltaAv: 0, actor: topaz, kind: 'DOT_TICK', description: '', damage: 200 },
      { elapsedAv: 100, deltaAv: 0, actor: topaz, kind: 'DOT_TICK', description: '', damage: 200 },
    ]
    const out = toBattleRecordOutcome(makeResult(log, 100), { team })
    const dots = out.timeline.filter((e) => e.kind === 'DOT_TICK')
    expect(dots).toHaveLength(2)
    expect(dots[0].ability).toBe(AbilityKind.DOT)
    const topazBucket = out.byActor.find((a) => a.slot === 0)
    expect(topazBucket!.totalDamage).toBe(400)
    expect(topazBucket!.bySkillType[AbilityKind.DOT]).toBe(400)
  })

  test('ENEMY_TURN, TICK, BUFF_EXPIRE entries are skipped (no damage events)', () => {
    const log: TurnLogEntry[] = [
      { elapsedAv: 50, deltaAv: 50, actor: topaz, kind: 'ENEMY_TURN', description: '' },
      { elapsedAv: 50, deltaAv: 0, actor: topaz, kind: 'TICK', description: '' },
      makeEntry(topaz, AbilityKind.BASIC, 1000, 100),
    ]
    const out = toBattleRecordOutcome(makeResult(log, 100), { team })
    expect(out.timeline).toHaveLength(1)
    expect(out.timeline[0].ability).toBe(AbilityKind.BASIC)
  })

  test('damage from a slot not in the input team is skipped in byActor', () => {
    const phantom: ActorId = { slot: 2, kind: 'primary' }
    const log = [
      makeEntry(topaz, AbilityKind.BASIC, 1000, 100),
      makeEntry(phantom, AbilityKind.BASIC, 9999, 100),
    ]
    const out = toBattleRecordOutcome(makeResult(log, 100), { team })
    expect(out.byActor).toHaveLength(1)
    expect(out.byActor[0].slot).toBe(0)
    // Timeline still contains the event (it's the byActor aggregation that filters)
    expect(out.timeline).toHaveLength(2)
  })
})
