import { TopazData } from 'lib/autobattle/characterData/1100/Topaz'
import { FeixiaoData } from 'lib/autobattle/characterData/1200/Feixiao'
import { AcheronData } from 'lib/autobattle/characterData/1300/Acheron'
import { RobinData } from 'lib/autobattle/characterData/1300/Robin'
import { SundayData } from 'lib/autobattle/characterData/1300/Sunday'
import { defaultCharacterData } from 'lib/autobattle/characterData/defaults'
import type { CharacterData } from 'lib/autobattle/types'
import type { CharacterId } from 'types/character'

// Per-character overrides. Each override is a partial CharacterData merged on top of
// defaultCharacterData. Adding a new override: drop a file under <era>/<Name>.ts and add an
// entry below — the alphabetical-by-id ordering keeps PRs reviewable.
const overrides: Partial<Record<CharacterId, Partial<CharacterData>>> = {
  '1112': TopazData,
  '1220': FeixiaoData,
  '1308': AcheronData,
  '1309': RobinData,
  '1313': SundayData,
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
  }
}
