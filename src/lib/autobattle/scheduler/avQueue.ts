import type { ActorClock, ActorId, BattleState, SlotIndex } from 'lib/autobattle/types'
import { serializeActorId } from 'lib/autobattle/types'

export function createClock(id: ActorId, spd: number): ActorClock {
  return { id, remainingAv: avFromSpd(spd) }
}

export function avFromSpd(spd: number): number {
  // Standard HSR formula. Guard against zero/negative SPD to avoid Infinity in scheduler loop.
  return 10000 / Math.max(0.001, spd)
}

// Returns the index of the clock with the smallest remainingAv. Ties broken by lower slot.
export function argminClock(clocks: ActorClock[]): number {
  let minIdx = 0
  let minAv = clocks[0]?.remainingAv ?? Number.POSITIVE_INFINITY
  for (let i = 1; i < clocks.length; i++) {
    const av = clocks[i].remainingAv
    if (av < minAv) {
      minAv = av
      minIdx = i
    }
  }
  return minIdx
}

export function advanceAllClocks(clocks: ActorClock[], dt: number): void {
  for (const c of clocks) c.remainingAv -= dt
}

export function findClock(state: BattleState, id: ActorId): ActorClock | undefined {
  const key = serializeActorId(id)
  return state.clocks.find((c) => serializeActorId(c.id) === key)
}

// Applies an "advance forward" effect (Bronya skill, Sparkle skill, Sunday ult, etc.).
// Reduces the target's remainingAv by avPercent of their 10000/SPD baseline.
// HSR semantics: 100% advance = full reduction to 0 (the target acts immediately).
export function advancePercent(
  state: BattleState,
  targetSlot: SlotIndex,
  spd: number,
  avPercent: number,
): void {
  const primaryId: ActorId = { slot: targetSlot, kind: 'primary' }
  const clock = findClock(state, primaryId)
  if (!clock) return
  const delta = avPercent * avFromSpd(spd)
  clock.remainingAv = Math.max(0, clock.remainingAv - delta)
}

// Delay is the inverse — increases remainingAv. Same percentage semantics.
export function delayPercent(
  state: BattleState,
  targetSlot: SlotIndex,
  spd: number,
  avPercent: number,
): void {
  const primaryId: ActorId = { slot: targetSlot, kind: 'primary' }
  const clock = findClock(state, primaryId)
  if (!clock) return
  const delta = avPercent * avFromSpd(spd)
  clock.remainingAv += delta
}
