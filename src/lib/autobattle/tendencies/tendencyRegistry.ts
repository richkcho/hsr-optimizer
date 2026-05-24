import { BronyaTendency } from 'lib/autobattle/tendencies/1100/Bronya'
import { PelaTendency } from 'lib/autobattle/tendencies/1100/Pela'
import { TopazTendency } from 'lib/autobattle/tendencies/1100/Topaz'
import { FeixiaoTendency } from 'lib/autobattle/tendencies/1200/Feixiao'
import { HuohuoTendency } from 'lib/autobattle/tendencies/1200/Huohuo'
import { LingshaTendency } from 'lib/autobattle/tendencies/1200/Lingsha'
import { YunliTendency } from 'lib/autobattle/tendencies/1200/Yunli'
import { AcheronTendency } from 'lib/autobattle/tendencies/1300/Acheron'
import { AventurineTendency } from 'lib/autobattle/tendencies/1300/Aventurine'
import { RobinTendency } from 'lib/autobattle/tendencies/1300/Robin'
import { SparkleTendency } from 'lib/autobattle/tendencies/1300/Sparkle'
import { SundayTendency } from 'lib/autobattle/tendencies/1300/Sunday'
import { AnaxaTendency } from 'lib/autobattle/tendencies/1400/Anaxa'
import { PhainonTendency } from 'lib/autobattle/tendencies/1400/Phainon'
import { TheHertaTendency } from 'lib/autobattle/tendencies/1400/TheHerta'
import { archetypeRegistry } from 'lib/autobattle/tendencies/archetypes'
import { PATH_TO_ARCHETYPE } from 'lib/autobattle/tendencies/pathDefault'
import type { Tendency } from 'lib/autobattle/types'
import type { PathName } from 'lib/constants/constants'
import type { CharacterId } from 'types/character'

// Per-character overrides. The path → archetype fallback handles every other character.
const overrides: Partial<Record<CharacterId, Tendency>> = {
  '1101': BronyaTendency,
  '1106': PelaTendency,
  '1112': TopazTendency,
  '1217': HuohuoTendency,
  '1220': FeixiaoTendency,
  '1221': YunliTendency,
  '1222': LingshaTendency,
  '1304': AventurineTendency,
  '1306': SparkleTendency,
  '1308': AcheronTendency,
  '1309': RobinTendency,
  '1313': SundayTendency,
  '1401': TheHertaTendency,
  '1405': AnaxaTendency,
  '1408': PhainonTendency,
} as Partial<Record<CharacterId, Tendency>>

export function registerTendency(id: CharacterId, tendency: Tendency): void {
  overrides[id] = tendency
}

export function resolveTendency(characterId: CharacterId, path: PathName): Tendency {
  const override = overrides[characterId]
  if (override) return override
  return archetypeRegistry[PATH_TO_ARCHETYPE[path]]
}
