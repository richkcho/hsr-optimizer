import {
  addOrRefreshDot,
  createEnemyState,
  onEnemyTurn,
  tickEnemyClock,
} from 'lib/autobattle/state/enemy'
import type { ActiveDot, AutobattleInputEnemy } from 'lib/autobattle/types'
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

function enemies(...toughnesses: number[]): AutobattleInputEnemy[] {
  return toughnesses.map((maxToughness) => ({ maxToughness }))
}

describe('createEnemyState', () => {
  test('builds per-enemy arrays of length === count', () => {
    const enemy = createEnemyState(enemies(140, 100, 100), 100)
    expect(enemy.count).toBe(3)
    expect(enemy.clockAv).toBe(100)
    expect(enemy.dots).toEqual([])
    expect(enemy.maxToughness).toEqual([140, 100, 100])
    expect(enemy.toughness).toEqual([140, 100, 100])
    expect(enemy.brokenForEnemyTurns).toEqual([undefined, undefined, undefined])
  })

  test('toughness array is independent of maxToughness (no aliasing)', () => {
    const enemy = createEnemyState(enemies(100), 100)
    enemy.toughness[0] = 0
    expect(enemy.maxToughness[0]).toBe(100)
  })

  test('weaknesses array plumbs per-enemy element lists; missing entries stay undefined', () => {
    const enemy = createEnemyState(
      [
        { maxToughness: 140, weaknesses: ['Fire', 'Ice'] },
        { maxToughness: 100 },
        { maxToughness: 100, weaknesses: ['Lightning'] },
      ],
      100,
    )
    expect(enemy.weaknesses).toEqual([['Fire', 'Ice'], undefined, ['Lightning']])
  })
})

describe('tickEnemyClock', () => {
  test('subtracts dt from clockAv', () => {
    const enemy = createEnemyState(enemies(100, 100, 100), 100)
    tickEnemyClock(enemy, 25)
    expect(enemy.clockAv).toBe(75)
  })
})

describe('onEnemyTurn', () => {
  test('resets clock; returns dots that fire; decrements remainingTurns; expires when 0', () => {
    const enemy = createEnemyState(enemies(100), 100)
    enemy.dots = [makeDot({ remainingTurns: 1 }), makeDot({ remainingTurns: 3, appliedBy: 1 })]
    enemy.clockAv = 0
    const firing = onEnemyTurn(enemy)
    expect(firing).toHaveLength(2)
    expect(enemy.clockAv).toBe(100)
    expect(enemy.dots).toHaveLength(1)  // the 1-turn dot expired
    expect(enemy.dots[0].remainingTurns).toBe(2)
  })

  test('ticks each enemy broken-state countdown independently', () => {
    const enemy = createEnemyState(enemies(100, 100, 100), 100)
    enemy.brokenForEnemyTurns[0] = 2
    enemy.brokenForEnemyTurns[1] = 1
    // enemy 2 unbroken
    enemy.toughness[0] = 0
    enemy.toughness[1] = 0

    enemy.clockAv = 0
    onEnemyTurn(enemy)

    expect(enemy.brokenForEnemyTurns[0]).toBe(1)
    expect(enemy.toughness[0]).toBe(0)         // still broken — toughness still 0

    expect(enemy.brokenForEnemyTurns[1]).toBeUndefined()  // recovered
    expect(enemy.toughness[1]).toBe(100)        // restored

    expect(enemy.brokenForEnemyTurns[2]).toBeUndefined()  // never broken
    expect(enemy.toughness[2]).toBe(100)
  })
})

describe('addOrRefreshDot', () => {
  test('refreshes duration when the same applier + template already exists', () => {
    const enemy = createEnemyState(enemies(100), 100)
    addOrRefreshDot(enemy, makeDot({ remainingTurns: 2 }))
    addOrRefreshDot(enemy, makeDot({ remainingTurns: 3 }))
    expect(enemy.dots).toHaveLength(1)
    expect(enemy.dots[0].remainingTurns).toBe(3)
  })

  test('treats different appliers as distinct dots', () => {
    const enemy = createEnemyState(enemies(100), 100)
    addOrRefreshDot(enemy, makeDot({ appliedBy: 0 }))
    addOrRefreshDot(enemy, makeDot({ appliedBy: 1 }))
    expect(enemy.dots).toHaveLength(2)
  })
})
