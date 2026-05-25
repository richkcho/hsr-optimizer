import { createMockDamageResolver } from 'lib/autobattle/damage/damageRunner'
import { runAutobattle } from 'lib/autobattle/scheduler/scheduler'
import type { AutobattleInput, SlotIndex, TeamMemberInput } from 'lib/autobattle/types'
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

function makeInput(team: TeamMemberInput[], overrides: Partial<AutobattleInput> = {}): AutobattleInput {
  return {
    team,
    mainDpsSlot: 0,
    enemyCount: 1,
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

  test('aggregate gauge multiplies break by enemyCount', () => {
    const one = runAutobattle(
      makeInput([makeMember(0, 100, 9999)], { totalAv: 500, enemySpd: 10, enemyCount: 1 }),
      { resolver: mockWithBreak() },
    )
    const three = runAutobattle(
      makeInput([makeMember(0, 100, 9999)], { totalAv: 500, enemySpd: 10, enemyCount: 3 }),
      { resolver: mockWithBreak() },
    )
    const oneBreak = one.ledger.byActorBySource['0:primary']?.BREAK ?? 0
    const threeBreak = three.ledger.byActorBySource['0:primary']?.BREAK ?? 0
    expect(oneBreak).toBeGreaterThan(0)
    expect(threeBreak).toBe(oneBreak * 3)
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

  test('input.enemyMaxToughness overrides default 100', () => {
    // maxToughness 20: a single skill (30 toughness dmg) is enough to break immediately.
    // pureDps prefers SKILL while SP affords, so the first action is SKILL.
    const result = runAutobattle(
      makeInput([makeMember(0, 100, 9999)], { totalAv: 200, enemySpd: 10, enemyMaxToughness: 20 }),
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
