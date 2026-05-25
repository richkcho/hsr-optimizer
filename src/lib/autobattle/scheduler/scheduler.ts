import type { DamageResolver } from 'lib/autobattle/damage/damageRunner'
import { createRealDamageResolver } from 'lib/autobattle/damage/damageRunner'
import {
  advanceAllClocks,
  advancePercent,
  argminClock,
  avFromSpd,
} from 'lib/autobattle/scheduler/avQueue'
import { createInitialBattleState } from 'lib/autobattle/state/battleState'
import {
  addBuff,
  hasActiveBuff,
  tickAvBuffs,
  tickTurnsOnEnemy,
  tickTurnsOnSource,
  tickTurnsOnTarget,
} from 'lib/autobattle/state/buffs'
import { onEnemyTurn } from 'lib/autobattle/state/enemy'
import { addDamage } from 'lib/autobattle/state/ledger'
import {
  changeEnergy,
  changeSkillPoints,
  changeStacks,
  consumeUlt,
  energyForAction,
  isUltReady,
  MAX_SKILL_POINTS,
} from 'lib/autobattle/state/resources'
import {
  type AbilityTarget,
  type ActiveBuff,
  type ActorId,
  type AutobattleInput,
  type AutobattleResult,
  type BattleState,
  type ChosenAbility,
  type GrantTarget,
  serializeActorId,
  type SlotIndex,
  type TeamMember,
  type TendencyCtx,
  type TurnLogEntry,
} from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

export interface RunOptions {
  // Phase B tests pass a mock resolver here. Phase C+ omits resolver and relies on
  // buildResolvers: true to build the real pipeline-backed resolver from per-slot contexts.
  resolver?: DamageResolver
  // When true, createInitialBattleState builds per-slot OptimizerContext + c/x state for the
  // real damage pipeline. Requires Metadata.initialize() to have been called first.
  buildResolvers?: boolean
}

export function runAutobattle(input: AutobattleInput, options: RunOptions = {}): AutobattleResult {
  const buildResolvers = options.buildResolvers ?? !options.resolver
  const { state, slotResolvers } = createInitialBattleState(input, { buildResolvers })
  const resolver = options.resolver ?? createRealDamageResolver({ slotStates: slotResolvers })

  // Safety guard against infinite loops: cap total iterations at a generous multiple of the
  // worst-case turn count. (10000 AV / 1 AV per turn × 4 actors × 50 = 2,000,000 — far above
  // anything realistic.) Each iteration must make progress (either advance time or fire an
  // action), so hitting this means a bug.
  let safetyIters = 2_000_000

  while (state.elapsedAv < state.totalAv && safetyIters-- > 0) {
    // Pick the next clock (smallest remainingAv among all actor clocks + enemy clock).
    const minClockIdx = argminClock(state.clocks)
    const actorClock = state.clocks[minClockIdx]
    const actorDt = actorClock?.remainingAv ?? Number.POSITIVE_INFINITY
    const enemyDt = state.enemy.clockAv

    const dt = Math.min(actorDt, enemyDt, state.totalAv - state.elapsedAv)
    if (dt < 0) break

    if (dt > 0) advanceTime(state, dt)

    // After advanceTime, at least one clock is at 0 — process it. When multiple clocks tie at
    // 0 we process one per iteration; ties are broken by argminClock's order (actor first if
    // it ties with enemy at the same AV, since enemyDt > actorDt comparison handles strict
    // inequality below).
    if (enemyDt <= actorDt && state.enemy.clockAv <= 0) {
      processEnemyTurn(state, resolver)
    } else if (actorClock !== undefined) {
      processActorTurn(state, actorClock.id, resolver)
    } else {
      // No actors and enemy hasn't fired yet — clip to totalAv and exit.
      break
    }

    // Out-of-turn ult sweep — repeat until no slot wants to ult.
    ultPumpLoop(state, resolver)
  }

  return {
    ledger: state.ledger,
    log: state.log,
    finalElapsedAv: state.elapsedAv,
    finalSp: state.resources.skillPoints,
    finalEnergyBySlot: state.resources.energy,
  }
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

function advanceTime(state: BattleState, dt: number): void {
  state.elapsedAv += dt
  advanceAllClocks(state.clocks, dt)
  state.enemy.clockAv -= dt
  tickAvBuffs(state, dt)
}

// ---------------------------------------------------------------------------
// Actor turn
// ---------------------------------------------------------------------------

function processActorTurn(state: BattleState, actorId: ActorId, resolver: DamageResolver): void {
  const member = state.members[actorId.slot]!
  if (actorId.kind !== 'primary') {
    // Memo turns: Phase B treats memo turns as no-ops (memos act through their entity hits
    // emitted by the primary's actionDefinition). Phase D/G will wire memo decisions.
    resetClockFor(state, actorId, member.baseSpd)
    return
  }

  const ctx = makeTendencyCtx(state, actorId.slot)
  const chosen = member.tendency.decideTurn(ctx)
  executeAbility(state, actorId, chosen, resolver, 0)

  resetClockFor(state, actorId, member.baseSpd)
  tickTurnsOnTarget(state, actorId.slot)
  tickTurnsOnSource(state, actorId.slot)
  fireFuaTriggers(state, actorId, chosen.kind, resolver)
}

function resetClockFor(state: BattleState, actorId: ActorId, spd: number): void {
  const key = serializeActorId(actorId)
  const clock = state.clocks.find((c) => serializeActorId(c.id) === key)
  if (clock) clock.remainingAv = avFromSpd(spd)
}

// ---------------------------------------------------------------------------
// Enemy turn (DoT ticks)
// ---------------------------------------------------------------------------

function processEnemyTurn(state: BattleState, resolver: DamageResolver): void {
  const firing = onEnemyTurn(state.enemy)
  tickTurnsOnEnemy(state)

  for (const dot of firing) {
    const applierMember = state.members[dot.appliedBy]
    if (!applierMember) continue
    const primaryActor: ActorId = { slot: dot.appliedBy, kind: 'primary' }

    // Phase C: run the DoT's actual hit damage function via resolveHit when available,
    // falling back to a full resolve call for the mock resolver case.
    const ref = dot.hitTemplateRef
    const perHit = resolver.resolveHit
      ? resolver.resolveHit(state, ref.ownerSlot, ref.abilityKind, ref.hitIndex)
      : resolver.resolve(state, primaryActor, AbilityKind.DOT).totalDmg
    const dmg = perHit * Math.max(1, dot.stacks)
    addDamage(state.ledger, primaryActor, AbilityKind.DOT, dmg * state.enemy.count)

    appendLog(state, {
      elapsedAv: state.elapsedAv,
      deltaAv: 0,
      actor: primaryActor,
      kind: 'DOT_TICK',
      description: `DoT tick (${applierMember.characterId})`,
      damage: dmg * state.enemy.count,
    })
  }

  appendLog(state, {
    elapsedAv: state.elapsedAv,
    deltaAv: 0,
    actor: { slot: 0, kind: 'primary' },
    kind: 'ENEMY_TURN',
    description: `Enemy turn (count=${state.enemy.count})`,
  })

  // Energy-from-being-hit approximation (Aventurine, Clara, etc.)
  for (const slot of (Object.keys(state.members) as unknown as SlotIndex[])) {
    const member = state.members[slot]
    if (!member) continue
    const approx = member.characterData.v1Approx?.energyFromEnemyAttacks
    if (approx) changeEnergy(state.resources, member, approx.avgPerEnemyTurn)
  }
}

// ---------------------------------------------------------------------------
// Ability execution
// ---------------------------------------------------------------------------

function executeAbility(
  state: BattleState,
  actorId: ActorId,
  chosen: ChosenAbility,
  resolver: DamageResolver,
  deltaAv: number,
): void {
  const member = state.members[actorId.slot]!
  const spBefore = state.resources.skillPoints

  // SP economy
  payAbilitySp(state, member, chosen.kind)

  // Damage resolution (mock in Phase B; real pipeline in Phase C)
  const resolved = resolver.resolve(state, actorId, chosen.kind)
  const totalDmg = resolved.totalDmg * (chosen.kind === AbilityKind.BASIC || chosen.kind === AbilityKind.SKILL
    ? 1 // single-target abilities — damage is already correct in resolver
    : (chosen.kind === AbilityKind.ULT || chosen.kind === AbilityKind.FUA ? 1 : 1)
  )
  addDamage(state.ledger, actorId, chosen.kind, totalDmg)

  // Energy from own action
  if (chosen.kind === AbilityKind.ULT) {
    consumeUlt(state.resources, member)
  } else {
    changeEnergy(state.resources, member, energyForAction(member, chosen.kind))
  }

  // Stack gain from own action (Acheron-shaped)
  if (member.characterData.stacks) {
    const gain = member.characterData.stacks.onAction[chosen.kind] ?? 0
    if (gain) changeStacks(state.resources, member, member.characterData.stacks.name, gain)
  }

  // Apply grants from characterData (energy/advance/buffs to teammates)
  applyCharacterDataGrants(state, member, chosen.kind)

  // Apply explicit tendency-driven extras
  for (const adv of chosen.advancesTeammates ?? []) {
    const target = state.members[adv.slot]
    if (target) advancePercent(state, adv.slot, target.baseSpd, adv.avPercent)
  }
  for (const grant of chosen.grantsEnergy ?? []) {
    const target = state.members[grant.slot]
    if (target) changeEnergy(state.resources, target, grant.amount)
  }
  for (const buffTemplate of chosen.buffsApplied ?? []) {
    addBuff(state, { ...buffTemplate, sourceSlot: actorId.slot })
  }

  // Teammate stack contributions (e.g. Nihility teammates feed Acheron stacks)
  for (const otherSlot of (Object.keys(state.members) as unknown as SlotIndex[])) {
    if (otherSlot === actorId.slot) continue
    const other = state.members[otherSlot]
    const onTeammate = other?.characterData.stacks?.onTeammateAction?.[chosen.kind] ?? 0
    if (onTeammate && other) {
      changeStacks(state.resources, other, other.characterData.stacks!.name, onTeammate)
    }
  }

  appendLog(state, {
    elapsedAv: state.elapsedAv,
    deltaAv,
    actor: actorId,
    kind: chosen.kind,
    description: `${member.characterId} ${chosen.kind}`,
    damage: totalDmg,
    spBefore,
    spAfter: state.resources.skillPoints,
    energyAfter: state.resources.energy[actorId.slot],
    notes: chosen.reason ? [chosen.reason] : undefined,
    target: resolveAbilityTarget(member, chosen),
  })

  // Break detection. Aggregate single-toughness-gauge model: this attack's total toughness
  // damage drives a shared gauge across all enemies; when it crosses zero, treat all enemies
  // as broken together (multiplied break damage by enemy.count). Only attacks that find the
  // enemy in an unbroken state contribute — broken-state attacks waste their toughness.
  if (resolved.toughnessDmg > 0 && state.enemy.brokenForEnemyTurns === undefined) {
    state.enemy.toughness -= resolved.toughnessDmg
    if (state.enemy.toughness <= 0) {
      state.enemy.toughness = 0
      state.enemy.brokenForEnemyTurns = 1
      if (resolver.resolveBreak) {
        const perEnemyBreak = resolver.resolveBreak(state, actorId.slot)
        const breakDmg = perEnemyBreak * state.enemy.count
        if (breakDmg > 0) {
          addDamage(state.ledger, actorId, AbilityKind.BREAK, breakDmg)
          appendLog(state, {
            elapsedAv: state.elapsedAv,
            deltaAv: 0,
            actor: actorId,
            kind: AbilityKind.BREAK,
            description: `${member.characterId} BREAK (triggered by ${chosen.kind})`,
            damage: breakDmg,
          })
        }
      }
    }
  }
}

// Precedence: explicit tendency choice > characterData hint > kind-based default.
export function resolveAbilityTarget(member: TeamMember, chosen: ChosenAbility): AbilityTarget {
  if (chosen.target) return chosen.target
  const hint = member.characterData.abilityTargetHint?.[chosen.kind]
  if (hint) return hint
  return defaultTargetForKind(chosen.kind)
}

// Conservative default: assume single-target enemy. AoE abilities (most ults, AoE skills)
// must declare an explicit hint in CharacterData.abilityTargetHint — that way a missing hint
// becomes a visible mislabel in the log rather than silently misclassifying support ults
// (e.g. Robin/Sunday/Sparkle ult) as allEnemies.
export function defaultTargetForKind(_kind: AbilityKind): AbilityTarget {
  return 'mainEnemy'
}

function payAbilitySp(state: BattleState, member: TeamMember, kind: AbilityKind): void {
  if (kind === AbilityKind.BASIC) {
    changeSkillPoints(state.resources, +1)
    return
  }
  if (kind === AbilityKind.SKILL) {
    // Phase B: cost defaults to 1. Phase C will read sum(hit.skillPointsUsed) from preBuiltActions.
    const cost = skillCostFor(state, member, kind)
    changeSkillPoints(state.resources, -cost)
    return
  }
  // ULT / FUA / others do not affect SP pool.
}

function skillCostFor(state: BattleState, member: TeamMember, kind: AbilityKind): number {
  const action = state.preBuiltActions[serializeActorId({ slot: member.slot, kind: 'primary' })]?.[kind]
  if (!action?.hits) return kind === AbilityKind.SKILL ? 1 : 0
  let cost = 0
  for (const hit of action.hits) {
    if ('skillPointsUsed' in hit && typeof hit.skillPointsUsed === 'number') {
      cost += hit.skillPointsUsed
    }
  }
  return cost
}

// ---------------------------------------------------------------------------
// CharacterData grants
// ---------------------------------------------------------------------------

function applyCharacterDataGrants(state: BattleState, member: TeamMember, kind: AbilityKind): void {
  const data = member.characterData

  for (const target of resolveTargets(state, member, data.grantsEnergyOnAction?.[kind]?.target)) {
    const amount = data.grantsEnergyOnAction![kind]!.amount
    changeEnergy(state.resources, target, amount)
  }
  for (const target of resolveTargets(state, member, data.grantsAdvanceOnAction?.[kind]?.target)) {
    const avPercent = data.grantsAdvanceOnAction![kind]!.avPercent
    advancePercent(state, target.slot, target.baseSpd, avPercent)
  }
  for (const grant of data.grantsBuffsOnAction?.[kind] ?? []) {
    for (const target of resolveTargets(state, member, grant.target)) {
      const buff: ActiveBuff = {
        ...grant.buff,
        sourceSlot: member.slot,
        target: { kind: 'slot', slot: target.slot },
      }
      addBuff(state, buff)
    }
  }
}

function resolveTargets(state: BattleState, self: TeamMember, target: GrantTarget | undefined): TeamMember[] {
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
  const m = state.members[target.slot]
  return m ? [m] : []
}

// ---------------------------------------------------------------------------
// FUA triggers
// ---------------------------------------------------------------------------

function fireFuaTriggers(state: BattleState, source: ActorId, kind: AbilityKind, resolver: DamageResolver): void {
  for (const slot of (Object.keys(state.members) as unknown as SlotIndex[])) {
    if (slot === source.slot) continue
    const member = state.members[slot]
    if (!member?.characterData.fuaTriggers) continue

    for (const trigger of member.characterData.fuaTriggers) {
      if (!triggerMatches(trigger, source, kind)) continue

      // Increment counter; fire when reaching everyN.
      const counters = state.resources.fuaTriggerCounters[slot] ??= {}
      const counterId = trigger.id
      counters[counterId] = (counters[counterId] ?? 0) + 1

      const everyN = trigger.everyN ?? 1
      if (counters[counterId] < everyN) continue
      counters[counterId] = 0

      // Tendency may veto the FUA (rare).
      const ctx = makeTendencyCtx(state, slot)
      if (member.tendency.shouldFireFua && !member.tendency.shouldFireFua(source, ctx)) continue

      const fuaKind = trigger.selector?.abilityKind ?? AbilityKind.FUA
      const fuaActor: ActorId = { slot, kind: 'primary' }
      executeAbility(state, fuaActor, { kind: fuaKind, reason: `fua trigger ${trigger.id}` }, resolver, 0)
    }
  }
}

function triggerMatches(
  trigger: { on: string; conditionMark?: string },
  source: ActorId,
  kind: AbilityKind,
): boolean {
  if (kind === AbilityKind.DOT || kind === AbilityKind.BREAK) return false
  switch (trigger.on) {
    case 'teammateAttack':
      return source.slot !== undefined
    case 'teammateAttackVsTarget':
      // v1: assume the mark condition is always met; Phase D-G can refine per-character.
      return true
    case 'ownAttack':
    case 'ownSkill':
    case 'beingAttacked':
      // 'own*' triggers don't fire from another actor's actions. 'beingAttacked' never fires in v1.
      return false
    default:
      return false
  }
}

// ---------------------------------------------------------------------------
// Ult pump
// ---------------------------------------------------------------------------

function ultPumpLoop(state: BattleState, resolver: DamageResolver): void {
  // Sweep all slots for ult-ready; fire; repeat until a full pass yields nothing.
  let progressed = true
  let safety = 50  // guard against accidental infinite loops
  while (progressed && safety-- > 0) {
    progressed = false
    for (const slot of (Object.keys(state.members) as unknown as SlotIndex[])) {
      const member = state.members[slot]
      if (!member) continue
      if (!isUltReady(state.resources, member)) continue

      const ctx = makeTendencyCtx(state, slot)
      const chosen = member.tendency.decideUlt(ctx)
      if (!chosen) continue

      const actor: ActorId = { slot, kind: 'primary' }
      executeAbility(state, actor, chosen, resolver, 0)
      progressed = true
    }
  }
}

// ---------------------------------------------------------------------------
// Tendency context
// ---------------------------------------------------------------------------

function makeTendencyCtx(state: BattleState, self: SlotIndex): TendencyCtx {
  const member = state.members[self]!
  return {
    state,
    self,
    sp: () => state.resources.skillPoints,
    energy: () => state.resources.energy[self] ?? 0,
    stacks: (name: string) => state.resources.stacks[self]?.[name] ?? 0,
    hasActiveBuff: (id: string) => hasActiveBuff(state, id),
    spCost: (kind: AbilityKind) => skillCostFor(state, member, kind),
    data: () => member.characterData,
  }
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function appendLog(state: BattleState, entry: TurnLogEntry): void {
  state.log.push(entry)
}

// Re-exports for tests
export { MAX_SKILL_POINTS }
