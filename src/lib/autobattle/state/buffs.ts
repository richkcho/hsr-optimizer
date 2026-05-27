import type { ActiveBuff, BattleState, SlotIndex } from 'lib/autobattle/types'

export function addBuff(state: BattleState, buff: ActiveBuff): void {
  // Refresh-on-reapply matches HSR's named-buff semantics. Dedup key includes target so the
  // per-slot fan-out used for buff-style team effects ('eachAlly' grant) doesn't collide:
  // N ActiveBuffs with the same id+sourceSlot but distinct target slots remain N entries,
  // each ticking on its own ally's turn via 'turnsOnTarget'.
  const existing = state.activeBuffs.findIndex(
    (b) => b.id === buff.id && b.sourceSlot === buff.sourceSlot && sameTarget(b.target, buff.target),
  )
  if (existing >= 0) {
    state.activeBuffs[existing] = buff
  } else {
    state.activeBuffs.push(buff)
  }
}

function sameTarget(a: ActiveBuff['target'], b: ActiveBuff['target']): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'slot' && b.kind === 'slot') return a.slot === b.slot
  return true
}

export function tickAvBuffs(state: BattleState, dt: number): void {
  if (dt <= 0) return
  expireWhere(state, (b) => {
    if (b.mode !== 'av') return false
    b.remaining -= dt
    return b.remaining <= 0
  })
}

export function tickTurnsOnTarget(state: BattleState, actorSlot: SlotIndex): void {
  expireWhere(state, (b) => {
    if (b.mode !== 'turnsOnTarget') return false
    // turnsOnTarget is only meaningful for slot-bound buffs (per-ally fan-out from
    // `target: 'eachAlly'`). Team-kind or enemy-kind targets never tick here.
    if (b.target.kind !== 'slot') return false
    if (b.target.slot !== actorSlot) return false
    b.remaining -= 1
    return b.remaining <= 0
  })
}

export function tickTurnsOnSource(state: BattleState, actorSlot: SlotIndex): void {
  expireWhere(state, (b) => {
    if (b.mode !== 'turnsOnSource') return false
    if (b.sourceSlot !== actorSlot) return false
    b.remaining -= 1
    return b.remaining <= 0
  })
}

export function tickTurnsOnEnemy(state: BattleState): void {
  expireWhere(state, (b) => {
    if (b.mode !== 'turnsOnEnemy') return false
    b.remaining -= 1
    return b.remaining <= 0
  })
}

export function hasActiveBuff(state: BattleState, id: string): boolean {
  for (const b of state.activeBuffs) {
    if (b.id === id) return true
  }
  return false
}

function expireWhere(state: BattleState, predicate: (b: ActiveBuff) => boolean): void {
  const kept: ActiveBuff[] = []
  for (const b of state.activeBuffs) {
    if (predicate(b)) continue
    kept.push(b)
  }
  state.activeBuffs = kept
}
