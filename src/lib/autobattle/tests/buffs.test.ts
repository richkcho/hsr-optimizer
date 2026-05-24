import {
  addBuff,
  hasActiveBuff,
  tickAvBuffs,
  tickTurnsOnEnemy,
  tickTurnsOnSource,
  tickTurnsOnTarget,
} from 'lib/autobattle/state/buffs'
import type { ActiveBuff, BattleState } from 'lib/autobattle/types'
import { describe, expect, test } from 'vitest'

function emptyState(buffs: ActiveBuff[] = []): BattleState {
  return { activeBuffs: buffs } as unknown as BattleState
}

function makeBuff(overrides: Partial<ActiveBuff> = {}): ActiveBuff {
  return {
    id: 'test',
    sourceSlot: 0,
    target: { kind: 'team' },
    conditionalKey: 'testFlag',
    remaining: 100,
    mode: 'av',
    ...overrides,
  }
}

describe('addBuff', () => {
  test('appends a new buff', () => {
    const state = emptyState()
    addBuff(state, makeBuff())
    expect(state.activeBuffs).toHaveLength(1)
  })

  test('same id+source refreshes instead of stacking', () => {
    const state = emptyState()
    addBuff(state, makeBuff({ remaining: 50 }))
    addBuff(state, makeBuff({ remaining: 200 }))
    expect(state.activeBuffs).toHaveLength(1)
    expect(state.activeBuffs[0].remaining).toBe(200)
  })

  test('different source does NOT collapse', () => {
    const state = emptyState()
    addBuff(state, makeBuff({ sourceSlot: 0 }))
    addBuff(state, makeBuff({ sourceSlot: 1 }))
    expect(state.activeBuffs).toHaveLength(2)
  })
})

describe('tickAvBuffs', () => {
  test('decrements AV-mode buffs and expires when remaining hits 0', () => {
    const state = emptyState([
      makeBuff({ id: 'a', mode: 'av', remaining: 100 }),
      makeBuff({ id: 'b', mode: 'av', remaining: 50 }),
      makeBuff({ id: 'c', mode: 'turnsOnTarget', remaining: 1 }),
    ])
    tickAvBuffs(state, 60)
    const ids = state.activeBuffs.map((b) => b.id).sort()
    expect(ids).toEqual(['a', 'c'])
    expect(state.activeBuffs.find((b) => b.id === 'a')?.remaining).toBe(40)
  })

  test('no-op on dt<=0', () => {
    const state = emptyState([makeBuff({ remaining: 100 })])
    tickAvBuffs(state, 0)
    expect(state.activeBuffs[0].remaining).toBe(100)
  })
})

describe('tickTurnsOnTarget', () => {
  test('decrements only buffs whose target is the acting slot (or team)', () => {
    const state = emptyState([
      makeBuff({ id: 'team', mode: 'turnsOnTarget', target: { kind: 'team' }, remaining: 2 }),
      makeBuff({ id: 'slot0', mode: 'turnsOnTarget', target: { kind: 'slot', slot: 0 }, remaining: 1 }),
      makeBuff({ id: 'slot1', mode: 'turnsOnTarget', target: { kind: 'slot', slot: 1 }, remaining: 1 }),
      makeBuff({ id: 'enemy', mode: 'turnsOnTarget', target: { kind: 'enemy' }, remaining: 1 }),
    ])
    tickTurnsOnTarget(state, 0)
    const ids = state.activeBuffs.map((b) => b.id).sort()
    expect(ids).toEqual(['enemy', 'slot1', 'team'])
    expect(state.activeBuffs.find((b) => b.id === 'team')?.remaining).toBe(1)
  })
})

describe('tickTurnsOnSource', () => {
  test('decrements only buffs whose sourceSlot is the acting slot', () => {
    const state = emptyState([
      makeBuff({ id: 'src0', mode: 'turnsOnSource', sourceSlot: 0, remaining: 1 }),
      makeBuff({ id: 'src1', mode: 'turnsOnSource', sourceSlot: 1, remaining: 1 }),
    ])
    tickTurnsOnSource(state, 0)
    const ids = state.activeBuffs.map((b) => b.id).sort()
    expect(ids).toEqual(['src1'])
  })
})

describe('tickTurnsOnEnemy + hasActiveBuff', () => {
  test('tickTurnsOnEnemy expires its own mode only', () => {
    const state = emptyState([
      makeBuff({ id: 'e1', mode: 'turnsOnEnemy', remaining: 1 }),
      makeBuff({ id: 'av', mode: 'av', remaining: 10 }),
    ])
    tickTurnsOnEnemy(state)
    const ids = state.activeBuffs.map((b) => b.id)
    expect(ids).toEqual(['av'])
  })

  test('hasActiveBuff returns true for matching id', () => {
    const state = emptyState([makeBuff({ id: 'foo' })])
    expect(hasActiveBuff(state, 'foo')).toBe(true)
    expect(hasActiveBuff(state, 'bar')).toBe(false)
  })
})
