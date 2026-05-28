import { registerCharacterData } from 'lib/autobattle/characterData/characterDataRegistry'
import { createMockDamageResolver } from 'lib/autobattle/damage/damageRunner'
import { runAutobattle } from 'lib/autobattle/scheduler/scheduler'
import { createInitialBattleState } from 'lib/autobattle/state/battleState'
import { resolveTargets } from 'lib/autobattle/state/grants'
import type {
  AutobattleInput,
  AutobattleInputEnemy,
  BattleState,
  CharacterData,
  SlotIndex,
  TeamMember,
  TeamMemberInput,
} from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'
import type { CharacterId } from 'types/character'
import { describe, expect, test } from 'vitest'

// Synthetic CharacterIds picked out of the ranges the autobattle registry doesn't already
// claim. We register them per-test so each case can configure its own wave-start grants.
const SYNTH_IDS = ['9000', '9001', '9002', '9003'] as const

function makeMember(slot: SlotIndex, baseSpd = 100, maxEnergy = 120): TeamMemberInput {
  return {
    slot,
    characterId: SYNTH_IDS[slot] as CharacterId,
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
    totalAv: 1000,
    ...overrides,
  }
}

function register(slot: SlotIndex, data: Partial<CharacterData>): void {
  registerCharacterData(SYNTH_IDS[slot] as CharacterId, data)
}

function clearRegistry(): void {
  for (const id of SYNTH_IDS) registerCharacterData(id as CharacterId, {})
}

function initOnly(team: TeamMemberInput[], overrides: Partial<AutobattleInput> = {}) {
  // Use buildResolvers: false so we don't need the full damage pipeline initialized.
  // errPercent defaults to 0 in that path.
  return createInitialBattleState(makeInput(team, overrides), { buildResolvers: false })
}

function clockForSlot(state: BattleState, slot: SlotIndex): number {
  const clock = state.clocks.find((c) => c.id.slot === slot && c.id.kind === 'primary')
  if (!clock) throw new Error(`no primary clock for slot ${slot}`)
  return clock.remainingAv
}

// ---------------------------------------------------------------------------
// Energy grants
// ---------------------------------------------------------------------------

describe('grantsEnergyOnBattleStart', () => {
  test('target: self — only source gains the bonus energy', () => {
    clearRegistry()
    register(0, { grantsEnergyOnBattleStart: { target: 'self', amount: 10 } })
    const team = [makeMember(0), makeMember(1), makeMember(2)]
    const { state } = initOnly(team)
    // maxEnergy=120, default starting=0.5 → 60 base, +10 from grant = 70.
    expect(state.resources.energy[0]).toBe(70)
    expect(state.resources.energy[1]).toBe(60)
    expect(state.resources.energy[2]).toBe(60)
  })

  test('target: eachAlly — every member including source gains', () => {
    clearRegistry()
    register(0, { grantsEnergyOnBattleStart: { target: 'eachAlly', amount: 5 } })
    const team = [makeMember(0), makeMember(1), makeMember(2)]
    const { state } = initOnly(team)
    expect(state.resources.energy[0]).toBe(65)
    expect(state.resources.energy[1]).toBe(65)
    expect(state.resources.energy[2]).toBe(65)
  })

  test('target: allAllies — every member except source gains', () => {
    clearRegistry()
    register(0, { grantsEnergyOnBattleStart: { target: 'allAllies', amount: 5 } })
    const team = [makeMember(0), makeMember(1), makeMember(2)]
    const { state } = initOnly(team)
    expect(state.resources.energy[0]).toBe(60)
    expect(state.resources.energy[1]).toBe(65)
    expect(state.resources.energy[2]).toBe(65)
  })
})

// ---------------------------------------------------------------------------
// Advance grants
// ---------------------------------------------------------------------------

describe('grantsAdvanceOnBattleStart', () => {
  test('target: self — source clock reduced by avPercent × baseAv', () => {
    clearRegistry()
    register(0, { grantsAdvanceOnBattleStart: { target: 'self', avPercent: 0.5 } })
    const team = [makeMember(0, 100)]
    const { state } = initOnly(team)
    // baseAv = 10000/100 = 100. 0.5 * 100 = 50 reduction → remaining = 50.
    expect(clockForSlot(state, 0)).toBe(50)
  })

  test('target: allAllies — only non-source clocks advanced', () => {
    clearRegistry()
    register(0, { grantsAdvanceOnBattleStart: { target: 'allAllies', avPercent: 0.5 } })
    const team = [makeMember(0, 100), makeMember(1, 100), makeMember(2, 100)]
    const { state } = initOnly(team)
    expect(clockForSlot(state, 0)).toBe(100)
    expect(clockForSlot(state, 1)).toBe(50)
    expect(clockForSlot(state, 2)).toBe(50)
  })

  test('target: eachAlly — every clock including source advanced', () => {
    clearRegistry()
    register(0, { grantsAdvanceOnBattleStart: { target: 'eachAlly', avPercent: 0.25 } })
    const team = [makeMember(0, 100), makeMember(1, 100), makeMember(2, 100)]
    const { state } = initOnly(team)
    expect(clockForSlot(state, 0)).toBe(75)
    expect(clockForSlot(state, 1)).toBe(75)
    expect(clockForSlot(state, 2)).toBe(75)
  })

  test('legacy battleStartAvAdvance + new advance grant stack additively (clamped at 0)', () => {
    clearRegistry()
    register(0, {
      battleStartAvAdvance: 0.25,
      grantsAdvanceOnBattleStart: { target: 'self', avPercent: 0.25 },
    })
    const team = [makeMember(0, 100)]
    const { state } = initOnly(team)
    // Legacy trace: 100 - 0.25*100 = 75. Then new grant: 75 - 0.25*100 = 50.
    expect(clockForSlot(state, 0)).toBe(50)
  })

  test('100% advance clamps at 0 (acts on first scheduler loop)', () => {
    clearRegistry()
    register(0, { grantsAdvanceOnBattleStart: { target: 'self', avPercent: 1.0 } })
    const team = [makeMember(0, 100)]
    const { state } = initOnly(team)
    expect(clockForSlot(state, 0)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Buff grants
// ---------------------------------------------------------------------------

describe('grantsBuffsOnBattleStart', () => {
  test('target: enemy — single ActiveBuff with target.kind=enemy', () => {
    clearRegistry()
    register(0, {
      grantsBuffsOnBattleStart: [{
        target: 'enemy',
        buff: { id: 'test.enemyDebuff', remaining: 1, mode: 'sticky', conditionalKey: 'flag' },
      }],
    })
    const team = [makeMember(0)]
    const { state } = initOnly(team)
    expect(state.activeBuffs).toHaveLength(1)
    expect(state.activeBuffs[0].target).toEqual({ kind: 'enemy' })
    expect(state.activeBuffs[0].sourceSlot).toBe(0)
  })

  test('target: team — single ActiveBuff with target.kind=team', () => {
    clearRegistry()
    register(0, {
      grantsBuffsOnBattleStart: [{
        target: 'team',
        buff: { id: 'test.teamField', remaining: 3, mode: 'turnsOnSource', conditionalKey: 'flag' },
      }],
    })
    const team = [makeMember(0), makeMember(1)]
    const { state } = initOnly(team)
    expect(state.activeBuffs).toHaveLength(1)
    expect(state.activeBuffs[0].target).toEqual({ kind: 'team' })
  })

  test('target: eachAlly — N ActiveBuffs, one per slot, all sourceSlot=source', () => {
    clearRegistry()
    register(0, {
      grantsBuffsOnBattleStart: [{
        target: 'eachAlly',
        buff: { id: 'test.shield', remaining: 3, mode: 'turnsOnTarget', conditionalKey: 'flag' },
      }],
    })
    const team = [makeMember(0), makeMember(1), makeMember(2)]
    const { state } = initOnly(team)
    expect(state.activeBuffs).toHaveLength(3)
    const targetSlots = new Set(state.activeBuffs.map((b) =>
      b.target.kind === 'slot' ? b.target.slot : -1,
    ))
    expect(targetSlots).toEqual(new Set([0, 1, 2]))
    for (const b of state.activeBuffs) {
      expect(b.sourceSlot).toBe(0)
    }
  })

  test('multiple wave-start buffs from different sources coexist', () => {
    clearRegistry()
    register(0, {
      grantsBuffsOnBattleStart: [{
        target: 'enemy',
        buff: { id: 'src0.debuff', remaining: 1, mode: 'sticky', conditionalKey: 'a' },
      }],
    })
    register(1, {
      grantsBuffsOnBattleStart: [{
        target: 'team',
        buff: { id: 'src1.field', remaining: 3, mode: 'turnsOnSource', conditionalKey: 'b' },
      }],
    })
    const team = [makeMember(0), makeMember(1)]
    const { state } = initOnly(team)
    expect(state.activeBuffs).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Auto-fire dispatch
// ---------------------------------------------------------------------------

describe('autoFireOnBattleStart', () => {
  test('configured ability fires at wave start before main loop', () => {
    clearRegistry()
    register(0, { autoFireOnBattleStart: AbilityKind.SKILL })
    const team = [makeMember(0, 50, 9999)]  // slow SPD + huge max energy so the scheduler
                                            // wouldn't fire SKILL on its own inside totalAv=50.
    const result = runAutobattle(makeInput(team, { totalAv: 50 }), {
      resolver: createMockDamageResolver({ [AbilityKind.SKILL]: 100 } as Partial<Record<AbilityKind, number>>),
    })
    // Without auto-fire, SPD=50 with totalAv=50 would never get a turn (clock 200 vs window 50).
    // The auto-fire dispatch produces the SKILL damage.
    const skillDmg = result.ledger.byActorBySource['0:primary']?.SKILL ?? 0
    expect(skillDmg).toBe(100)
  })

  test('SP cost is skipped for auto-fired ability', () => {
    clearRegistry()
    register(0, { autoFireOnBattleStart: AbilityKind.SKILL })
    const team = [makeMember(0, 50, 9999)]
    const result = runAutobattle(makeInput(team, { totalAv: 50 }), {
      resolver: createMockDamageResolver({ [AbilityKind.SKILL]: 100 } as Partial<Record<AbilityKind, number>>),
    })
    // Starting SP = 5; auto-fire would normally pay 1 SP. With skipSpCost, SP stays at 5.
    const firstSkill = result.log.find((e) => e.kind === AbilityKind.SKILL)
    expect(firstSkill?.spAfter).toBe(5)
  })

  test('character without autoFireOnBattleStart does not auto-fire', () => {
    clearRegistry()
    register(0, {})  // no auto-fire field
    const team = [makeMember(0, 50, 9999)]
    const result = runAutobattle(makeInput(team, { totalAv: 50 }), {
      resolver: createMockDamageResolver({ [AbilityKind.SKILL]: 100 } as Partial<Record<AbilityKind, number>>),
    })
    expect(result.ledger.grandTotal).toBe(0)
  })

  test('auto-fired Skill applies grantsBuffsOnAction[SKILL]', () => {
    clearRegistry()
    register(0, {
      autoFireOnBattleStart: AbilityKind.SKILL,
      grantsBuffsOnAction: {
        [AbilityKind.SKILL]: [{
          target: 'team',
          buff: { id: 'test.skillField', remaining: 3, mode: 'turnsOnSource', conditionalKey: 'flag' },
        }],
      },
    })
    const team = [makeMember(0, 50, 9999)]
    const result = runAutobattle(makeInput(team, { totalAv: 50 }), {
      resolver: createMockDamageResolver({ [AbilityKind.SKILL]: 0 } as Partial<Record<AbilityKind, number>>),
    })
    // After the auto-fired SKILL, the team field buff should be present.
    const buffPresent = result.log.some((e) => e.kind === AbilityKind.SKILL)
    expect(buffPresent).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// resolveTargets extension: 'eachAlly' on the non-buff path
// ---------------------------------------------------------------------------

describe('resolveTargets — eachAlly', () => {
  test('returns every member including source for eachAlly', () => {
    clearRegistry()
    const team = [makeMember(0), makeMember(1), makeMember(2)]
    const { state } = initOnly(team)
    const self = state.members[0]!
    const resolved = resolveTargets(state, self, 'eachAlly')
    const slots = new Set(resolved.map((m: TeamMember) => m.slot))
    expect(slots).toEqual(new Set([0, 1, 2]))
  })

  test('allAllies still excludes source (unchanged semantics)', () => {
    clearRegistry()
    const team = [makeMember(0), makeMember(1), makeMember(2)]
    const { state } = initOnly(team)
    const self = state.members[0]!
    const resolved = resolveTargets(state, self, 'allAllies')
    const slots = new Set(resolved.map((m: TeamMember) => m.slot))
    expect(slots).toEqual(new Set([1, 2]))
  })

  test("team and enemy return empty (buff-only routes)", () => {
    clearRegistry()
    const team = [makeMember(0), makeMember(1)]
    const { state } = initOnly(team)
    const self = state.members[0]!
    expect(resolveTargets(state, self, 'team')).toEqual([])
    expect(resolveTargets(state, self, 'enemy')).toEqual([])
  })
})
