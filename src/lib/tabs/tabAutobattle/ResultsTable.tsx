import { Table, Text } from '@mantine/core'
import type {
  AutobattleResult,
} from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'
import { useTranslation } from 'react-i18next'
import type { CharacterId } from 'types/character'
import type { ReactElement } from 'types/components'

interface Props {
  result: AutobattleResult
  team: Partial<Record<number, CharacterId>>
}

// Damage breakdown columns. Order matches the in-game ability tabs.
const COLUMNS: AbilityKind[] = [
  AbilityKind.BASIC,
  AbilityKind.SKILL,
  AbilityKind.ULT,
  AbilityKind.FUA,
  AbilityKind.DOT,
] as unknown as AbilityKind[]

export function ResultsTable({ result, team }: Props): ReactElement {
  const { t: tGameData } = useTranslation('gameData')
  const rows = Object.entries(result.ledger.totalsByActor)
    .sort(([, a], [, b]) => b - a)

  return (
    <Table withColumnBorders striped highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Actor</Table.Th>
          {COLUMNS.map((kind) => <Table.Th key={kind} ta='right'>{kind}</Table.Th>)}
          <Table.Th ta='right'>Total</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map(([actorKey, total]) => {
          const [slotStr] = actorKey.split(':')
          const slot = Number(slotStr)
          const characterId = team[slot]
          const name = characterId ? tGameData(`Characters.${characterId}.LongName`) : actorKey
          const sources = result.ledger.byActorBySource[actorKey] ?? {}
          return (
            <Table.Tr key={actorKey}>
              <Table.Td>{name}</Table.Td>
              {COLUMNS.map((kind) => (
                <Table.Td key={kind} ta='right'>
                  {formatNum(sources[kind])}
                </Table.Td>
              ))}
              <Table.Td ta='right'><strong>{formatNum(total)}</strong></Table.Td>
            </Table.Tr>
          )
        })}
        <Table.Tr>
          <Table.Td><Text fw={600}>Grand total</Text></Table.Td>
          {COLUMNS.map((kind) => <Table.Td key={kind} />)}
          <Table.Td ta='right'>
            <Text fw={600}>{formatNum(result.ledger.grandTotal)}</Text>
          </Table.Td>
        </Table.Tr>
      </Table.Tbody>
    </Table>
  )
}

function formatNum(n: number | undefined): string {
  if (!n) return '—'
  return Math.round(n).toLocaleString()
}
