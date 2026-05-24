import { Accordion, Badge, Box, Group, ScrollArea, Stack, Text } from '@mantine/core'
import type {
  AutobattleResult,
  TurnLogEntry,
} from 'lib/autobattle/types'
import { useAutobattleStore } from 'lib/stores/autobattle/autobattleStore'
import type { ReactElement } from 'types/components'

interface Props {
  result: AutobattleResult
}

const KIND_COLOR: Record<string, string> = {
  BASIC: 'blue',
  SKILL: 'cyan',
  ULT: 'yellow',
  FUA: 'grape',
  DOT_TICK: 'red',
  ENEMY_TURN: 'gray',
  BUFF_EXPIRE: 'gray',
  TICK: 'gray',
}

// 500+ entries is common at 6000 AV with a fast team; the ScrollArea + fixed height keeps the
// DOM light without pulling in a virtualization lib (defer that to Phase G if needed).
const MAX_DISPLAYED = 500

export function TimelineDrawer({ result }: Props): ReactElement {
  const timelineExpanded = useAutobattleStore((s) => s.timelineExpanded)
  const setTimelineExpanded = useAutobattleStore((s) => s.setTimelineExpanded)

  const entries = result.log.slice(-MAX_DISPLAYED)

  return (
    <Accordion
      variant='separated'
      value={timelineExpanded ? 'timeline' : null}
      onChange={(v) => setTimelineExpanded(v === 'timeline')}
    >
      <Accordion.Item value='timeline'>
        <Accordion.Control>
          <Text fw={500} size='sm'>
            Timeline ({result.log.length} entries{result.log.length > MAX_DISPLAYED ? `, showing last ${MAX_DISPLAYED}` : ''})
          </Text>
        </Accordion.Control>
        <Accordion.Panel>
          <ScrollArea h={360}>
            <Stack gap={2}>
              {entries.map((entry, i) => <LogRow key={i} entry={entry} />)}
            </Stack>
          </ScrollArea>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  )
}

function LogRow({ entry }: { entry: TurnLogEntry }): ReactElement {
  const color = KIND_COLOR[entry.kind] ?? 'gray'
  return (
    <Box style={{ fontFamily: 'monospace', fontSize: 12 }}>
      <Group gap={8} wrap='nowrap'>
        <Text size='xs' c='dimmed' style={{ minWidth: 60, textAlign: 'right' }}>
          AV={Math.round(entry.elapsedAv)}
        </Text>
        <Badge color={color} size='xs' style={{ minWidth: 70, textAlign: 'center' }}>{entry.kind}</Badge>
        <Text size='xs' style={{ flex: 1 }}>{entry.description}</Text>
        {entry.damage !== undefined && entry.damage > 0 && (
          <Text size='xs' c='red' style={{ minWidth: 80, textAlign: 'right' }}>
            {Math.round(entry.damage).toLocaleString()}
          </Text>
        )}
      </Group>
    </Box>
  )
}
