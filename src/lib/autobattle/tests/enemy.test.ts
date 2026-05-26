import {
  addOrRefreshDot,
  breakActionDelayAv,
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
    expect(enemy.spd).toEqual([100, 100, 100])
    expect(enemy.clockAv).toEqual([100, 100, 100])
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
  test('subtracts dt from every enemy clock independently', () => {
    const enemy = createEnemyState(enemies(100, 100, 100), 100)
    tickEnemyClock(enemy, 25)
    expect(enemy.clockAv).toEqual([75, 75, 75])
  })
})

describe('onEnemyTurn', () => {
  test('enemyIndex=0 ticks shared DoTs and resets that enemy\'s clock', () => {
    const enemy = createEnemyState(enemies(100), 100)
    enemy.dots = [makeDot({ remainingTurns: 1 }), makeDot({ remainingTurns: 3, appliedBy: 1 })]
    enemy.clockAv[0] = 0
    const firing = onEnemyTurn(enemy, 0)
    expect(firing).toHaveLength(2)
    expect(enemy.clockAv[0]).toBe(100)
    expect(enemy.dots).toHaveLength(1)  // the 1-turn dot expired
    expect(enemy.dots[0].remainingTurns).toBe(2)
  })

  test('shared DoTs tick on every per-enemy turn (issue #10 v1 semantics)', () => {
    const enemy = createEnemyState(enemies(100, 100, 100), 100)
    enemy.dots = [makeDot({ remainingTurns: 3 })]
    enemy.clockAv[1] = 0
    const firing = onEnemyTurn(enemy, 1)
    expect(firing).toHaveLength(1)
    expect(enemy.dots[0].remainingTurns).toBe(2)  // ticked down on a non-[0] enemy turn
    expect(enemy.clockAv[1]).toBe(100)            // enemy[1]'s clock did reset
  })

  test('ticks only the firing enemy\'s broken-state countdown', () => {
    const enemy = createEnemyState(enemies(100, 100, 100), 100)
    enemy.brokenForEnemyTurns[0] = 2
    enemy.brokenForEnemyTurns[1] = 1
    // enemy 2 unbroken
    enemy.toughness[0] = 0
    enemy.toughness[1] = 0

    enemy.clockAv[1] = 0
    onEnemyTurn(enemy, 1)

    // Only enemy[1]'s countdown ticked.
    expect(enemy.brokenForEnemyTurns[0]).toBe(2)         // untouched
    expect(enemy.brokenForEnemyTurns[1]).toBeUndefined() // recovered
    expect(enemy.toughness[1]).toBe(100)                  // restored
    expect(enemy.brokenForEnemyTurns[2]).toBeUndefined() // never broken
  })
})

describe('breakActionDelayAv', () => {
  test('matches 0.25 × baseAV (capture-grounded boss SPD 158 → 15.823)', () => {
    const enemy = createEnemyState([{ maxToughness: 140 }], 158)
    expect(breakActionDelayAv(enemy, 0)).toBeCloseTo(15.823, 2)
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
