import type { ActiveDot, EnemyState } from 'lib/autobattle/types'
import { avFromSpd } from 'lib/autobattle/scheduler/avQueue'

export function createEnemyState(count: number, spd: number, maxToughness: number): EnemyState {
  return {
    count,
    spd,
    clockAv: avFromSpd(spd),
    dots: [],
    maxToughness,
    toughness: maxToughness,
  }
}

export function tickEnemyClock(enemy: EnemyState, dt: number): void {
  enemy.clockAv -= dt
}

// Called when enemy clock reaches 0. Resets the clock, decrements each DoT's remainingTurns,
// and steps the broken-state countdown (restoring full toughness when it expires).
// Returns the dots that should fire this tick (i.e. all currently-active dots before expiry).
// Expired dots are removed from the registry after this call.
export function onEnemyTurn(enemy: EnemyState): ActiveDot[] {
  enemy.clockAv = avFromSpd(enemy.spd)
  const firing = enemy.dots.filter((d) => d.remainingTurns > 0)
  for (const d of enemy.dots) d.remainingTurns -= 1
  enemy.dots = enemy.dots.filter((d) => d.remainingTurns > 0)

  if (enemy.brokenForEnemyTurns !== undefined) {
    enemy.brokenForEnemyTurns -= 1
    if (enemy.brokenForEnemyTurns <= 0) {
      enemy.brokenForEnemyTurns = undefined
      enemy.toughness = enemy.maxToughness
    }
  }

  return firing
}

export function addOrRefreshDot(enemy: EnemyState, dot: ActiveDot): void {
  // Same applier + same hit template → refresh duration and add stack (capped at 1 for v1).
  const existing = enemy.dots.find((d) =>
    d.appliedBy === dot.appliedBy
    && d.hitTemplateRef.ownerSlot === dot.hitTemplateRef.ownerSlot
    && d.hitTemplateRef.abilityKind === dot.hitTemplateRef.abilityKind
    && d.hitTemplateRef.hitIndex === dot.hitTemplateRef.hitIndex
  )
  if (existing) {
    existing.remainingTurns = Math.max(existing.remainingTurns, dot.remainingTurns)
    existing.stacks = Math.max(existing.stacks, dot.stacks)
  } else {
    enemy.dots.push(dot)
  }
}
