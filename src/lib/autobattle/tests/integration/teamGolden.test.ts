// @vitest-environment jsdom
import { runAutobattle } from 'lib/autobattle/scheduler/scheduler'
import { buildPlaceholderCharacter } from 'lib/autobattle/tests/integration/fixtures/buildFixtures'
import { loadEquippedRelics } from 'lib/autobattle/tests/integration/fixtureLoader'
import type {
  AutobattleInput,
  SlotIndex,
  TeamMemberInput,
} from 'lib/autobattle/types'
import {
  type MainStats,
  Sets,
  Stats,
} from 'lib/constants/constants'
import { Metadata } from 'lib/state/metadataInitializer'
import type { CharacterId } from 'types/character'
import type { LightConeId } from 'types/lightCone'
import { describe, expect, test } from 'vitest'

Metadata.initialize()

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
  mains: { body: MainStats; feet: MainStats; planarSphere: MainStats; linkRope: MainStats }
}

function memberInput(fixture: MemberFixture): TeamMemberInput {
  // Relics are synthesized by buildPlaceholderCharacter (realistic per-relic substat counts)
  // and routed through the same RelicAugmenter + relicToSimulationRelic path the live UI
  // uses. Future scenarios can swap the placeholder for a real Kel-Z dump.
  const build = buildPlaceholderCharacter({
    characterId: fixture.characterId,
    relicSet1: fixture.relicSet1,
    relicSet2: fixture.relicSet2,
    ornamentSet: fixture.ornamentSet,
    mains: fixture.mains,
  })
  return {
    slot: fixture.slot,
    characterId: fixture.characterId,
    eidolon: fixture.eidolon as TeamMemberInput['eidolon'],
    lightConeId: fixture.lightConeId,
    lightConeSuperimposition: fixture.lightConeSuperimposition,
    equippedRelics: loadEquippedRelics(build),
    baseSpd: fixture.baseSpd,
    maxEnergy: fixture.maxEnergy,
    path: fixture.path,
  }
}

// Test team: Feixiao (DPS) / Robin (buffer) / Sparkle (SP-positive) / Aventurine (sustain).
// Sets + main stats reflect plausible mid-game canonical builds; substats are placeholder.
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

// Golden refrozen on 2026-05-25 after Robin/Aventurine tendency refinements:
//   - Robin: skill only when Pinion's Aria buff is down (turnsOnSource: 3); basic otherwise
//     to preserve SP for the team's DPS. Shifts her from ~all-skill to ~1/3 skill cadence.
//   - Aventurine: skill only when Aventurine.shield buff is down (turnsOnSource: 3); basic
//     otherwise. The buff refreshes on both his skill and ult, so ult-cycle uptime keeps
//     him at near-zero skill use after the opening turn.
// Per-character deltas vs the prior pre-tendency-change golden:
//   - Feixiao total: 24.4M → 22.5M (-8%). She gets fewer Robin-Concerto advances since
//     Robin ults less frequently when she's mixing in basics.
//   - Robin total: 2.91M → 2.14M (-27%). Fewer ult cycles → fewer UNIQUE Concerto fires.
//   - Aventurine total: 3.80M → 3.22M (-15%). One fewer ult per the cascade above.
//   - Sparkle within ±3%.
// To regenerate after pipeline changes: flip the `regen` test below to non-skip and copy
// its console output back into this block.
const GOLDEN = {
  grandTotal: 28100970,
  feixiaoTotal: 22465272,
  feixiaoFua: 5519999,
  feixiaoUlt: 11610716,
  feixiaoBreak: 117068,
  robinTotal: 2137094,
  robinUnique: 1754570,
  sparkleTotal: 279998,
  aventurineTotal: 3218604,
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
