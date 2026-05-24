import { addDamage, createLedger } from 'lib/autobattle/state/ledger'
import type { ActorId } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'
import { describe, expect, test } from 'vitest'

describe('DamageLedger', () => {
  test('add credits actor + source + grand total', () => {
    const ledger = createLedger()
    const actor: ActorId = { slot: 0, kind: 'primary' }
    addDamage(ledger, actor, AbilityKind.BASIC, 100)
    addDamage(ledger, actor, AbilityKind.SKILL, 250)
    expect(ledger.grandTotal).toBe(350)
    expect(ledger.totalsByActor['0:primary']).toBe(350)
    expect(ledger.byActorBySource['0:primary']?.BASIC).toBe(100)
    expect(ledger.byActorBySource['0:primary']?.SKILL).toBe(250)
  })

  test('ignores non-positive damage', () => {
    const ledger = createLedger()
    addDamage(ledger, { slot: 0, kind: 'primary' }, AbilityKind.BASIC, 0)
    addDamage(ledger, { slot: 0, kind: 'primary' }, AbilityKind.BASIC, -50)
    expect(ledger.grandTotal).toBe(0)
  })

  test('separates memo/summon from primary by ActorId key', () => {
    const ledger = createLedger()
    addDamage(ledger, { slot: 0, kind: 'primary' }, AbilityKind.BASIC, 100)
    addDamage(ledger, { slot: 0, kind: 'memo', entityName: 'Numby' }, AbilityKind.FUA, 200)
    expect(ledger.totalsByActor['0:primary']).toBe(100)
    expect(ledger.totalsByActor['0:memo:Numby']).toBe(200)
  })
})
