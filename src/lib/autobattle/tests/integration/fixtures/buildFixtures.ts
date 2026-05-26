// Test fixtures that produce realistic per-relic stat distributions for autobattle cross-
// checks. Replaces the older "70 substat rolls on the head" synthetic approach.
//
// Each fixture builds an array of `UnaugmentedRelic` objects programmatically and runs them
// through `RelicAugmenter.augment` — the same augmentation step the live import path uses.
// Tests then convert via the production `relicToSimulationRelic` to feed `AutobattleInput`.
//
// The fixture data is hand-tuned so per-character aggregate substat totals (ATK%, CR, CD,
// SPD, BE, EHR, RES) approximate the previous `STANDARD_ROLLS` placeholder (10 high rolls of
// each priority substat), letting the existing reference goldens stay in tolerance. Tuning
// can drift over time — these fixtures are placeholders until real captured Kel-Z builds
// land alongside each scenario.

import { Parts, type MainStats, Sets, Stats, type StatsValues, type SubStats, SubStatValues } from 'lib/constants/constants'
import { RelicAugmenter } from 'lib/relics/relicAugmenter'
import { StatCalculator } from 'lib/relics/statCalculator'
import type { Relic, RelicSubstatMetadata, UnaugmentedRelic } from 'types/relic'

// Per-substat target roll count for a single character. Mirrors the previous STANDARD_ROLLS
// totals so calibration stays close. Tests may override this per character if a future
// scenario captures real relic data.
export const PLACEHOLDER_SUBSTAT_TARGETS: Record<SubStats, number> = {
  [Stats.ATK_P]: 10,
  [Stats.SPD]: 10,
  [Stats.CR]: 10,
  [Stats.CD]: 10,
  [Stats.EHR]: 10,
  [Stats.RES]: 10,
  [Stats.BE]: 10,
  [Stats.HP_P]: 0,
  [Stats.DEF_P]: 0,
  [Stats.HP]: 0,
  [Stats.ATK]: 0,
  [Stats.DEF]: 0,
}

export interface RelicSpec {
  part: Parts
  set: Sets
  mainStat: MainStats
  // Per-substat number of rolls (1..6 each). Substats not present in the map are absent.
  rolls: Partial<Record<SubStats, number>>
}

export interface CharacterBuild {
  characterId: string
  relics: RelicSpec[]
}

// Build placeholder relics for a character. Each spec is turned into an `UnaugmentedRelic`
// (substat value = max-high × rolls), then augmented via `RelicAugmenter` to produce the
// final `Relic` ready for `relicToSimulationRelic`.
export function buildRelicsForCharacter(spec: CharacterBuild): Partial<Record<Parts, Relic>> {
  const out: Partial<Record<Parts, Relic>> = {}
  for (const relicSpec of spec.relics) {
    const unaugmented = specToUnaugmented(spec.characterId, relicSpec)
    const augmented = RelicAugmenter.augment(unaugmented)
    if (!augmented) continue
    out[relicSpec.part] = augmented
  }
  return out
}

function specToUnaugmented(characterId: string, spec: RelicSpec): UnaugmentedRelic {
  const substats: RelicSubstatMetadata[] = []
  for (const [stat, rolls] of Object.entries(spec.rolls)) {
    if (!rolls) continue
    const subStat = stat as SubStats
    // Each "roll" is the max-high value at 5★ grade — matches the previous test convention
    // (`StatCalculator.getMaxedSubstatValue` returns the high tier).
    const perRoll = StatCalculator.getMaxedSubstatValue(subStat)
    substats.push({ stat: subStat, value: perRoll * rolls })
  }

  // Main stat value: max for 5★ +15. `getMaxedStatValue` returns the percent already in
  // raw-% form for percent stats (e.g. 19.439) which is what RelicAugmenter expects on
  // `relic.main.value`; flat stats stay as flat values.
  const mainValueRawPercent = StatCalculator.getMaxedStatValue(spec.mainStat as StatsValues)
    * (isFlatMain(spec.mainStat) ? 1 : 100)

  return {
    part: spec.part,
    set: spec.set,
    enhance: 15,
    grade: 5,
    main: { stat: spec.mainStat, value: mainValueRawPercent },
    substats,
    previewSubstats: [],
    equippedBy: characterId as UnaugmentedRelic['equippedBy'],
    verified: false,
  }
}

function isFlatMain(stat: MainStats): boolean {
  return stat === Stats.HP || stat === Stats.ATK || stat === Stats.DEF || stat === Stats.SPD
}

// Builds a generic 6-relic set with realistic per-relic substat counts (4 subs per relic,
// ≤ 6 rolls per substat). Each relic carries 4 substats; per-substat aggregate across all
// six relics is calibrated empirically against the topaz-ruanmei reference outcome so the
// TEAM-total tolerance holds.
//
// Calibration is approximate. Each scenario should eventually capture a real Kel-Z dump of
// the player's actual relic distribution; this generator is the fallback when no capture is
// available. See README for the migration path.
//
// Distribution table (per-relic rolls):
//   - Head:   ATK% 1, CR 1, CD 1, SPD 1
//   - Hands:  ATK% 1, CR 1, CD 1, BE  1
//   - Body:   CR 1, CD 1, SPD 1, EHR 1
//   - Feet:   ATK% 1, CD 1, SPD 1, RES 1
//   - Sphere: ATK% 1, CR 1, BE 1, EHR 1
//   - Rope:   SPD 1, BE 1, EHR 1, RES 1
// Per-substat totals: ATK% 4, CR 4, CD 4, SPD 4, BE 3, EHR 3, RES 2.
export function defaultRollLayout(): Array<Partial<Record<SubStats, number>>> {
  return [
    // Head
    { [Stats.ATK_P]: 1, [Stats.CR]: 1, [Stats.CD]: 1, [Stats.SPD]: 1 },
    // Hands
    { [Stats.ATK_P]: 1, [Stats.CR]: 1, [Stats.CD]: 1, [Stats.BE]: 1 },
    // Body
    { [Stats.CR]: 1, [Stats.CD]: 1, [Stats.SPD]: 1, [Stats.EHR]: 1 },
    // Feet
    { [Stats.ATK_P]: 1, [Stats.CD]: 1, [Stats.SPD]: 1, [Stats.RES]: 1 },
    // Sphere
    { [Stats.ATK_P]: 1, [Stats.CR]: 1, [Stats.BE]: 1, [Stats.EHR]: 1 },
    // Rope
    { [Stats.SPD]: 1, [Stats.BE]: 1, [Stats.EHR]: 1, [Stats.RES]: 1 },
  ]
}

export interface CharacterBuildArgs {
  characterId: string
  relicSet1: Sets
  relicSet2: Sets
  ornamentSet: Sets
  mains: { body: MainStats; feet: MainStats; planarSphere: MainStats; linkRope: MainStats }
}

// Construct a 6-relic character build from a high-level spec (sets + main stats), filling
// substats from `defaultRollLayout`. The two 2pc set pairings (set1 on head/hands, set2 on
// body/feet) mirror the legacy `buildEquippedRelics` helper.
export function buildPlaceholderCharacter(args: CharacterBuildArgs): CharacterBuild {
  const layout = defaultRollLayout()
  return {
    characterId: args.characterId,
    relics: [
      { part: Parts.Head, set: args.relicSet1, mainStat: Stats.HP, rolls: layout[0] },
      { part: Parts.Hands, set: args.relicSet1, mainStat: Stats.ATK, rolls: layout[1] },
      { part: Parts.Body, set: args.relicSet2, mainStat: args.mains.body, rolls: layout[2] },
      { part: Parts.Feet, set: args.relicSet2, mainStat: args.mains.feet, rolls: layout[3] },
      { part: Parts.PlanarSphere, set: args.ornamentSet, mainStat: args.mains.planarSphere, rolls: layout[4] },
      { part: Parts.LinkRope, set: args.ornamentSet, mainStat: args.mains.linkRope, rolls: layout[5] },
    ],
  }
}
