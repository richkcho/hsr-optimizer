import { Alert, Divider, Flex, Paper, Stack, Text, Title } from '@mantine/core'
import { useAutobattleStore } from 'lib/stores/autobattle/autobattleStore'
import { AutobattleSettings } from 'lib/tabs/tabAutobattle/AutobattleSettings'
import { DamageBarChart } from 'lib/tabs/tabAutobattle/DamageBarChart'
import { ResultsTable } from 'lib/tabs/tabAutobattle/ResultsTable'
import { TimelineDrawer } from 'lib/tabs/tabAutobattle/TimelineDrawer'
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
  const { result, error, team } = useAutobattleStore(useShallow((s) => ({
    result: s.result,
    error: s.error,
    team: s.team,
  })))

  if (error) return <Alert color='red'>{error}</Alert>
  if (!result) return <Text c='dimmed' size='sm'>Run a simulation to see per-character damage breakdown.</Text>

  return (
    <Stack gap={12}>
      <Text size='sm'>
        Grand total: <strong>{Math.round(result.ledger.grandTotal).toLocaleString()}</strong> over {Math.round(result.finalElapsedAv)} AV
      </Text>
      <ResultsTable result={result} team={team} />
      <Divider />
      <DamageBarChart result={result} team={team} />
      <Divider />
      <TimelineDrawer result={result} />
    </Stack>
  )
}
