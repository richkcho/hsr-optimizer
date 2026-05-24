// @vitest-environment jsdom
/* eslint-disable no-console */
/// <reference types="node" />
import { existsSync, readFileSync, readdirSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

import { runAutobattle } from 'lib/autobattle/scheduler/scheduler'
import type {
  AutobattleInput,
  AutobattleResult,
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
import { StatCalculator } from 'lib/relics/statCalculator'
import type { SimulationRelic } from 'lib/simulations/statSimulationTypes'
import { Metadata } from 'lib/state/metadataInitializer'
import { isFlat } from 'lib/utils/statUtils'
import type { CharacterId } from 'types/character'
import type { LightConeId } from 'types/lightCone'
import { describe, expect, test } from 'vitest'

// ---------------------------------------------------------------------------
// Where the goldens live. Gitignored — only present on machines that ran the
// capture workflow in .tmp/ext/goldens/CAPTURE_GUIDE.md. When the directory is
// absent the whole describe block skips, so the test is a no-op for fresh clones.
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url))
const GOLDEN_DIR = resolve(HERE, '../../../../../.tmp/ext/goldens')

// Tolerance bands (relative deltas). Override per-golden via `tolerance` in the JSON.
const DEFAULT_TOLERANCE = {
  totalDamage: 0.15,     // ±15% on team total
  perActorTotal: 0.20,   // ±20% per actor total
  perAbility: 0.30,      // ±30% per ability bucket
}

// ---------------------------------------------------------------------------
// JSON golden shape
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
  mains: { body: keyof typeof Stats; feet: keyof typeof Stats; planarSphere: keyof typeof Stats; linkRope: keyof typeof Stats }
}

interface GoldenScenario {
  mainDpsSlot: SlotIndex
  enemyCount: number
  enemySpd: number
  totalAv: number
}

interface GoldenReference {
  captured: boolean
  captureDate?: string | null
  captureNotes?: string | null
  totalDamage?: number | null
  byActor: Record<string, { BASIC?: number | null; SKILL?: number | null; ULT?: number | null; FUA?: number | null; DOT?: number | null; total?: number | null }>
}

interface GoldenFile {
  name: string
  description?: string
  team: GoldenMember[]
  scenario: GoldenScenario
  reference: GoldenReference
  tolerance?: Partial<typeof DEFAULT_TOLERANCE>
}

// ---------------------------------------------------------------------------
// Input builder (mirror of teamGolden.test.ts's MemberFixture helpers, just driven by JSON)
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
    enemyCount: golden.scenario.enemyCount,
    enemySpd: golden.scenario.enemySpd,
    totalAv: golden.scenario.totalAv,
  }
}

// ---------------------------------------------------------------------------
// Diff + reporting
// ---------------------------------------------------------------------------

interface Delta {
  label: string
  ours: number
  ref: number
  pct: number  // (ours - ref) / ref
  tolerance: number
  withinTolerance: boolean
}

function diff(golden: GoldenFile, result: AutobattleResult): Delta[] {
  const tol = { ...DEFAULT_TOLERANCE, ...golden.tolerance }
  const out: Delta[] = []
  const refTotal = golden.reference.totalDamage ?? 0
  const ourTotal = result.ledger.grandTotal

  out.push(mkDelta('TEAM total', ourTotal, refTotal, tol.totalDamage))

  for (const m of golden.team) {
    const refForSlot = golden.reference.byActor[String(m.slot)] ?? {}
    const actorKey = `${m.slot}:primary`
    const ours = result.ledger.byActorBySource[actorKey] ?? {}
    const ourTotalForSlot = result.ledger.totalsByActor[actorKey] ?? 0
    const refTotalForSlot = refForSlot.total ?? 0

    out.push(mkDelta(`slot ${m.slot} (${m.referenceName}) total`, ourTotalForSlot, refTotalForSlot, tol.perActorTotal))

    for (const kind of ['BASIC', 'SKILL', 'ULT', 'FUA', 'DOT'] as const) {
      const refVal = refForSlot[kind]
      if (refVal == null) continue
      const ourVal = (ours as Record<string, number | undefined>)[kind] ?? 0
      out.push(mkDelta(`slot ${m.slot} (${m.referenceName}) ${kind}`, ourVal, refVal, tol.perAbility))
    }
  }

  return out
}

function mkDelta(label: string, ours: number, ref: number, tolerance: number): Delta {
  const pct = ref === 0 ? (ours === 0 ? 0 : Number.POSITIVE_INFINITY) : (ours - ref) / ref
  return { label, ours, ref, pct, tolerance, withinTolerance: Math.abs(pct) <= tolerance }
}

function formatDeltas(deltas: Delta[]): string {
  const lines: string[] = []
  for (const d of deltas) {
    const pctStr = isFinite(d.pct) ? `${(d.pct * 100).toFixed(1)}%` : '∞'
    const flag = d.withinTolerance ? '✓' : '✗'
    lines.push(`  ${flag} ${d.label.padEnd(40)}  ours=${d.ours.toFixed(0).padStart(12)}  ref=${d.ref.toFixed(0).padStart(12)}  Δ=${pctStr.padStart(8)}  (tol ±${(d.tolerance * 100).toFixed(0)}%)`)
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

const haveGoldensDir = existsSync(GOLDEN_DIR)
const goldenFiles = haveGoldensDir
  ? readdirSync(GOLDEN_DIR).filter((f) => f.endsWith('.json'))
  : []

if (haveGoldensDir && goldenFiles.length > 0) {
  Metadata.initialize()

  describe('cross-check against external goldens', () => {
    for (const file of goldenFiles) {
      test(file, () => {
        const golden = JSON.parse(readFileSync(resolve(GOLDEN_DIR, file), 'utf8')) as GoldenFile

        if (!golden.reference.captured) {
          console.log(`  ⏭  ${file}: reference numbers not yet captured (see .tmp/ext/goldens/CAPTURE_GUIDE.md)`)
          return
        }

        const result = runAutobattle(buildInput(golden), { buildResolvers: true })
        const deltas = diff(golden, result)

        console.log(`\n${file}:`)
        console.log(formatDeltas(deltas))

        const failures = deltas.filter((d) => !d.withinTolerance)
        if (failures.length > 0) {
          const summary = failures.map((d) => `  ${d.label}: Δ=${(d.pct * 100).toFixed(1)}% > ±${(d.tolerance * 100).toFixed(0)}%`).join('\n')
          expect.fail(`${failures.length} delta(s) outside tolerance:\n${summary}`)
        }
      })
    }

    test.skip('dump our final stats for capture (skip by default)', () => {
      for (const file of goldenFiles) {
        const golden = JSON.parse(readFileSync(resolve(GOLDEN_DIR, file), 'utf8')) as GoldenFile
        const result = runAutobattle(buildInput(golden), { buildResolvers: true })
        console.log(`\n=== ${file} — our sim output ===`)
        console.log(`grandTotal: ${result.ledger.grandTotal.toFixed(0)}`)
        for (const m of golden.team) {
          const actorKey = `${m.slot}:primary`
          const total = result.ledger.totalsByActor[actorKey] ?? 0
          const byKind = result.ledger.byActorBySource[actorKey] ?? {}
          console.log(`slot ${m.slot} (${m.referenceName}): total=${total.toFixed(0)}`)
          for (const [kind, val] of Object.entries(byKind)) {
            console.log(`    ${kind}: ${(val as number).toFixed(0)}`)
          }
        }
      }
    })
  })
} else {
  describe.skip('cross-check against external goldens (no goldens directory present)', () => {
    test('placeholder', () => {})
  })
}
