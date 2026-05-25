// @vitest-environment jsdom
import { runAutobattle } from 'lib/autobattle/scheduler/scheduler'
import type {
  AutobattleInput,
  SlotIndex,
  TeamMemberInput,
} from 'lib/autobattle/types'
import {
  type MainStats,
  Parts,
  Sets,
  Stats,
  type StatsValues,
  type SubStats,
} from 'lib/constants/constants'
import { BasicStatToKey } from 'lib/optimization/basicStatsArray'
import { StatCalculator } from 'lib/relics/statCalculator'
import type { SimulationRelic } from 'lib/simulations/statSimulationTypes'
import { Metadata } from 'lib/state/metadataInitializer'
import { isFlat } from 'lib/utils/statUtils'
import type { CharacterId } from 'types/character'
import type { LightConeId } from 'types/lightCone'
import { describe, expect, test } from 'vitest'

Metadata.initialize()

// Per-character relic main stats (mirrors stat sim test fixtures: ATK% / SPD / element / ATK%).
type RelicMains = {
  body: MainStats
  feet: MainStats
  planarSphere: MainStats
  linkRope: MainStats
}

interface MemberFixture {
  slot: SlotIndex
  characterId: CharacterId
  lightConeId: LightConeId
  eidolon: number
  lightConeSuperimposition: number
  baseSpd: number
  maxEnergy: number
  path: TeamMemberInput['path']
  relicSet1: Sets
  relicSet2: Sets
  ornamentSet: Sets
  mains: RelicMains
  substatRollsBySub: Partial<Record<SubStats, number>>
}

// Builds a SimulationRelic with the given set + main stat + substats. Substat rolls are turned
// into stat values via StatCalculator. The body relic carries the substat rolls (matching the
// pattern in lib/simulations/tests/simTestUtils.ts:294-313).
function makeRelic(set: Sets, main: MainStats): SimulationRelic {
  const mainKey = BasicStatToKey[main as StatsValues]
  const mainValue = StatCalculator.getMaxedStatValue(main) * (isFlat(main) ? 1 : 0.01)
  return { set, condensedStats: [[mainKey, mainValue]] }
}

function withSubstatRolls(
  relic: SimulationRelic,
  rolls: Partial<Record<SubStats, number>>,
): SimulationRelic {
  const condensed = [...relic.condensedStats!]
  for (const [stat, count] of Object.entries(rolls)) {
    if (!count) continue
    const key = BasicStatToKey[stat as StatsValues]
    const perRoll = StatCalculator.getMaxedSubstatValue(stat as SubStats)
    const scale = isFlat(stat as StatsValues) ? 1 : 0.01
    condensed.push([key, perRoll * count * scale])
  }
  return { set: relic.set, condensedStats: condensed }
}

function relicsFor(fixture: MemberFixture): Partial<Record<Parts, SimulationRelic>> {
  return {
    [Parts.Head]: withSubstatRolls(makeRelic(fixture.relicSet1, Stats.HP), fixture.substatRollsBySub),
    [Parts.Hands]: makeRelic(fixture.relicSet1, Stats.ATK),
    [Parts.Body]: makeRelic(fixture.relicSet2, fixture.mains.body),
    [Parts.Feet]: makeRelic(fixture.relicSet2, fixture.mains.feet),
    [Parts.PlanarSphere]: makeRelic(fixture.ornamentSet, fixture.mains.planarSphere),
    [Parts.LinkRope]: makeRelic(fixture.ornamentSet, fixture.mains.linkRope),
  }
}

function memberInput(fixture: MemberFixture): TeamMemberInput {
  return {
    slot: fixture.slot,
    characterId: fixture.characterId,
    eidolon: fixture.eidolon as TeamMemberInput['eidolon'],
    lightConeId: fixture.lightConeId,
    lightConeSuperimposition: fixture.lightConeSuperimposition,
    equippedRelics: relicsFor(fixture),
    baseSpd: fixture.baseSpd,
    maxEnergy: fixture.maxEnergy,
    path: fixture.path,
  }
}

const STANDARD_ROLLS: Partial<Record<SubStats, number>> = {
  [Stats.ATK_P]: 10,
  [Stats.HP_P]: 0,
  [Stats.DEF_P]: 0,
  [Stats.HP]: 0,
  [Stats.ATK]: 0,
  [Stats.DEF]: 0,
  [Stats.SPD]: 10,
  [Stats.CR]: 10,
  [Stats.CD]: 10,
  [Stats.EHR]: 10,
  [Stats.RES]: 10,
  [Stats.BE]: 10,
}

// Test team: Feixiao (DPS) / Robin (buffer) / Sparkle (SP-positive) / Aventurine (sustain).
// Numbers chosen for plausible mid-game-ish relic stats. Goldens are frozen on first run.
const TEAM: MemberFixture[] = [
  {
    slot: 0,
    characterId: '1220' as CharacterId, // Feixiao
    lightConeId: '23031' as LightConeId, // I Venture Forth to Hunt
    eidolon: 0,
    lightConeSuperimposition: 1,
    baseSpd: 112,
    maxEnergy: 100,
    path: 'Hunt',
    relicSet1: Sets.TheWindSoaringValorous,
    relicSet2: Sets.TheWindSoaringValorous,
    ornamentSet: Sets.DuranDynastyOfRunningWolves,
    mains: { body: Stats.CD, feet: Stats.ATK_P, planarSphere: Stats.Wind_DMG, linkRope: Stats.ATK_P },
    substatRollsBySub: STANDARD_ROLLS,
  },
  {
    slot: 1,
    characterId: '1309' as CharacterId, // Robin
    lightConeId: '23026' as LightConeId, // Flowing Nightglow
    eidolon: 0,
    lightConeSuperimposition: 1,
    baseSpd: 102,
    maxEnergy: 160,
    path: 'Harmony',
    relicSet1: Sets.MusketeerOfWildWheat,
    relicSet2: Sets.MusketeerOfWildWheat,
    ornamentSet: Sets.SprightlyVonwacq,
    mains: { body: Stats.ATK_P, feet: Stats.SPD, planarSphere: Stats.ATK_P, linkRope: Stats.ERR },
    substatRollsBySub: STANDARD_ROLLS,
  },
  {
    slot: 2,
    characterId: '1306' as CharacterId, // Sparkle
    lightConeId: '23021' as LightConeId, // Earthly Escapade
    eidolon: 0,
    lightConeSuperimposition: 1,
    baseSpd: 101,
    maxEnergy: 110,
    path: 'Harmony',
    relicSet1: Sets.MusketeerOfWildWheat,
    relicSet2: Sets.MusketeerOfWildWheat,
    ornamentSet: Sets.SprightlyVonwacq,
    mains: { body: Stats.CD, feet: Stats.SPD, planarSphere: Stats.HP_P, linkRope: Stats.ERR },
    substatRollsBySub: STANDARD_ROLLS,
  },
  {
    slot: 3,
    characterId: '1304' as CharacterId, // Aventurine
    lightConeId: '23023' as LightConeId, // Inherently Unjust Destiny
    eidolon: 0,
    lightConeSuperimposition: 1,
    baseSpd: 102,
    maxEnergy: 110,
    path: 'Preservation',
    relicSet1: Sets.KnightOfPurityPalace,
    relicSet2: Sets.KnightOfPurityPalace,
    ornamentSet: Sets.BrokenKeel,
    mains: { body: Stats.DEF_P, feet: Stats.DEF_P, planarSphere: Stats.DEF_P, linkRope: Stats.ERR },
    substatRollsBySub: STANDARD_ROLLS,
  },
]

function makeInput(): AutobattleInput {
  return {
    team: TEAM.map(memberInput),
    mainDpsSlot: 0,
    enemies: [{ maxToughness: 100 }],
    enemySpd: 134,
    totalAv: 6000,
  }
}

// Golden refrozen on 2026-05-25 after wiring Robin's Talent passive energy
// ("Tonal Resonance": +2 Energy per non-enemy attack, including her own). Robin now ults
// more often (her ult cadence is energy-bound and Talent gives ~2/teammate-attack × ERR),
// re-opening more Concerto windows. Robin UNIQUE jumps 727k → 1158k. Other actors mostly
// unchanged. Team total 19.51M → 20.30M (+4.1%).
// To regenerate after pipeline changes: flip the `regen` test below to non-skip and copy
// its console output back into this block.
const GOLDEN = {
  grandTotal: 20304639,
  feixiaoTotal: 16809253,
  feixiaoFua: 4328636,
  feixiaoUlt: 8590339,
  feixiaoBreak: 162602,
  robinTotal: 1654910,
  robinUnique: 1157655,
  sparkleTotal: 433512,
  aventurineTotal: 1406964,
}

function approxEq(actual: number, expected: number, tolerance = 0.001): void {
  const diff = Math.abs(actual - expected)
  const rel = expected === 0 ? diff : diff / expected
  expect(rel).toBeLessThan(tolerance)
}

describe('autobattle team golden', () => {
  test.skip('regen golden values (flip to non-skip to capture new numbers)', () => {
    const result = runAutobattle(makeInput(), { buildResolvers: true })
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      grandTotal: result.ledger.grandTotal,
      totals: result.ledger.totalsByActor,
      bySource: result.ledger.byActorBySource,
    }, null, 2))
    expect(result.ledger.grandTotal).toBeGreaterThan(0)
  })

  test('Feixiao/Robin/Sparkle/Aventurine team @ 6000 AV matches frozen golden', () => {
    const result = runAutobattle(makeInput(), { buildResolvers: true })

    approxEq(result.ledger.grandTotal, GOLDEN.grandTotal)
    approxEq(result.ledger.totalsByActor['0:primary']!, GOLDEN.feixiaoTotal)
    approxEq(result.ledger.totalsByActor['1:primary']!, GOLDEN.robinTotal)
    approxEq(result.ledger.totalsByActor['2:primary']!, GOLDEN.sparkleTotal)
    approxEq(result.ledger.totalsByActor['3:primary']!, GOLDEN.aventurineTotal)

    // Shape: Feixiao should massively outdamage supports.
    expect(result.ledger.totalsByActor['0:primary']!).toBeGreaterThan(
      (result.ledger.totalsByActor['1:primary']! + result.ledger.totalsByActor['2:primary']!) * 5,
    )

    // Feixiao's FUA should account for a chunk of her damage thanks to her every-2 trigger.
    const feixiao = result.ledger.byActorBySource['0:primary']!
    approxEq(feixiao.FUA ?? 0, GOLDEN.feixiaoFua)
    approxEq(feixiao.ULT ?? 0, GOLDEN.feixiaoUlt)
    approxEq(feixiao.BREAK ?? 0, GOLDEN.feixiaoBreak)
    expect(feixiao.SKILL ?? 0).toBeGreaterThan(0)

    // Robin's Concerto Additional fires via the requiresSourceBuff-gated trigger on teammate
    // attacks during her Concerto window.
    const robin = result.ledger.byActorBySource['1:primary']!
    approxEq(robin.UNIQUE ?? 0, GOLDEN.robinUnique)
  })
})
