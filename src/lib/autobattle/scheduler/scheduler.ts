import type { DamageResolver } from 'lib/autobattle/damage/damageRunner'
import { createRealDamageResolver } from 'lib/autobattle/damage/damageRunner'
import {
  advanceActorPercent,
  advanceAllClocks,
  advancePercent,
  argminClock,
  avFromSpd,
  findClock,
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
  type EnemyState,
  type FuaStackPool,
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
    // Sync pause states from buff presence first — a buff that expired in the previous
    // iteration's advanceTime needs to unpause its target now (and may trigger actOnResume).
    syncClockPauseStates(state)

    // Pick the next clock (smallest remainingAv among unpaused actor clocks + enemy clock
    // + earliest av-mode buff expiration). Including buff expiration in dt ensures we don't
    // over-advance past a buff that should have expired mid-window — important for paused
    // actors whose unpause is the next meaningful event.
    const minClockIdx = argminClock(state.clocks)
    const actorClock = state.clocks[minClockIdx]
    const actorDt = actorClock?.remainingAv ?? Number.POSITIVE_INFINITY
    const enemyDt = state.enemy.clockAv
    const buffDt = nextAvBuffExpiration(state)

    const dt = Math.min(actorDt, enemyDt, buffDt, state.totalAv - state.elapsedAv)
    if (dt < 0) break

    if (dt > 0) advanceTime(state, dt)

    // After advanceTime, fire whichever event is at zero. Priority: enemy > actor; if neither
    // fires (because dt was bounded by buffDt or totalAv), the next iteration's sync pass picks
    // up the buff expiration and we loop without processing a turn.
    if (enemyDt <= actorDt && state.enemy.clockAv <= 0) {
      processEnemyTurn(state, resolver)
    } else if (actorClock !== undefined && actorClock.remainingAv <= 0 && !actorClock.paused) {
      processActorTurn(state, actorClock.id, resolver)
    }
    // else: only a buff expired (or we hit the totalAv cap) — loop again to re-evaluate.

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
    processMemoTurn(state, actorId, member, resolver)
    return
  }

  // Reset per-owner-turn counters before the turn runs (Aventurine's Bingo! cap, etc.).
  // Reference: suffering2Char.js:34685-34699 — StartTurn listener gated by source===owner
  // zeros `allyFUABetCounter`. In our sim, the equivalent is the start of the owner's primary
  // turn — memo turns don't reset (Bingo's counter belongs to Aventurine's clock).
  resetFuaStackPoolPerTurnCounter(state, member)

  const ctx = makeTendencyCtx(state, actorId.slot)
  const chosen = member.tendency.decideTurn(ctx)
  executeAbility(state, actorId, chosen, resolver, 0)

  resetClockFor(state, actorId, member.baseSpd)
  tickTurnsOnTarget(state, actorId.slot)
  tickTurnsOnSource(state, actorId.slot)
  fireFuaTriggers(state, actorId, chosen.kind, resolver)
}

// Memo/summon own-turn fire. v1 always fires characterData.memo.onTurn — no tendency-style
// branching (memosprites' multi-action repertoire is out of scope). The action's hits live
// in the owner's preBuiltActions keyed by primary slot; executeAbility looks them up there
// and the resolver runs them under the memo's ActorId — so damage attributes to slotN:memo:
// <entityName> rather than the owner's primary bucket.
//
// Side-effect policy: memo turns DO flow through executeAbility's owner-side hooks (energy,
// stacks, characterData grants, Robin's energyPassiveOnAnyAttack) — Numby's FUA giving Topaz
// +5 energy matches HSR. We skip tickTurnsOnSource/Target and fireFuaTriggers though: turn-
// counter ticks and FUA chains are primary-turn semantics in HSR (a memo's attack doesn't
// advance Robin's Concerto window, nor does it chain into other FUA triggers in v1).
function processMemoTurn(
  state: BattleState,
  actorId: ActorId,
  member: TeamMember,
  resolver: DamageResolver,
): void {
  const onTurn = member.characterData.memo?.onTurn
  const memoSpd = member.memoSpd ?? member.baseSpd
  if (!onTurn) {
    // No declared action — preserve the pre-Phase-D no-op behavior so memo-using characters
    // without an onTurn entry still tick their clock harmlessly.
    resetClockFor(state, actorId, memoSpd)
    return
  }

  executeAbility(
    state,
    actorId,
    { kind: onTurn.abilityKind, reason: onTurn.reason ?? 'memo turn' },
    resolver,
    0,
  )
  resetClockFor(state, actorId, memoSpd)
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

  // FuaStackPool gain on enemy turn (v1 approximation of "ally with Fortified Wager hit by
  // enemy → Aventurine gains stacks"). Reference: suffering2Char.js:34638-34653 ShieldWasHit
  // listener. Real mechanic depends on shield uptime + per-ally attack routing; v1 collapses
  // to a flat per-enemy-turn drip on the pool owner. Threshold-firing happens synchronously.
  for (const member of Object.values(state.members)) {
    if (!member) continue
    const pool = member.characterData.fuaStackPool
    const enemyTurnGain = pool?.gain.onEnemyTurnApprox
    if (!pool || !enemyTurnGain) continue
    changeStacks(state.resources, member, pool.name, enemyTurnGain, pool.cap)
    maybeFirePool(state, member, resolver)
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

  // FuaStackPool gain on own ULT (Aventurine's Roulette Shark — random 1-7 stacks, modelled
  // as the averaged value; reference: suffering2Char.js:34402 pokes `aventurineBetGained`
  // with pointsGained: 4 on ult cast).
  if (chosen.kind === AbilityKind.ULT) {
    const ownPool = member.characterData.fuaStackPool
    const ownUltGain = ownPool?.gain.onOwnUlt
    if (ownPool && ownUltGain) {
      changeStacks(state.resources, member, ownPool.name, ownUltGain, ownPool.cap)
      maybeFirePool(state, member, resolver)
    }
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

  // Passive energy on any non-enemy attack (Robin's Talent: +2 energy per ally attack,
  // including her own). Loops over every slot — both source and others — because the
  // mechanic fires regardless of who attacked. ERR scaling is applied by changeEnergy.
  for (const slot of (Object.keys(state.members) as unknown as SlotIndex[])) {
    const m = state.members[slot]
    const passive = m?.characterData.energyPassiveOnAnyAttack?.[chosen.kind]
    if (passive && m) {
      changeEnergy(state.resources, m, passive)
    }
  }

  // Memo action-advance on teammate attack (Topaz Talent: ally BASIC/SKILL/ULT on a marked
  // enemy advances Numby's gauge by 50%). Self attacks don't count — "ally other than the
  // memo's owner" semantics. The conditionMark gate is approximated as always-satisfied in
  // v1 (same simplification as `teammateAttackVsTarget` triggers).
  for (const otherMember of Object.values(state.members)) {
    if (!otherMember || otherMember.slot === actorId.slot) continue
    const advance = otherMember.characterData.memo?.advanceOnTeammateAttack
    if (!advance) continue
    if (advance.abilityKindFilter && !advance.abilityKindFilter.includes(chosen.kind)) continue
    const memoActor = otherMember.actors.find((a) => a.kind !== 'primary')
    const memoSpd = otherMember.memoSpd
    if (!memoActor || memoSpd === undefined) continue
    advanceActorPercent(state, memoActor, memoSpd, advance.avPercent)
  }

  // FuaStackPool gain on teammate attack (Aventurine's Bingo!: +1 stack when an ally fires
  // a FUA, capped at 3 per Aventurine turn). Source filter + per-owner-turn cap are both
  // configurable. The hook lives in executeAbility (rather than fireFuaTriggers) so memo
  // attacks count — processMemoTurn skips fireFuaTriggers but flows through executeAbility.
  //
  // Reference: suffering2Char.js:34655-34684 (FUAEnd listener gated by sourceTurn !== owner
  // and allyFUABetCounter < 3). When threshold reached, fire synchronously via maybeFirePool.
  for (const otherMember of Object.values(state.members)) {
    if (!otherMember || otherMember.slot === actorId.slot) continue
    const pool = otherMember.characterData.fuaStackPool
    const allyGain = pool?.gain.onAllyAttack
    if (!pool || !allyGain) continue
    if (allyGain.sourceKindFilter && !allyGain.sourceKindFilter.includes(chosen.kind)) continue
    if (!tryConsumeAllyGainBudget(state, otherMember, pool, allyGain.maxPerOwnerTurn)) continue
    changeStacks(state.resources, otherMember, pool.name, allyGain.amount, pool.cap)
    maybeFirePool(state, otherMember, resolver)
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

  // Break detection. Per-enemy gauges: this attack's toughnessDmg is applied to each target
  // enemy (single-target abilities → only enemy[0]; AoE → every enemy). Each broken enemy
  // credits the breaking attacker once, using that enemy's own maxToughness in the
  // break-damage formula. Broken enemies absorb no further toughness damage until recovery.
  if (resolved.toughnessDmg > 0) {
    const target = resolveAbilityTarget(member, chosen)
    const targetIndices = resolveTargetEnemyIndices(target, state.enemy)
    for (const i of targetIndices) {
      if (state.enemy.brokenForEnemyTurns[i] !== undefined) continue
      state.enemy.toughness[i] -= resolved.toughnessDmg
      if (state.enemy.toughness[i] > 0) continue

      state.enemy.toughness[i] = 0
      state.enemy.brokenForEnemyTurns[i] = 1
      if (!resolver.resolveBreak) continue

      const breakDmg = resolver.resolveBreak(state, actorId.slot, state.enemy.maxToughness[i])
      if (breakDmg <= 0) continue

      addDamage(state.ledger, actorId, AbilityKind.BREAK, breakDmg)
      appendLog(state, {
        elapsedAv: state.elapsedAv,
        deltaAv: 0,
        actor: actorId,
        kind: AbilityKind.BREAK,
        description: `${member.characterId} BREAK on enemy ${i} (triggered by ${chosen.kind})`,
        damage: breakDmg,
      })
    }
  }
}

// Map an AbilityTarget onto concrete enemy indices that take toughness damage.
// Ally-targeted variants (self/singleAlly/allAllies/{kind:'slot'}) hit zero enemies — they
// can still carry toughness damage on hits (rare for support kits), but it goes nowhere.
function resolveTargetEnemyIndices(target: AbilityTarget, enemy: EnemyState): number[] {
  if (target === 'mainEnemy') return [0]
  if (target === 'allEnemies') {
    const all: number[] = []
    for (let i = 0; i < enemy.count; i++) all.push(i)
    return all
  }
  if (typeof target === 'object' && target.kind === 'enemy') {
    return target.enemyIndex >= 0 && target.enemyIndex < enemy.count ? [target.enemyIndex] : []
  }
  return []
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
      if (trigger.requiresSourceBuff && !hasActiveBuff(state, trigger.requiresSourceBuff)) continue

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
      // When the firing character's memo "owns" the triggered ability (e.g. Topaz/Numby,
      // Lingsha/Fuyuan — the FUA hits in actionDefinition are tagged sourceEntity(MemoName)
      // and the in-game agent of the attack is the memo, not the character), route the
      // damage to the memo's ActorId. The reference outcome treats these hits as memo-bucket;
      // attributing to primary would split a single conceptual source across two buckets.
      // Use member.slot (numeric) rather than the outer `slot` loop variable — Object.keys
      // returns strings, and a string slot in ActorId leaks into downstream key-by-slot
      // aggregations as a separate bucket from numeric-slot entries.
      const memo = member.characterData.memo
      const fuaActor: ActorId = memo && memo.onTurn?.abilityKind === fuaKind
        ? { slot: member.slot, kind: 'memo', entityName: memo.entityName }
        : { slot: member.slot, kind: 'primary' }
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
// FuaStackPool helpers
// ---------------------------------------------------------------------------

// Per-owner-turn counter key for the ally-attack gain cap. Stored in the same stacks bag as
// the main pool count — keeps related state colocated. The bag is opaque per-character, so
// the suffixed key doesn't collide with the pool's primary entry.
function allyTurnCounterKey(pool: FuaStackPool): string {
  return `${pool.name}.allyTurnCounter`
}

// Reset Bingo's per-owner-turn counter at the start of the pool owner's primary turn. Called
// from processActorTurn before tendency.decideTurn runs.
function resetFuaStackPoolPerTurnCounter(state: BattleState, member: TeamMember): void {
  const pool = member.characterData.fuaStackPool
  if (!pool?.gain.onAllyAttack?.maxPerOwnerTurn) return
  const slotStacks = state.resources.stacks[member.slot] ??= {}
  slotStacks[allyTurnCounterKey(pool)] = 0
}

// Increments the per-owner-turn counter if a max is configured; returns whether the gain is
// allowed under the cap. With no cap, always allows. With a cap, increments and returns true
// if the new value is within the cap; otherwise leaves state unchanged and returns false.
function tryConsumeAllyGainBudget(
  state: BattleState,
  member: TeamMember,
  pool: FuaStackPool,
  maxPerOwnerTurn: number | undefined,
): boolean {
  if (maxPerOwnerTurn === undefined) return true
  const slotStacks = state.resources.stacks[member.slot] ??= {}
  const key = allyTurnCounterKey(pool)
  const current = slotStacks[key] ?? 0
  if (current >= maxPerOwnerTurn) return false
  slotStacks[key] = current + 1
  return true
}

// Fires the pool's configured ability synchronously if stacks have reached the threshold.
// Consumes `consumeOnFire` stacks then re-runs executeAbility under the pool owner's primary
// ActorId. Single-fire per call (matches reference: each `aventurineBetGained` poke triggers
// at most one queued FUA). The fired ability does not recursively trigger fireFuaTriggers —
// matches the existing behaviour where trigger-fired FUAs don't chain further.
//
// Decision: threshold check uses `>=` to match the in-game text quoted in dCharacters.js at
// byte-offset 218662 ("Upon reaching 7 points of 'Blind Bet,' Aventurine consumes the 7
// points to launch a Follow-Up ATK"). The reference's listener at suffering2Char.js:34565
// uses strict-greater `> 7` (firing at ≥ 8), which contradicts its own desc text. See
// `.tmp/notes/cross-check-gap-investigation.md` Open Q 1 for the resolution.
function maybeFirePool(state: BattleState, member: TeamMember, resolver: DamageResolver): void {
  const pool = member.characterData.fuaStackPool
  if (!pool) return
  const stacks = state.resources.stacks[member.slot]?.[pool.name] ?? 0
  if (stacks < pool.threshold) return
  changeStacks(state.resources, member, pool.name, -pool.consumeOnFire)
  const fuaActor: ActorId = { slot: member.slot, kind: 'primary' }
  executeAbility(
    state,
    fuaActor,
    { kind: pool.firesAbility, reason: `${pool.name} pool fire` },
    resolver,
    0,
  )
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
      // Paused units (e.g. Robin during Concerto) cannot take actions of any kind, including
      // out-of-turn ults. Skip them — their ult, if ready, fires after the pause ends.
      const clock = findClock(state, { slot, kind: 'primary' })
      if (clock?.paused) continue

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
// Pause sync + buff-expiration scheduling
// ---------------------------------------------------------------------------

// For each character that declares clockPausedByBuff, reconcile their primary clock's
// paused flag with the current presence of the buff. When a clock transitions from
// paused → unpaused and the declaration sets actOnResume, also zero out remainingAv so
// the unit acts on the next loop iteration (HSR Concerto "immediately takes action" rule).
function syncClockPauseStates(state: BattleState): void {
  for (const slot of (Object.keys(state.members) as unknown as SlotIndex[])) {
    const member = state.members[slot]
    const spec = member?.characterData.clockPausedByBuff
    if (!spec) continue
    const clock = findClock(state, { slot, kind: 'primary' })
    if (!clock) continue
    const shouldPause = hasActiveBuff(state, spec.buffId)
    if (clock.paused && !shouldPause && spec.actOnResume) {
      clock.remainingAv = 0
    }
    clock.paused = shouldPause
  }
}

// Smallest remaining duration across all av-mode buffs, or +Infinity if none. Caller uses
// this to cap dt so we never tick a buff past zero in a single advanceTime — important when
// a buff expiry is the next meaningful event (e.g. unpausing Robin).
function nextAvBuffExpiration(state: BattleState): number {
  let min = Number.POSITIVE_INFINITY
  for (const buff of state.activeBuffs) {
    if (buff.mode !== 'av') continue
    if (buff.remaining < min) min = buff.remaining
  }
  return min
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
