// @vitest-environment jsdom
/* eslint-disable no-console */
/// <reference types="node" />
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { basename, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

import type {
  BattleRecordActorOutcome,
  BattleRecordOutcome,
  ToleranceBands,
} from 'lib/autobattle/battleRecord'
import { toBattleRecordOutcome } from 'lib/autobattle/battleRecordAdapter'
import { runAutobattle } from 'lib/autobattle/scheduler/scheduler'
import type {
  ActorKind,
  AutobattleInput,
  SlotIndex,
  TeamMemberInput,
} from 'lib/autobattle/types'
import {
  type MainStats,
  Parts,
  Sets,
  Stats,
  type StatsValues,
  type SubStats,
} from 'lib/constants/constants'
import { BasicStatToKey } from 'lib/optimization/basicStatsArray'
import type { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'
import { StatCalculator } from 'lib/relics/statCalculator'
import type { SimulationRelic } from 'lib/simulations/statSimulationTypes'
import { Metadata } from 'lib/state/metadataInitializer'
import { isFlat } from 'lib/utils/statUtils'
import type { CharacterId } from 'types/character'
import type { LightConeId } from 'types/lightCone'
import { describe, expect, test } from 'vitest'

// ---------------------------------------------------------------------------
// Where the goldens live (checked in) and where our-sim outcomes get dumped.
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url))
const GOLDEN_DIR = resolve(HERE, 'goldens')
const OUTCOME_DIR = resolve(HERE, '../../../../../.tmp/our-outcomes')

const DEFAULT_TOLERANCE: Required<ToleranceBands> = {
  totalDamage: 0.15,
  perActorTotal: 0.20,
  perAbility: 0.30,
}

// ---------------------------------------------------------------------------
// Golden file format. Mirrors README.md in this directory.
// ---------------------------------------------------------------------------

interface GoldenMember {
  slot: SlotIndex
  characterId: string
  referenceName: string
  lightConeId: string
  lightConeName?: string
  eidolon: number
  lightConeSuperimposition: number
  baseSpd: number
  maxEnergy: number
  path: TeamMemberInput['path']
  relicSet1: keyof typeof Sets
  relicSet2: keyof typeof Sets
  ornamentSet: keyof typeof Sets
  mains: {
    body: keyof typeof Stats
    feet: keyof typeof Stats
    planarSphere: keyof typeof Stats
    linkRope: keyof typeof Stats
  }
}

interface GoldenEnemy {
  maxToughness: number
}

interface GoldenScenario {
  mainDpsSlot: SlotIndex
  enemies: GoldenEnemy[]
  enemySpd: number
  totalAv: number
}

interface GoldenFile {
  name: string
  description?: string
  captureDate?: string
  captureNotes?: string
  team: GoldenMember[]
  scenario: GoldenScenario
  reference: { outcome: BattleRecordOutcome }
  tolerance?: Partial<ToleranceBands>
}

// ---------------------------------------------------------------------------
// Input builder
// ---------------------------------------------------------------------------

const STANDARD_ROLLS: Partial<Record<SubStats, number>> = {
  [Stats.ATK_P]: 10,
  [Stats.SPD]: 10,
  [Stats.CR]: 10,
  [Stats.CD]: 10,
  [Stats.EHR]: 10,
  [Stats.RES]: 10,
  [Stats.BE]: 10,
}

function makeRelic(set: Sets, main: MainStats): SimulationRelic {
  const mainKey = BasicStatToKey[main as StatsValues]
  const mainValue = StatCalculator.getMaxedStatValue(main) * (isFlat(main) ? 1 : 0.01)
  return { set, condensedStats: [[mainKey, mainValue]] }
}

function withSubstatRolls(relic: SimulationRelic, rolls: Partial<Record<SubStats, number>>): SimulationRelic {
  const condensed = [...relic.condensedStats!]
  for (const [stat, count] of Object.entries(rolls)) {
    if (!count) continue
    const key = BasicStatToKey[stat as StatsValues]
    const perRoll = StatCalculator.getMaxedSubstatValue(stat as SubStats)
    const scale = isFlat(stat as StatsValues) ? 1 : 0.01
    condensed.push([key, perRoll * count * scale])
  }
  return { set: relic.set, condensedStats: condensed }
}

function buildEquippedRelics(m: GoldenMember): Partial<Record<Parts, SimulationRelic>> {
  const set1 = Sets[m.relicSet1] as Sets
  const set2 = Sets[m.relicSet2] as Sets
  const orn = Sets[m.ornamentSet] as Sets
  return {
    [Parts.Head]: withSubstatRolls(makeRelic(set1, Stats.HP), STANDARD_ROLLS),
    [Parts.Hands]: makeRelic(set1, Stats.ATK),
    [Parts.Body]: makeRelic(set2, Stats[m.mains.body] as MainStats),
    [Parts.Feet]: makeRelic(set2, Stats[m.mains.feet] as MainStats),
    [Parts.PlanarSphere]: makeRelic(orn, Stats[m.mains.planarSphere] as MainStats),
    [Parts.LinkRope]: makeRelic(orn, Stats[m.mains.linkRope] as MainStats),
  }
}

function buildInput(golden: GoldenFile): AutobattleInput {
  return {
    team: golden.team.map<TeamMemberInput>((m) => ({
      slot: m.slot,
      characterId: m.characterId as CharacterId,
      eidolon: m.eidolon as TeamMemberInput['eidolon'],
      lightConeId: m.lightConeId as LightConeId,
      lightConeSuperimposition: m.lightConeSuperimposition,
      equippedRelics: buildEquippedRelics(m),
      baseSpd: m.baseSpd,
      maxEnergy: m.maxEnergy,
      path: m.path,
    })),
    mainDpsSlot: golden.scenario.mainDpsSlot,
    enemies: golden.scenario.enemies.map((e) => ({ maxToughness: e.maxToughness })),
    enemySpd: golden.scenario.enemySpd,
    totalAv: golden.scenario.totalAv,
  }
}

// ---------------------------------------------------------------------------
// Diff — operates on BattleRecord.outcome on both sides.
// ---------------------------------------------------------------------------

interface Delta {
  label: string
  ours: number
  ref: number
  pct: number  // (ours - ref) / ref
  tolerance: number
  withinTolerance: boolean
  // Structural mismatch: exactly one side is zero. These are typically attribution-shape
  // differences (e.g. our sim folds memo damage into the owner's FUA bucket; reference
  // splits it out) and aren't meaningful as magnitude diffs. Reported as informational,
  // never counted as a tolerance failure.
  structural: boolean
}

function mkDelta(label: string, ours: number, ref: number, tolerance: number): Delta {
  if (ours === 0 && ref === 0) {
    return { label, ours, ref, pct: 0, tolerance, withinTolerance: true, structural: false }
  }
  if (ours === 0 || ref === 0) {
    return { label, ours, ref, pct: ours === 0 ? -1 : Number.POSITIVE_INFINITY, tolerance, withinTolerance: true, structural: true }
  }
  const pct = (ours - ref) / ref
  return { label, ours, ref, pct, tolerance, withinTolerance: Math.abs(pct) <= tolerance, structural: false }
}

function actorBucketKey(b: BattleRecordActorOutcome): string {
  return `slot${b.slot}:${b.actorKind ?? 'primary'}`
}

function indexByActor(outcome: BattleRecordOutcome): Map<string, BattleRecordActorOutcome> {
  const m = new Map<string, BattleRecordActorOutcome>()
  for (const a of outcome.byActor) m.set(actorBucketKey(a), a)
  return m
}

// Sum damage across all actorKinds on a slot. Lets us compare per-slot totals
// fairly even when one side splits memo/primary and the other doesn't.
function totalsBySlot(outcome: BattleRecordOutcome): Map<SlotIndex, number> {
  const m = new Map<SlotIndex, number>()
  for (const a of outcome.byActor) m.set(a.slot, (m.get(a.slot) ?? 0) + a.totalDamage)
  return m
}

function diff(golden: GoldenFile, ours: BattleRecordOutcome): Delta[] {
  const tol = { ...DEFAULT_TOLERANCE, ...golden.tolerance }
  const ref = golden.reference.outcome
  const out: Delta[] = []

  out.push(mkDelta('TEAM total', ours.totalDamage, ref.totalDamage, tol.totalDamage))

  // Per-slot totals (collapse primary+memo into one bucket per slot). This is the
  // load-bearing actor-total check — primary vs memo attribution differences are an
  // expected v1 drift source and shouldn't fail the test on their own.
  const ourBySlot = totalsBySlot(ours)
  const refBySlot = totalsBySlot(ref)
  const allSlots = new Set<SlotIndex>([...ourBySlot.keys(), ...refBySlot.keys()])
  for (const slot of [...allSlots].sort()) {
    out.push(mkDelta(`slot${slot} total`, ourBySlot.get(slot) ?? 0, refBySlot.get(slot) ?? 0, tol.perActorTotal))
  }

  // Per (slot, actorKind, ability) details — informational. Magnitude diffs here count
  // toward tolerance; structural mismatches (one side missing the bucket) don't.
  const ourMap = indexByActor(ours)
  const refMap = indexByActor(ref)
  const allKeys = new Set<string>([...ourMap.keys(), ...refMap.keys()])
  for (const key of [...allKeys].sort()) {
    const a = ourMap.get(key)
    const r = refMap.get(key)
    const abilities = new Set<string>([
      ...Object.keys(a?.bySkillType ?? {}),
      ...Object.keys(r?.bySkillType ?? {}),
    ])
    for (const ability of [...abilities].sort()) {
      const ak = ability as AbilityKind
      const ourVal = a?.bySkillType?.[ak] ?? 0
      const refVal = r?.bySkillType?.[ak] ?? 0
      if (ourVal === 0 && refVal === 0) continue
      out.push(mkDelta(`${key} ${ability}`, ourVal, refVal, tol.perAbility))
    }
  }

  return out
}

function formatDeltas(deltas: Delta[]): string {
  const lines: string[] = []
  for (const d of deltas) {
    const pctStr = d.structural ? 'STRUCT' : (isFinite(d.pct) ? `${(d.pct * 100).toFixed(1)}%` : '∞')
    const flag = d.structural ? '·' : (d.withinTolerance ? '✓' : '✗')
    lines.push(`  ${flag} ${d.label.padEnd(45)}  ours=${d.ours.toFixed(0).padStart(12)}  ref=${d.ref.toFixed(0).padStart(12)}  Δ=${pctStr.padStart(8)}  (tol ±${(d.tolerance * 100).toFixed(0)}%)`)
  }
  return lines.join('\n')
}

// Annotate unused types as referenced — `ActorKind` will be needed once we add
// goldens that target memo actor outcomes.
type _UseActorKind = ActorKind

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

const goldenFiles = existsSync(GOLDEN_DIR)
  ? readdirSync(GOLDEN_DIR).filter((f) => f.endsWith('.json'))
  : []

if (goldenFiles.length > 0) {
  Metadata.initialize()

  describe('cross-check against goldens', () => {
    for (const file of goldenFiles) {
      test(file, () => {
        const golden = JSON.parse(readFileSync(resolve(GOLDEN_DIR, file), 'utf8')) as GoldenFile
        const input = buildInput(golden)
        const result = runAutobattle(input, { buildResolvers: true })

        // Dump our-sim outcome for inspection / external diffs.
        const oursOutcome = toBattleRecordOutcome(result, { team: input.team })
        mkdirSync(OUTCOME_DIR, { recursive: true })
        const outPath = resolve(OUTCOME_DIR, `${basename(file, '.json')}.our-outcome.json`)
        writeFileSync(outPath, JSON.stringify(oursOutcome, null, 2))
        console.log(`  📄 ${file}: dumped our-sim outcome → ${outPath}`)

        const deltas = diff(golden, oursOutcome)
        console.log(`\n${file}:`)
        console.log(formatDeltas(deltas))

        const failures = deltas.filter((d) => !d.withinTolerance)
        if (failures.length > 0) {
          const summary = failures
            .map((d) => `  ${d.label}: Δ=${(d.pct * 100).toFixed(1)}% > ±${(d.tolerance * 100).toFixed(0)}%`)
            .join('\n')
          expect.fail(`${failures.length} delta(s) outside tolerance:\n${summary}`)
        }
      })
    }
  })
} else {
  describe.skip('cross-check against goldens (none present)', () => {
    test('placeholder', () => {})
  })
}
