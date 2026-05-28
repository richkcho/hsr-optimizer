import { addBuff } from 'lib/autobattle/state/buffs'
import {
  type ActiveBuff,
  type BattleState,
  type BuffGrant,
  type GrantTarget,
  type SlotIndex,
  type TeamMember,
} from 'lib/autobattle/types'

// Resolves a per-actor GrantTarget into the list of TeamMembers the grant applies to.
// Returns [] for the buff-only routes ('team', 'enemy') since they don't map to specific
// actor slots — those are handled inside applyBuffGrant via the kind:'team' / kind:'enemy'
// ActiveBuff variants. Used by both the in-battle grants path (applyCharacterDataGrants)
// and the wave-start grants path (createInitialBattleState).
export function resolveTargets(
  state: BattleState,
  self: TeamMember,
  target: GrantTarget | undefined,
): TeamMember[] {
  if (!target) return []
  if (target === 'self') return [self]
  if (target === 'singleAlly') {
    const main = state.members[state.mainDpsSlot]
    if (main && main.slot !== self.slot) return [main]
    // If the main DPS is self, fall through to any other slot — pick lowest slot index.
    for (const slot of (Object.keys(state.members) as unknown as SlotIndex[])) {
      const m = state.members[slot]
      if (m && m.slot !== self.slot) return [m]
    }
    return []
  }
  if (target === 'allAllies') {
    const out: TeamMember[] = []
    for (const slot of (Object.keys(state.members) as unknown as SlotIndex[])) {
      const m = state.members[slot]
      if (m && m.slot !== self.slot) out.push(m)
    }
    return out
  }
  if (target === 'eachAlly') {
    const out: TeamMember[] = []
    for (const slot of (Object.keys(state.members) as unknown as SlotIndex[])) {
      const m = state.members[slot]
      if (m) out.push(m)
    }
    return out
  }
  // 'team' and 'enemy' are buff-only routes — they don't resolve to per-actor targets here.
  // applyBuffGrant special-cases them. Callers using resolveTargets for energy/advance get
  // an empty list, which silently no-ops.
  if (target === 'team' || target === 'enemy') return []
  const m = state.members[target.slot]
  return m ? [m] : []
}

// Apply a BuffGrant by dispatching the right ActiveBuff variant per the grant's target.
// Handles enemy, team, eachAlly, and the per-actor cases ('self', 'singleAlly', 'allAllies',
// { slot }) uniformly so both the in-battle and wave-start paths share the same fan-out.
export function applyBuffGrant(
  state: BattleState,
  sourceMember: TeamMember,
  grant: BuffGrant,
): void {
  if (grant.target === 'enemy') {
    // Enemy-targeted buff: applied once with target.kind='enemy'. Team-wide damage buffs
    // (vulnerability, RES PEN aura) read this and treat the debuff-on-enemy as a team buff
    // multiplier for any ally hitting the affected enemy.
    const buff: ActiveBuff = {
      ...grant.buff,
      sourceSlot: sourceMember.slot,
      target: { kind: 'enemy' },
    }
    addBuff(state, buff)
    return
  }
  if (grant.target === 'team') {
    // Field-style team-wide effect: single kind:'team' buff that propagates the source's
    // conditional flag to every resolver via buffAppliesToActor. Tick basis is usually
    // 'turnsOnSource' (decrements on caster's turn) per HSR field semantics.
    const buff: ActiveBuff = {
      ...grant.buff,
      sourceSlot: sourceMember.slot,
      target: { kind: 'team' },
    }
    addBuff(state, buff)
    return
  }
  if (grant.target === 'eachAlly') {
    // Buff-style fan-out: one ActiveBuff per ally INCLUDING source. Each entry's
    // remaining/mode are independent so 'turnsOnTarget' decrements per-ally. addBuff
    // dedup keys on (id, sourceSlot, target.slot) so the N entries don't collapse.
    for (const slot of (Object.keys(state.members) as unknown as SlotIndex[])) {
      const m = state.members[slot]
      if (!m) continue
      const buff: ActiveBuff = {
        ...grant.buff,
        sourceSlot: sourceMember.slot,
        target: { kind: 'slot', slot: m.slot },
      }
      addBuff(state, buff)
    }
    return
  }
  for (const target of resolveTargets(state, sourceMember, grant.target)) {
    const buff: ActiveBuff = {
      ...grant.buff,
      sourceSlot: sourceMember.slot,
      target: { kind: 'slot', slot: target.slot },
    }
    addBuff(state, buff)
  }
}
