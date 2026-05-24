import type { ResourceState, SlotIndex, TeamMember } from 'lib/autobattle/types'
import { SLOT_INDEXES } from 'lib/autobattle/types'
import type { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

export const MAX_SKILL_POINTS = 5
export const STARTING_SKILL_POINTS = 5

// Per-action energy defaults (overridable via characterData.energyOnAction).
// ULT here is the *refund* after consuming maxEnergy (most chars get +5 from "ult finished").
const DEFAULT_ENERGY_ON_ACTION: Partial<Record<AbilityKind, number>> = {
  BASIC: 20,
  SKILL: 30,
  FUA: 5,
  ULT: 5,
} as unknown as Partial<Record<AbilityKind, number>>

export function createResourceState(members: Record<SlotIndex, TeamMember>): ResourceState {
  const energy = {} as Record<SlotIndex, number>
  const stacks = {} as Record<SlotIndex, Record<string, number>>
  const fuaTriggerCounters = {} as Record<SlotIndex, Record<string, number>>
  for (const slot of SLOT_INDEXES) {
    if (members[slot] === undefined) continue
    energy[slot] = 0
    stacks[slot] = {}
    fuaTriggerCounters[slot] = {}
  }
  return {
    skillPoints: STARTING_SKILL_POINTS,
    energy,
    stacks,
    fuaTriggerCounters,
  }
}

export function changeSkillPoints(resources: ResourceState, delta: number): void {
  resources.skillPoints = Math.max(0, Math.min(MAX_SKILL_POINTS, resources.skillPoints + delta))
}

export function changeEnergy(resources: ResourceState, member: TeamMember, delta: number): void {
  const slot = member.slot
  const current = resources.energy[slot] ?? 0
  resources.energy[slot] = Math.max(0, Math.min(member.maxEnergy, current + delta))
}

// Returns the energy delta this member receives from performing the given action.
export function energyForAction(member: TeamMember, kind: AbilityKind): number {
  const override = member.characterData.energyOnAction?.[kind]
  if (override !== undefined) return override
  return DEFAULT_ENERGY_ON_ACTION[kind] ?? 0
}

export function consumeUlt(resources: ResourceState, member: TeamMember): void {
  if (member.characterData.ultResource === 'stacks' && member.characterData.stacks) {
    const stacks = resources.stacks[member.slot]!
    const name = member.characterData.stacks.name
    const consume = member.characterData.stacks.consumeOnUlt
    if (consume === 'all') stacks[name] = 0
    else stacks[name] = Math.max(0, (stacks[name] ?? 0) - consume)
  } else {
    resources.energy[member.slot] = 0
    changeEnergy(resources, member, energyForAction(member, 'ULT' as AbilityKind))
  }
}

export function changeStacks(
  resources: ResourceState,
  member: TeamMember,
  name: string,
  delta: number,
  cap?: number,
): void {
  const slotStacks = resources.stacks[member.slot] ??= {}
  const next = (slotStacks[name] ?? 0) + delta
  slotStacks[name] = cap === undefined ? Math.max(0, next) : Math.max(0, Math.min(cap, next))
}

export function isUltReady(resources: ResourceState, member: TeamMember): boolean {
  if (member.characterData.ultResource === 'stacks' && member.characterData.stacks) {
    const stacks = resources.stacks[member.slot]?.[member.characterData.stacks.name] ?? 0
    return stacks >= member.characterData.stacks.threshold
  }
  return (resources.energy[member.slot] ?? 0) >= member.maxEnergy
}
