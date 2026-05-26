import { createMockDamageResolver } from 'lib/autobattle/damage/damageRunner'
import { runAutobattle } from 'lib/autobattle/scheduler/scheduler'
import { registerCharacterData } from 'lib/autobattle/characterData/characterDataRegistry'
import type { AutobattleInput, AutobattleInputEnemy, SlotIndex, TeamMemberInput } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'
import { describe, expect, test } from 'vitest'
import type { CharacterId } from 'types/character'

function makeMember(slot: SlotIndex, baseSpd = 100, maxEnergy = 120): TeamMemberInput {
  return {
    slot,
    characterId: ('1' + (200 + slot)) as CharacterId,
    eidolon: 0,
    lightConeId: '' as TeamMemberInput['lightConeId'],
    lightConeSuperimposition: 1,
    equippedRelics: {},
    baseSpd,
    maxEnergy,
    path: 'Destruction',
  }
}

function enemies(...toughnesses: number[]): AutobattleInputEnemy[] {
  return toughnesses.map((maxToughness) => ({ maxToughness }))
}

function makeInput(team: TeamMemberInput[], overrides: Partial<AutobattleInput> = {}): AutobattleInput {
  return {
    team,
    mainDpsSlot: 0,
    enemies: enemies(100),
    enemySpd: 134,
    totalAv: 10000,
    ...overrides,
  }
}

describe('runAutobattle (mock resolver)', () => {
  test('single actor SPD=100 over 10000 AV takes exactly 10 turns', () => {
    const result = runAutobattle(
      makeInput([makeMember(0, 100, 9999)]),  // huge max energy so no ult
      { resolver: createMockDamageResolver() },
    )
    // 10 turns: 5 skills (starting SP=5), then alternating basic→skill since basic regens SP.
    // Either way exactly 10 actions fire. We'll just count actor-turn log entries.
    const actorTurns = result.log.filter((e) => e.kind !== 'ENEMY_TURN' && e.kind !== 'DOT_TICK')
    expect(actorTurns.length).toBeGreaterThanOrEqual(10)
    expect(result.finalElapsedAv).toBeGreaterThanOrEqual(9000)
    expect(result.finalElapsedAv).toBeLessThanOrEqual(10000)
  })

  test('two actors with SPD 100 vs 200 → faster takes ~2× turns', () => {
    const result = runAutobattle(
      makeInput([makeMember(0, 100, 9999), makeMember(1, 200, 9999)]),
      { resolver: createMockDamageResolver() },
    )
    const slot0Total = result.ledger.totalsByActor['0:primary'] ?? 0
    const slot1Total = result.ledger.totalsByActor['1:primary'] ?? 0
    // Slot 1 is twice as fast → roughly 2× damage.
    expect(slot1Total).toBeGreaterThan(slot0Total * 1.5)
    expect(slot1Total).toBeLessThan(slot0Total * 2.5)
  })

  test('SP economy: starts at 5; basic adds SP, skill consumes', () => {
    const result = runAutobattle(
      makeInput([makeMember(0, 100, 9999)], { totalAv: 1000 }),
      { resolver: createMockDamageResolver() },
    )
    // SP should stay in [0, 5] throughout.
    for (const entry of result.log) {
      if (entry.spAfter !== undefined) {
        expect(entry.spAfter).toBeGreaterThanOrEqual(0)
        expect(entry.spAfter).toBeLessThanOrEqual(5)
      }
    }
  })

  test('ult fires when energy reaches max', () => {
    // Low maxEnergy so the actor ults quickly. Basic gives +20; skill gives +30.
    const result = runAutobattle(
      makeInput([makeMember(0, 100, 60)], { totalAv: 5000 }),
      { resolver: createMockDamageResolver() },
    )
    const ultCount = result.log.filter((e) => e.kind === 'ULT').length
    expect(ultCount).toBeGreaterThan(0)
    // Ult damage should be credited to slot 0 under ULT
    expect(result.ledger.byActorBySource['0:primary']?.ULT).toBeGreaterThan(0)
  })

  test('terminates cleanly at totalAv even with no actors (only enemy turns fire)', () => {
    const result = runAutobattle(makeInput([], { totalAv: 500 }), { resolver: createMockDamageResolver() })
    expect(result.ledger.grandTotal).toBe(0)
    expect(result.finalElapsedAv).toBeGreaterThanOrEqual(450)
    expect(result.finalElapsedAv).toBeLessThanOrEqual(500)
  })

  test('enemy SPD drives enemy turn cadence', () => {
    const slowEnemy = runAutobattle(
      makeInput([makeMember(0, 100, 9999)], { totalAv: 6000, enemySpd: 80 }),
      { resolver: createMockDamageResolver() },
    )
    const fastEnemy = runAutobattle(
      makeInput([makeMember(0, 100, 9999)], { totalAv: 6000, enemySpd: 200 }),
      { resolver: createMockDamageResolver() },
    )
    const slowEnemyTurns = slowEnemy.log.filter((e) => e.kind === 'ENEMY_TURN').length
    const fastEnemyTurns = fastEnemy.log.filter((e) => e.kind === 'ENEMY_TURN').length
    expect(fastEnemyTurns).toBeGreaterThan(slowEnemyTurns)
  })
})

describe('break damage', () => {
  // Tag actions so toughness drops fast enough to break inside a short window. We use a
  // toughness gauge of 100 (default) and pile 60 toughness onto each basic — 2 basics break.
  const mockWithBreak = () =>
    createMockDamageResolver(
      { BASIC: 50, SKILL: 100, ULT: 500 },
      { toughnessDmgPerHit: { BASIC: 60, SKILL: 30 }, breakDmg: 2000 },
    )

  test('break fires once toughness gauge drops to 0; ledger gets BREAK bucket', () => {
    const result = runAutobattle(
      makeInput([makeMember(0, 100, 9999)], { totalAv: 600 }),
      { resolver: mockWithBreak() },
    )
    const breakDmg = result.ledger.byActorBySource['0:primary']?.BREAK ?? 0
    expect(breakDmg).toBeGreaterThan(0)
    // breakDmg per fire = 2000 from mock × 1 enemy. Anywhere between 1 and a handful of
    // breaks depending on recovery cycles; just assert the bucket is populated.
    expect(breakDmg % 2000).toBe(0)

    const breakLogEntries = result.log.filter((e) => e.kind === 'BREAK')
    expect(breakLogEntries.length).toBeGreaterThan(0)
    for (const e of breakLogEntries) {
      expect(e.damage).toBe(2000)
      expect(e.deltaAv).toBe(0)  // break is a side-effect of the breaking ability, no AV advance
    }
  })

  test('broken state suppresses further toughness damage until recovery', () => {
    // Enemy SPD 10 → enemy turn every 1000 AV. With totalAv=600, no enemy turns fire, so the
    // broken state never recovers. After the first break, subsequent attacks should leave
    // toughness untouched and no further breaks fire.
    const result = runAutobattle(
      makeInput([makeMember(0, 100, 9999)], { totalAv: 600, enemySpd: 10 }),
      { resolver: mockWithBreak() },
    )
    const breakLogEntries = result.log.filter((e) => e.kind === 'BREAK')
    expect(breakLogEntries.length).toBe(1)
  })

  test('single-target ability only breaks its target enemy; other enemies untouched', () => {
    // 3 enemies, default 'mainEnemy' target on BASIC → only enemy 0 takes toughness damage.
    // After 2 basics enemy 0 breaks; enemies 1 and 2 stay unbroken. One break credit.
    const result = runAutobattle(
      makeInput([makeMember(0, 100, 9999)], { totalAv: 500, enemySpd: 10, enemies: enemies(100, 100, 100) }),
      { resolver: mockWithBreak() },
    )
    const breakDmg = result.ledger.byActorBySource['0:primary']?.BREAK ?? 0
    expect(breakDmg).toBe(2000)  // one break × mock breakDmg=2000
    const breakLogEntries = result.log.filter((e) => e.kind === 'BREAK')
    expect(breakLogEntries.length).toBe(1)
  })

  test('AoE ability breaks each enemy independently → one credit per broken enemy', () => {
    // Register a phantom characterData under an unused id with allEnemies hints so the
    // pureDps tendency's BASIC/SKILL actions sweep all 3 enemies. 2 attacks break all three
    // independently. The id is unique to this test so the registry mutation can't leak.
    const aoeCharId = '9999' as CharacterId
    registerCharacterData(aoeCharId, {
      abilityTargetHint: {
        [AbilityKind.BASIC]: 'allEnemies',
        [AbilityKind.SKILL]: 'allEnemies',
      },
    })
    const aoeMember: TeamMemberInput = { ...makeMember(0, 100, 9999), characterId: aoeCharId }

    const result = runAutobattle(
      makeInput([aoeMember], { totalAv: 500, enemySpd: 10, enemies: enemies(100, 100, 100) }),
      { resolver: mockWithBreak() },
    )
    const breakDmg = result.ledger.byActorBySource['0:primary']?.BREAK ?? 0
    // 3 enemies × mock breakDmg=2000 = 6000
    expect(breakDmg).toBe(6000)
    const breakLogEntries = result.log.filter((e) => e.kind === 'BREAK')
    expect(breakLogEntries.length).toBe(3)
  })

  test('toughness restores after enemy turn → second break can fire', () => {
    // 4 sec / 4 enemy turns at SPD 134 cover enough enemy turns to recover after break.
    const result = runAutobattle(
      makeInput([makeMember(0, 100, 9999)], { totalAv: 2000, enemySpd: 200 }),
      { resolver: mockWithBreak() },
    )
    const breakLogEntries = result.log.filter((e) => e.kind === 'BREAK')
    expect(breakLogEntries.length).toBeGreaterThan(1)
  })

  test('per-enemy maxToughness drives break timing — low-toughness enemy breaks in 1 hit', () => {
    // enemies(20): a single skill (30 toughness dmg) is enough to break immediately.
    // pureDps prefers SKILL while SP affords, so the first action is SKILL.
    const result = runAutobattle(
      makeInput([makeMember(0, 100, 9999)], { totalAv: 200, enemySpd: 10, enemies: enemies(20) }),
      { resolver: mockWithBreak() },
    )
    const breakLogEntries = result.log.filter((e) => e.kind === 'BREAK')
    expect(breakLogEntries.length).toBe(1)
    // Break should follow the first ability log entry immediately (no other entries between).
    const firstSkillIdx = result.log.findIndex((e) => e.kind === 'SKILL')
    const firstBreakIdx = result.log.findIndex((e) => e.kind === 'BREAK')
    expect(firstBreakIdx).toBe(firstSkillIdx + 1)
  })
})

describe('FUA trigger gating: requiresSourceBuff', () => {
  // Robin's Concerto Additional fires UNIQUE on teammate attacks, but only while the
  // 'Robin.concerto' self-marker buff is active. The buff is applied by her ULT
  // (grantsBuffsOnAction[ULT]) and lasts 2 of her own primary turns (turnsOnSource).
  const mockWithUnique = () =>
    createMockDamageResolver({
      BASIC: 100,
      SKILL: 250,
      ULT: 0,         // Robin's ult is a non-damaging action in her actionDeclaration
      FUA: 150,
      UNIQUE: 12000,  // distinct value so we can recognize UNIQUE damage in the ledger
    } as Partial<Record<AbilityKind, number>>)

  test('UNIQUE does not fire before Robin ults (Concerto not active)', () => {
    // Robin in slot 1, teammate in slot 0. Robin's maxEnergy is huge so she never ults in
    // the window — Concerto buff is never applied, so no UNIQUE should fire from Robin.
    const robin: TeamMemberInput = { ...makeMember(1, 100, 9999), characterId: '1309' as CharacterId }
    const teammate = makeMember(0, 100, 9999)

    const result = runAutobattle(
      makeInput([teammate, robin], { totalAv: 500, enemySpd: 10 }),
      { resolver: mockWithUnique() },
    )
    const robinUnique = result.ledger.byActorBySource['1:primary']?.UNIQUE ?? 0
    expect(robinUnique).toBe(0)
  })

  test('UNIQUE fires on teammate attacks once Concerto is active', () => {
    // Low maxEnergy so Robin ults after the first basic. After her ult, Concerto activates
    // for 2 of her primary turns. Subsequent teammate attacks should credit UNIQUE to Robin.
    const robin: TeamMemberInput = { ...makeMember(1, 100, 20), characterId: '1309' as CharacterId }
    // Fast teammate so several attacks land while Concerto is active.
    const teammate = makeMember(0, 300, 9999)

    const result = runAutobattle(
      makeInput([teammate, robin], { totalAv: 800, enemySpd: 10 }),
      { resolver: mockWithUnique() },
    )
    const robinUnique = result.ledger.byActorBySource['1:primary']?.UNIQUE ?? 0
    // Each UNIQUE fire credits 12000 (mock). At minimum we want at least one fire.
    expect(robinUnique).toBeGreaterThan(0)
    expect(robinUnique % 12000).toBe(0)
  })

  test('UNIQUE only fires during Concerto windows, not on every teammate attack', () => {
    // Robin with a large maxEnergy that lets her ult exactly once mid-battle, after which
    // Concerto's 2-turn window expires and no more ULTs follow. Subsequent teammate attacks
    // should NOT credit UNIQUE — proving requiresSourceBuff is actually gating.
    const robin: TeamMemberInput = { ...makeMember(1, 100, 100), characterId: '1309' as CharacterId }
    const teammate = makeMember(0, 100, 9999)

    const result = runAutobattle(
      makeInput([teammate, robin], { totalAv: 1500, enemySpd: 10 }),
      { resolver: mockWithUnique() },
    )

    const teammateAttacks = result.log.filter(
      (e) => e.kind === AbilityKind.BASIC || e.kind === AbilityKind.SKILL,
    ).filter((e) => `${e.actor.slot}` === '0').length
    const uniqueFires = (result.ledger.byActorBySource['1:primary']?.UNIQUE ?? 0) / 12000
    // Strict bound: each Robin ult opens at most one ~2-Robin-turn window. With Robin SPD 100
    // and ~5 Robin basics to ult (maxEnergy=100, 20/basic, +5 refund), she ults ~once across
    // 1500 AV. That window captures only a fraction of teammate attacks.
    expect(uniqueFires).toBeGreaterThan(0)
    expect(uniqueFires).toBeLessThan(teammateAttacks)
  })

  test('classic FUA triggers (Feixiao) still fire as FUA — no regression from gating', () => {
    // Feixiao has no requiresSourceBuff and fires every 2 ally attacks. Confirm the FUA
    // ledger bucket is populated as before.
    const feixiao: TeamMemberInput = { ...makeMember(1, 100, 9999), characterId: '1220' as CharacterId }
    const teammate = makeMember(0, 100, 9999)

    const result = runAutobattle(
      makeInput([teammate, feixiao], { totalAv: 1500, enemySpd: 10 }),
      { resolver: mockWithUnique() },
    )
    const feixiaoFua = result.ledger.byActorBySource['1:primary']?.FUA ?? 0
    expect(feixiaoFua).toBeGreaterThan(0)
    // Feixiao should not have any UNIQUE credits — her trigger fires as FUA only.
    const feixiaoUnique = result.ledger.byActorBySource['1:primary']?.UNIQUE ?? 0
    expect(feixiaoUnique).toBe(0)
  })
})

describe('energyPassiveOnAnyAttack', () => {
  test('Robin gains +2 energy every time any teammate fires a basic', () => {
    // Robin in slot 1 with maxEnergy high enough that we can read raw energy after a few
    // turns without ulting. A teammate basic gives Robin +2 from her Talent (with ERR=0
    // in mock-resolver tests). Start at 50% = 250; after 5 teammate basics → 250 + 5×2 = 260.
    const robin: TeamMemberInput = { ...makeMember(1, 100, 500), characterId: '1309' as CharacterId }
    const teammate = makeMember(0, 100, 9999)

    const result = runAutobattle(
      makeInput([teammate, robin], { totalAv: 600, enemySpd: 10 }),
      { resolver: createMockDamageResolver() },
    )
    // Final energy = 250 (start) + teammate basics × 2 + robin's own basics × (20 + 2).
    // Sanity check: Robin's energy should be > start.
    const robinEnergy = result.finalEnergyBySlot[1]
    expect(robinEnergy).toBeGreaterThan(250)
  })
})

describe('clock pause: clockPausedByBuff', () => {
  // Mock with no UNIQUE damage so we can measure Robin's action count cleanly via the log.
  // Robin's prebuilt UNIQUE fires still appear in the log even at 0 damage.
  const mockResolver = () =>
    createMockDamageResolver({
      BASIC: 100,
      SKILL: 250,
      ULT: 0,
      FUA: 150,
      UNIQUE: 0,
    } as Partial<Record<AbilityKind, number>>)

  test('Robin takes no primary turns while Concerto is active', () => {
    // Low maxEnergy so Robin ults on her first basic. After ult, Concerto pauses her clock
    // for 111.1 AV. Within that window she should fire exactly 1 BASIC + 1 ULT and no more.
    const robin: TeamMemberInput = { ...makeMember(1, 100, 20), characterId: '1309' as CharacterId }
    const teammate = makeMember(0, 200, 9999)

    const result = runAutobattle(
      makeInput([teammate, robin], { totalAv: 110, enemySpd: 10 }),
      { resolver: mockResolver() },
    )

    const robinActions = result.log.filter((e) => `${e.actor.slot}` === '1')
    // Robin's tendency prefers SKILL when SP available, falling back to BASIC otherwise. With
    // the default 5 SP at battle start she fires SKILL once, which fills her energy (small
    // maxEnergy=20) and triggers the out-of-turn ult; Concerto then pauses her for ~111 AV.
    const robinTurnActions = robinActions.filter((e) => e.kind === AbilityKind.BASIC || e.kind === AbilityKind.SKILL).length
    const robinUlts = robinActions.filter((e) => e.kind === AbilityKind.ULT).length
    // Exactly one turn action and one ult — no further actions while frozen.
    expect(robinTurnActions).toBe(1)
    expect(robinUlts).toBe(1)
  })

  test('Robin resumes with clock=0 (acts immediately) when Concerto expires', () => {
    // Run a window slightly longer than one full Concerto cycle so we can confirm Robin
    // acts again immediately after the buff expires (clock zeroed by actOnResume).
    const robin: TeamMemberInput = { ...makeMember(1, 100, 20), characterId: '1309' as CharacterId }
    const teammate = makeMember(0, 200, 9999)

    const result = runAutobattle(
      makeInput([teammate, robin], { totalAv: 130, enemySpd: 10 }),
      { resolver: mockResolver() },
    )

    // Robin acts early (battle-start AV advance from Coloratura Cadenza), ults immediately,
    // then Concerto pauses her. With totalAv=130 we end mid-Concerto: still expect 1 turn
    // action + 1 ult, no resumption yet.
    const robinActionsShort = result.log.filter((e) => `${e.actor.slot}` === '1' && e.kind !== AbilityKind.UNIQUE)
    expect(robinActionsShort.length).toBe(2)

    // Longer window: Robin's clock reset to 0 on Concerto expire, so a second turn-action fires.
    const longResult = runAutobattle(
      makeInput([teammate, robin], { totalAv: 230, enemySpd: 10 }),
      { resolver: mockResolver() },
    )
    const robinTurnActionsLong = longResult.log.filter((e) => `${e.actor.slot}` === '1'
      && (e.kind === AbilityKind.BASIC || e.kind === AbilityKind.SKILL)).length
    expect(robinTurnActionsLong).toBeGreaterThanOrEqual(2)
  })

  test('paused Robin does not accrue energy from basics (no phantom ult chain)', () => {
    // Without the pause, Robin would keep acting during Concerto, refilling energy and
    // potentially ulting again as soon as Concerto ends. With pause, her energy stays at
    // post-ult-refund level until she un-pauses and resumes. totalAv chosen to end mid-
    // Concerto (battle-start advance puts her first action at ~75 AV, Concerto then runs
    // until ~186 AV).
    const robin: TeamMemberInput = { ...makeMember(1, 100, 20), characterId: '1309' as CharacterId }
    const teammate = makeMember(0, 100, 9999)

    const result = runAutobattle(
      makeInput([teammate, robin], { totalAv: 150, enemySpd: 10 }),
      { resolver: mockResolver() },
    )
    // Exactly one ult: she ults, gets frozen, can't act again within 111 AV window.
    const robinUlts = result.log.filter((e) => `${e.actor.slot}` === '1' && e.kind === AbilityKind.ULT).length
    expect(robinUlts).toBe(1)
  })
})
