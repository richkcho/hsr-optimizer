import { Alert, Flex, Paper, Stack, Table, Text, Title } from '@mantine/core'
import { useAutobattleStore } from 'lib/stores/autobattle/autobattleStore'
import { AutobattleSettings } from 'lib/tabs/tabAutobattle/AutobattleSettings'
import type { ReactElement } from 'types/components'
import { useShallow } from 'zustand/react/shallow'
import styles from './AutobattleTab.module.css'

export function AutobattleTab(): ReactElement {
  return (
    <Flex className={styles.root} gap={12} p={12} w='100%'>
      <Paper className={styles.settingsPanel} p={12} withBorder>
        <Title order={3} mb={12}>Autobattle</Title>
        <AutobattleSettings />
      </Paper>
      <Paper className={styles.resultsPanel} p={12} withBorder>
        <Title order={4} mb={8}>Results</Title>
        <AutobattleResults />
      </Paper>
    </Flex>
  )
}

function AutobattleResults(): ReactElement {
  const { result, error } = useAutobattleStore(useShallow((s) => ({
    result: s.result,
    error: s.error,
  })))

  if (error) return <Alert color='red'>{error}</Alert>
  if (!result) return <Text c='dimmed' size='sm'>Run a simulation to see per-character damage breakdown.</Text>

  const rows = Object.entries(result.ledger.totalsByActor)
  return (
    <Stack gap={12}>
      <Text size='sm'>Grand total: <strong>{Math.round(result.ledger.grandTotal).toLocaleString()}</strong> over {Math.round(result.finalElapsedAv)} AV</Text>
      <Table withColumnBorders striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Actor</Table.Th>
            <Table.Th>Total damage</Table.Th>
            <Table.Th>Breakdown</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map(([actorKey, total]) => {
            const sources = result.ledger.byActorBySource[actorKey] ?? {}
            const breakdown = Object.entries(sources)
              .map(([kind, dmg]) => `${kind}: ${Math.round(dmg).toLocaleString()}`)
              .join(', ')
            return (
              <Table.Tr key={actorKey}>
                <Table.Td>{actorKey}</Table.Td>
                <Table.Td>{Math.round(total).toLocaleString()}</Table.Td>
                <Table.Td>{breakdown || '—'}</Table.Td>
              </Table.Tr>
            )
          })}
        </Table.Tbody>
      </Table>
      <Text size='xs' c='dimmed'>Phase B uses mock damage values. Real damage pipeline integration: Phase C.</Text>
    </Stack>
  )
}
