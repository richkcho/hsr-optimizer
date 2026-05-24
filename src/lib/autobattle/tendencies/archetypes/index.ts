import { aoeDpsTendency } from 'lib/autobattle/tendencies/archetypes/aoeDps'
import { debufferTendency } from 'lib/autobattle/tendencies/archetypes/debuffer'
import { fieldBufferTendency } from 'lib/autobattle/tendencies/archetypes/fieldBuffer'
import { fuaDpsTendency } from 'lib/autobattle/tendencies/archetypes/fuaDps'
import { healerTendency } from 'lib/autobattle/tendencies/archetypes/healer'
import { pureDpsTendency } from 'lib/autobattle/tendencies/archetypes/pureDps'
import { spPositiveBufferTendency } from 'lib/autobattle/tendencies/archetypes/spPositiveBuffer'
import { stackDpsTendency } from 'lib/autobattle/tendencies/archetypes/stackDps'
import type { ArchetypeId, Tendency } from 'lib/autobattle/types'

export const archetypeRegistry: Record<ArchetypeId, Tendency> = {
  pureDps: pureDpsTendency,
  fuaDps: fuaDpsTendency,
  aoeDps: aoeDpsTendency,
  stackDps: stackDpsTendency,
  spPositiveBuffer: spPositiveBufferTendency,
  fieldBuffer: fieldBufferTendency,
  healer: healerTendency,
  debuffer: debufferTendency,
}
