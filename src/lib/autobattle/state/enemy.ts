import type { ActiveDot, AutobattleInputEnemy, EnemyState } from 'lib/autobattle/types'
import { avFromSpd } from 'lib/autobattle/scheduler/avQueue'

export function createEnemyState(enemies: AutobattleInputEnemy[], spd: number): EnemyState {
  const maxToughness = enemies.map((e) => e.maxToughness)
  const spdArr = enemies.map(() => spd)
  return {
    count: enemies.length,
    spd: spdArr,
    clockAv: spdArr.map((s) => avFromSpd(s)),
    dots: [],
    maxToughness,
    toughness: [...maxToughness],
    weaknesses: enemies.map((e) => e.weaknesses),
    brokenForEnemyTurns: enemies.map(() => undefined),
  }
}

// Tick every enemy clock down by dt. Per-enemy SPDs may differ in future; this advances
// each clock independently (no shared cadence assumption).
export function tickEnemyClock(enemy: EnemyState, dt: number): void {
  for (let i = 0; i < enemy.clockAv.length; i++) enemy.clockAv[i] -= dt
}

// Called when an enemy's clock reaches 0. Resets that enemy's clock and decrements its
// broken-state countdown (restoring full toughness on expiry). Shared DoTs tick on every
// per-enemy turn (issue #10: "v1 ticks shared DoTs on every enemy turn") — per-enemy DoT
// routing is v2 scope. Returns the dots that should fire this tick.
export function onEnemyTurn(enemy: EnemyState, enemyIndex: number): ActiveDot[] {
  enemy.clockAv[enemyIndex] = avFromSpd(enemy.spd[enemyIndex])

  // Per-enemy break-state countdown for the firing enemy. HSR recovery semantics:
  // a broken enemy recovers after taking its own next turn.
  const remaining = enemy.brokenForEnemyTurns[enemyIndex]
  if (remaining !== undefined) {
    const next = remaining - 1
    if (next <= 0) {
      enemy.brokenForEnemyTurns[enemyIndex] = undefined
      enemy.toughness[enemyIndex] = enemy.maxToughness[enemyIndex]
    } else {
      enemy.brokenForEnemyTurns[enemyIndex] = next
    }
  }

  const firing = enemy.dots.filter((d) => d.remainingTurns > 0)
  for (const d of enemy.dots) d.remainingTurns -= 1
  enemy.dots = enemy.dots.filter((d) => d.remainingTurns > 0)
  return firing
}

// Action-gauge delay applied to a broken enemy's next turn. Grounded in capture data:
// .tmp/raw-battle-log-topaz.json line 1 (oldAV: 50.824… → newAV: 66.647… against a
// SPD-158 boss, Δ ≈ 15.823) matches exactly 0.25 × (10000 / 158). Imaginary-element
// stagger historically deals more (~33%) but is out of scope for v1.
export function breakActionDelayAv(enemy: EnemyState, enemyIndex: number): number {
  return 0.25 * avFromSpd(enemy.spd[enemyIndex])
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
