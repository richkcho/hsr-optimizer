import { defaultCharacterData } from 'lib/autobattle/characterData/defaults'
import type { CharacterData } from 'lib/autobattle/types'
import type { CharacterId } from 'types/character'

// Per-character overrides populated in Phase D+. Each override is a partial CharacterData
// that gets merged on top of defaultCharacterData.
const overrides: Partial<Record<CharacterId, Partial<CharacterData>>> = {}

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
