import type { ActiveBuff, BattleState, SlotIndex } from 'lib/autobattle/types'

export function addBuff(state: BattleState, buff: ActiveBuff): void {
  // If a buff with the same id already exists from the same source, refresh duration instead
  // of stacking. This matches HSR's "refresh on reapply" behavior for most named buffs.
  const existing = state.activeBuffs.findIndex(
    (b) => b.id === buff.id && b.sourceSlot === buff.sourceSlot,
  )
  if (existing >= 0) {
    state.activeBuffs[existing] = buff
  } else {
    state.activeBuffs.push(buff)
  }
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
    if (b.target.kind === 'slot' && b.target.slot !== actorSlot) return false
    if (b.target.kind === 'enemy') return false
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
