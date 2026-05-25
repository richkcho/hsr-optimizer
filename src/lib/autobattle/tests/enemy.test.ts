import {
  addOrRefreshDot,
  createEnemyState,
  onEnemyTurn,
  tickEnemyClock,
} from 'lib/autobattle/state/enemy'
import type { ActiveDot } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'
import { describe, expect, test } from 'vitest'

function makeDot(overrides: Partial<ActiveDot> = {}): ActiveDot {
  return {
    appliedBy: 0,
    hitTemplateRef: { ownerSlot: 0, abilityKind: AbilityKind.DOT, hitIndex: 0 },
    stacks: 1,
    remainingTurns: 3,
    ...overrides,
  }
}

describe('createEnemyState', () => {
  test('clockAv starts at 10000/spd', () => {
    const enemy = createEnemyState(3, 100, 100)
    expect(enemy.clockAv).toBe(100)
    expect(enemy.dots).toEqual([])
  })
})

describe('tickEnemyClock', () => {
  test('subtracts dt from clockAv', () => {
    const enemy = createEnemyState(3, 100, 100)
    tickEnemyClock(enemy, 25)
    expect(enemy.clockAv).toBe(75)
  })
})

describe('onEnemyTurn', () => {
  test('resets clock; returns dots that fire; decrements remainingTurns; expires when 0', () => {
    const enemy = createEnemyState(1, 100, 100)
    enemy.dots = [makeDot({ remainingTurns: 1 }), makeDot({ remainingTurns: 3, appliedBy: 1 })]
    enemy.clockAv = 0
    const firing = onEnemyTurn(enemy)
    expect(firing).toHaveLength(2)
    expect(enemy.clockAv).toBe(100)
    expect(enemy.dots).toHaveLength(1)  // the 1-turn dot expired
    expect(enemy.dots[0].remainingTurns).toBe(2)
  })
})

describe('addOrRefreshDot', () => {
  test('refreshes duration when the same applier + template already exists', () => {
    const enemy = createEnemyState(1, 100, 100)
    addOrRefreshDot(enemy, makeDot({ remainingTurns: 2 }))
    addOrRefreshDot(enemy, makeDot({ remainingTurns: 3 }))
    expect(enemy.dots).toHaveLength(1)
    expect(enemy.dots[0].remainingTurns).toBe(3)
  })

  test('treats different appliers as distinct dots', () => {
    const enemy = createEnemyState(1, 100, 100)
    addOrRefreshDot(enemy, makeDot({ appliedBy: 0 }))
    addOrRefreshDot(enemy, makeDot({ appliedBy: 1 }))
    expect(enemy.dots).toHaveLength(2)
  })
})
