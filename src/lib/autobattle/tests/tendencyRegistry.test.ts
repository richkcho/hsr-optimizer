import { aoeDpsTendency } from 'lib/autobattle/tendencies/archetypes/aoeDps'
import { fieldBufferTendency } from 'lib/autobattle/tendencies/archetypes/fieldBuffer'
import { fuaDpsTendency } from 'lib/autobattle/tendencies/archetypes/fuaDps'
import { healerTendency } from 'lib/autobattle/tendencies/archetypes/healer'
import { spPositiveBufferTendency } from 'lib/autobattle/tendencies/archetypes/spPositiveBuffer'
import { stackDpsTendency } from 'lib/autobattle/tendencies/archetypes/stackDps'
import { resolveTendency } from 'lib/autobattle/tendencies/tendencyRegistry'
import { describe, expect, test } from 'vitest'
import type { CharacterId } from 'types/character'

describe('tendencyRegistry', () => {
  test('Robin override (1309) → fieldBuffer archetype', () => {
    expect(resolveTendency('1309' as CharacterId, 'Harmony').archetype).toBe(fieldBufferTendency.archetype)
  })

  test('Bronya override (1101) → spPositiveBuffer archetype', () => {
    expect(resolveTendency('1101' as CharacterId, 'Harmony').archetype).toBe(spPositiveBufferTendency.archetype)
  })

  test('Acheron override (1308) → stackDps archetype', () => {
    expect(resolveTendency('1308' as CharacterId, 'Nihility').archetype).toBe(stackDpsTendency.archetype)
  })

  test('Feixiao override (1220) → fuaDps archetype', () => {
    expect(resolveTendency('1220' as CharacterId, 'Hunt').archetype).toBe(fuaDpsTendency.archetype)
  })

  test('Huohuo override (1217) → healer archetype', () => {
    expect(resolveTendency('1217' as CharacterId, 'Abundance').archetype).toBe(healerTendency.archetype)
  })

  test('unknown character falls back to path archetype', () => {
    expect(resolveTendency('9999' as CharacterId, 'Erudition').archetype).toBe(aoeDpsTendency.archetype)
    expect(resolveTendency('9999' as CharacterId, 'Hunt').archetype).toBe('pureDps')
  })
})
