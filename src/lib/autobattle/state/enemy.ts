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

// Called when an enemy's clock reaches 0. Resets that enemy's clock, ticks its broken-state
// countdown (restoring full toughness on expiry), and advances DoT durations.
//
// DoT tick semantics:
//   - Shared DoTs (no breakDotKind) tick on every per-enemy turn. v1 "applied-to-all"
//     simplification — issue #10's "v1 ticks shared DoTs on every enemy turn."
//   - Break-effect DoTs (breakDotKind set) tick only when their target enemy turns; a
//     2-turn break DoT covers 2 of that specific enemy's turns regardless of N.
//
// Returns dots that should fire this tick — the scheduler filters per-target attribution
// for break DoTs at the credit site.
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
  for (const d of enemy.dots) {
    if (d.breakDotKind !== undefined && d.targetEnemyIndex !== enemyIndex) continue
    d.remainingTurns -= 1
  }
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
  // Same source → refresh duration and stack. Source identity differs by DoT type:
  // standard DoTs key on the hit template (applier + ownerSlot + abilityKind + hitIndex),
  // break-effect DoTs key on the breaker + targetEnemyIndex (one per breaker per enemy).
  const existing = enemy.dots.find((d) => isSameDotSource(d, dot))
  if (existing) {
    existing.remainingTurns = Math.max(existing.remainingTurns, dot.remainingTurns)
    existing.stacks = Math.max(existing.stacks, dot.stacks)
  } else {
    enemy.dots.push(dot)
  }
}

function isSameDotSource(a: ActiveDot, b: ActiveDot): boolean {
  if (a.appliedBy !== b.appliedBy) return false
  if (a.breakDotKind !== undefined || b.breakDotKind !== undefined) {
    return a.breakDotKind === b.breakDotKind && a.targetEnemyIndex === b.targetEnemyIndex
  }
  return a.hitTemplateRef.ownerSlot === b.hitTemplateRef.ownerSlot
    && a.hitTemplateRef.abilityKind === b.hitTemplateRef.abilityKind
    && a.hitTemplateRef.hitIndex === b.hitTemplateRef.hitIndex
}
