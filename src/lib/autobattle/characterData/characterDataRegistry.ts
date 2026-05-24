import { PelaData } from 'lib/autobattle/characterData/1100/Pela'
import { TopazData } from 'lib/autobattle/characterData/1100/Topaz'
import { FeixiaoData } from 'lib/autobattle/characterData/1200/Feixiao'
import { LingshaData } from 'lib/autobattle/characterData/1200/Lingsha'
import { YunliData } from 'lib/autobattle/characterData/1200/Yunli'
import { AcheronData } from 'lib/autobattle/characterData/1300/Acheron'
import { AventurineData } from 'lib/autobattle/characterData/1300/Aventurine'
import { RobinData } from 'lib/autobattle/characterData/1300/Robin'
import { SparkleData } from 'lib/autobattle/characterData/1300/Sparkle'
import { SundayData } from 'lib/autobattle/characterData/1300/Sunday'
import { AnaxaData } from 'lib/autobattle/characterData/1400/Anaxa'
import { CastoriceData } from 'lib/autobattle/characterData/1400/Castorice'
import { HyacineData } from 'lib/autobattle/characterData/1400/Hyacine'
import { MydeiData } from 'lib/autobattle/characterData/1400/Mydei'
import { PhainonData } from 'lib/autobattle/characterData/1400/Phainon'
import { TheHertaData } from 'lib/autobattle/characterData/1400/TheHerta'
import { defaultCharacterData } from 'lib/autobattle/characterData/defaults'
import type { CharacterData } from 'lib/autobattle/types'
import type { CharacterId } from 'types/character'

// Per-character overrides. Each override is a partial CharacterData merged on top of
// defaultCharacterData. Adding a new override: drop a file under <era>/<Name>.ts and add an
// entry below — the alphabetical-by-id ordering keeps PRs reviewable.
const overrides: Partial<Record<CharacterId, Partial<CharacterData>>> = {
  '1106': PelaData,
  '1112': TopazData,
  '1220': FeixiaoData,
  '1221': YunliData,
  '1222': LingshaData,
  '1304': AventurineData,
  '1306': SparkleData,
  '1308': AcheronData,
  '1309': RobinData,
  '1313': SundayData,
  '1401': TheHertaData,
  '1404': MydeiData,
  '1405': AnaxaData,
  '1407': CastoriceData,
  '1408': PhainonData,
  '1409': HyacineData,
} as Partial<Record<CharacterId, Partial<CharacterData>>>

export function registerCharacterData(id: CharacterId, data: Partial<CharacterData>): void {
  overrides[id] = data
}

export function resolveCharacterData(id: CharacterId): CharacterData {
  const override = overrides[id]
  if (!override) return defaultCharacterData
  return {
    ...defaultCharacterData,
    ...override,
    energyOnAction: { ...defaultCharacterData.energyOnAction, ...override.energyOnAction },
    // Deep-merge so a default hint (if ever added) survives an override that only sets one
    // kind. Conditional: keep `undefined` for chars with no hint to preserve the registry's
    // existing identity for those — test assertions rely on it.
    ...(override.abilityTargetHint && {
      abilityTargetHint: {
        ...defaultCharacterData.abilityTargetHint,
        ...override.abilityTargetHint,
      },
    }),
  }
}
