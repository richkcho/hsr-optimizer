import {
  advanceAllClocks,
  advancePercent,
  argminClock,
  avFromSpd,
  createClock,
  delayPercent,
  findClock,
} from 'lib/autobattle/scheduler/avQueue'
import type { ActorClock, BattleState } from 'lib/autobattle/types'
import { describe, expect, test } from 'vitest'

describe('avFromSpd', () => {
  test('100 SPD → 100 AV', () => {
    expect(avFromSpd(100)).toBe(100)
  })

  test('200 SPD → 50 AV', () => {
    expect(avFromSpd(200)).toBe(50)
  })

  test('guards zero SPD against Infinity', () => {
    expect(Number.isFinite(avFromSpd(0))).toBe(true)
  })
})

describe('createClock + argminClock', () => {
  test('creates a clock at 10000/spd', () => {
    const clock = createClock({ slot: 0, kind: 'primary' }, 100)
    expect(clock.remainingAv).toBe(100)
    expect(clock.id.slot).toBe(0)
  })

  test('argmin returns lowest remainingAv, ties go to first', () => {
    const clocks: ActorClock[] = [
      { id: { slot: 0, kind: 'primary' }, remainingAv: 200 },
      { id: { slot: 1, kind: 'primary' }, remainingAv: 100 },
      { id: { slot: 2, kind: 'primary' }, remainingAv: 100 },
    ]
    expect(argminClock(clocks)).toBe(1)
  })
})

describe('advanceAllClocks', () => {
  test('subtracts dt from every clock', () => {
    const clocks: ActorClock[] = [
      { id: { slot: 0, kind: 'primary' }, remainingAv: 200 },
      { id: { slot: 1, kind: 'primary' }, remainingAv: 100 },
    ]
    advanceAllClocks(clocks, 50)
    expect(clocks[0].remainingAv).toBe(150)
    expect(clocks[1].remainingAv).toBe(50)
  })
})

describe('advancePercent / delayPercent', () => {
  function fakeState(clocks: ActorClock[]): BattleState {
    return { clocks } as unknown as BattleState
  }

  test('100% advance reduces clock by full 10000/SPD', () => {
    const state = fakeState([{ id: { slot: 0, kind: 'primary' }, remainingAv: 100 }])
    advancePercent(state, 0, 100, 1.0)
    expect(state.clocks[0].remainingAv).toBe(0)
  })

  test('50% advance halves the clock contribution', () => {
    const state = fakeState([{ id: { slot: 0, kind: 'primary' }, remainingAv: 100 }])
    advancePercent(state, 0, 100, 0.5)
    expect(state.clocks[0].remainingAv).toBe(50)
  })

  test('advance clamps at 0', () => {
    const state = fakeState([{ id: { slot: 0, kind: 'primary' }, remainingAv: 10 }])
    advancePercent(state, 0, 100, 1.0)
    expect(state.clocks[0].remainingAv).toBe(0)
  })

  test('delay increases the clock', () => {
    const state = fakeState([{ id: { slot: 0, kind: 'primary' }, remainingAv: 50 }])
    delayPercent(state, 0, 100, 0.5)
    expect(state.clocks[0].remainingAv).toBe(100)
  })

  test('no-op on missing slot', () => {
    const state = fakeState([{ id: { slot: 0, kind: 'primary' }, remainingAv: 100 }])
    advancePercent(state, 3, 100, 1.0)
    expect(state.clocks[0].remainingAv).toBe(100)
  })
})

describe('findClock', () => {
  test('matches actor by slot + kind + entityName', () => {
    const state = {
      clocks: [
        { id: { slot: 0, kind: 'primary' }, remainingAv: 1 },
        { id: { slot: 0, kind: 'memo', entityName: 'Numby' }, remainingAv: 2 },
      ],
    } as unknown as BattleState
    expect(findClock(state, { slot: 0, kind: 'primary' })?.remainingAv).toBe(1)
    expect(findClock(state, { slot: 0, kind: 'memo', entityName: 'Numby' })?.remainingAv).toBe(2)
    expect(findClock(state, { slot: 0, kind: 'memo', entityName: 'Other' })).toBeUndefined()
  })
})
