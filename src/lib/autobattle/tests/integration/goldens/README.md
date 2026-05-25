# Autobattle cross-check goldens

Captured reference battles used by `crossCheck.test.ts` to validate that our
sim's per-(actor, ability) damage attribution matches an external simulator.
Each file is one golden — a self-contained team + scenario + reference outcome
in the `BattleRecord` shape.

## File format

```jsonc
{
  "name": "topaz-ruanmei",
  "description": "Short description of the team / point of the golden",
  "captureDate": "YYYY-MM-DD",
  "captureNotes": "free-text notes about how the run was set up",
  "team": [
    {
      "slot": 0,
      "characterId": "1112",
      "referenceName": "Topaz & Numby",
      "lightConeId": "23016",
      "lightConeName": "Worrisome, Blissful",
      "eidolon": 0,
      "lightConeSuperimposition": 1,
      "baseSpd": 110,
      "maxEnergy": 130,
      "path": "Hunt",
      "relicSet1": "TheAshblazingGrandDuke",
      "relicSet2": "TheAshblazingGrandDuke",
      "ornamentSet": "DuranDynastyOfRunningWolves",
      "mains": {
        "body": "CD",
        "feet": "ATK_P",
        "planarSphere": "Fire_DMG",
        "linkRope": "ATK_P"
      }
    }
    // ... 1..4 members
  ],
  "scenario": {
    "mainDpsSlot": 0,
    "enemyCount": 3,
    "enemySpd": 134,
    "totalAv": 449
  },
  "reference": {
    "outcome": {
      // Full BattleRecord.outcome — paste from a fresh capture
      "totalAv": 449,
      "totalDamage": 2369669,
      "byActor": [/* ... */],
      "timeline": [/* ... */]
    }
  },
  "tolerance": {
    // Optional per-golden tolerance overrides
    "totalDamage": 0.15,
    "perActorTotal": 0.20,
    "perAbility": 0.30
  }
}
```

The `reference.outcome` must match the shape declared in
`src/lib/autobattle/battleRecord.ts` — it's exactly what the capture script
emits, just pasted inline.

## How to add a new golden

1. **Verify the team is supported.** Every character in `team[]` needs a
   `characterData` entry under `src/lib/autobattle/characterData/<path>/` and
   a tendency under `src/lib/autobattle/tendencies/<path>/` (or it'll fall
   back to the archetype default). If a character is missing, add them first
   — don't ship the golden until our sim can replay it.

2. **Configure the team in the reference calculator UI** with the same
   light cones, eidolons, relic sets, main stats, and starting energy as
   you'll declare in the golden file. Use `STANDARD_ROLLS` (10 each of
   ATK%/SPD/CR/CD/EHR/RES/BE) as the substat baseline so our sim sees
   matching final stats.

3. **Run the battle** in the reference UI. Note the resulting total AV.

4. **Capture the outcome.** Open devtools, paste the contents of
   `.tmp/ext/extract-battle-record.cjs`. It reads
   `globalRecords.battleData.battleLog` and copies a `BattleRecord.outcome`
   JSON to your clipboard.

5. **Assemble the golden file.** Save as
   `src/lib/autobattle/tests/integration/goldens/<name>.json` with team +
   scenario + `reference.outcome` pasted in. See the example block above.

6. **Run the cross-check.**
   ```
   npx vitest run src/lib/autobattle/tests/integration/crossCheck.test.ts
   ```
   The test dumps our-sim outcomes to `.tmp/our-outcomes/<name>.our-outcome.json`
   alongside the diff report. Use `.tmp/diff-outcomes.cjs` for ad-hoc diffs
   between any two outcome JSONs.

## Drift sources to expect (don't chase these)

Per `.tmp/ext/AUDIT.md`, some characters in our v1 use approximations the
reference simulates more precisely. Expect non-trivial drift on Aventurine
(`v1Approx.energyFromEnemyAttacks`), Yunli (FUA-every-N approximation),
Lingsha (Fuyuan FUA approximation), Topaz/Numby (memo turns not simulated),
Sparkle (missing +6 SP on ult), and any team with multi-enemy mechanics our
sim doesn't yet model.

Tune `tolerance` per golden as needed; team-wide drift over 30% is worth
investigating before relaxing the bound.
