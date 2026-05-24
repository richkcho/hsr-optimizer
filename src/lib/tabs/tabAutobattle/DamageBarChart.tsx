import { Box } from '@mantine/core'
import type {
  AutobattleResult,
} from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { CharacterId } from 'types/character'
import type { ReactElement } from 'types/components'

interface Props {
  result: AutobattleResult
  team: Partial<Record<number, CharacterId>>
}

// Source → stable color for the stacked bars. Picked to match HSR's in-game ability palette.
const SOURCE_COLORS: Record<string, string> = {
  BASIC: '#7fa8d6',
  SKILL: '#5d7fa3',
  ULT: '#e8b94d',
  FUA: '#9b6dc4',
  DOT: '#c95c5c',
}

const SOURCES = [AbilityKind.BASIC, AbilityKind.SKILL, AbilityKind.ULT, AbilityKind.FUA, AbilityKind.DOT] as unknown as string[]

type Row = { name: string } & Record<string, number | string>

export function DamageBarChart({ result, team }: Props): ReactElement {
  const { t: tGameData } = useTranslation('gameData')

  const data = useMemo<Row[]>(() => {
    return Object.entries(result.ledger.byActorBySource)
      .map(([actorKey, sources]) => {
        const slot = Number(actorKey.split(':')[0])
        const characterId = team[slot]
        const name = characterId ? tGameData(`Characters.${characterId}.LongName`) : actorKey
        const row: Row = { name }
        for (const src of SOURCES) row[src] = sources[src as AbilityKind] ?? 0
        return row
      })
      .sort((a, b) =>
        SOURCES.reduce((acc, s) => acc + (b[s] as number), 0)
        - SOURCES.reduce((acc, s) => acc + (a[s] as number), 0)
      )
  }, [result, team, tGameData])

  if (data.length === 0) return <Box />

  return (
    <Box style={{ width: '100%', height: 220 }}>
      <ResponsiveContainer width='100%' height='100%'>
        <BarChart data={data} layout='vertical' margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray='3 3' />
          <XAxis type='number' tickFormatter={formatTick} />
          <YAxis type='category' dataKey='name' width={120} />
          <Tooltip formatter={(value) => formatTooltip(value as number)} />
          <Legend />
          {SOURCES.map((src) => (
            <Bar key={src} dataKey={src} stackId='dmg' fill={SOURCE_COLORS[src] ?? '#888'} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </Box>
  )
}

function formatTick(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return String(value)
}

function formatTooltip(value: number): [string, string] {
  return [Math.round(value).toLocaleString(), '']
}
