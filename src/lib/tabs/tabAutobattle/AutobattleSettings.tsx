import {
  Button,
  Flex,
  NumberInput,
  Radio,
  SegmentedControl,
  Stack,
  Text,
} from '@mantine/core'
import {
  type AutobattleEnemyCount,
  useAutobattleStore,
} from 'lib/stores/autobattle/autobattleStore'
import type { SlotIndex } from 'lib/autobattle/types'
import { SLOT_INDEXES } from 'lib/autobattle/types'
import { useAutobattleController } from 'lib/tabs/tabAutobattle/useAutobattleController'
import type { CharacterId } from 'types/character'
import type { ReactElement } from 'types/components'
import { useShallow } from 'zustand/react/shallow'

const ENEMY_COUNT_OPTIONS = [
  { label: '1', value: '1' },
  { label: '3', value: '3' },
  { label: '5', value: '5' },
]

// Phase B test team: Feixiao (DPS), Robin (buffer), Sparkle (SP-positive), Aventurine (tank).
// Real character picker comes in Phase F.
const DEFAULT_TEST_TEAM: Partial<Record<SlotIndex, CharacterId>> = {
  0: '1220' as CharacterId, // Feixiao
  1: '1309' as CharacterId, // Robin
  2: '1306' as CharacterId, // Sparkle
  3: '1304' as CharacterId, // Aventurine
}

export function AutobattleSettings(): ReactElement {
  const {
    team,
    mainDpsSlot,
    enemyCount,
    enemySpd,
    totalAv,
    loading,
    setMainDpsSlot,
    setEnemyCount,
    setEnemySpd,
    setTotalAv,
  } = useAutobattleStore(useShallow((s) => ({
    team: s.team,
    mainDpsSlot: s.mainDpsSlot,
    enemyCount: s.enemyCount,
    enemySpd: s.enemySpd,
    totalAv: s.totalAv,
    loading: s.loading,
    setMainDpsSlot: s.setMainDpsSlot,
    setEnemyCount: s.setEnemyCount,
    setEnemySpd: s.setEnemySpd,
    setTotalAv: s.setTotalAv,
  })))

  const { runSimulation, loadDefaultTestTeam } = useAutobattleController()

  return (
    <Stack gap={16}>
      <Stack gap={6}>
        <Flex justify='space-between' align='center'>
          <Text fw={600} size='sm'>Team</Text>
          <Button size='compact-xs' variant='subtle' onClick={() => loadDefaultTestTeam(DEFAULT_TEST_TEAM)}>
            Use test team
          </Button>
        </Flex>
        <Flex gap={8} wrap='wrap'>
          {SLOT_INDEXES.map((slot) => <TeamSlotPlaceholder key={slot} slot={slot} characterId={team[slot]} />)}
        </Flex>
        <Text size='xs' c='dimmed'>Character picker coming in Phase F.</Text>
      </Stack>

      <Stack gap={6}>
        <Text fw={600} size='sm'>Main DPS</Text>
        <Radio.Group
          value={String(mainDpsSlot)}
          onChange={(value) => setMainDpsSlot(Number(value) as SlotIndex)}
        >
          <Flex gap={12}>
            {SLOT_INDEXES.map((slot) => <Radio key={slot} value={String(slot)} label={`Slot ${slot}`} />)}
          </Flex>
        </Radio.Group>
      </Stack>

      <Stack gap={6}>
        <Text fw={600} size='sm'>Enemies</Text>
        <SegmentedControl
          data={ENEMY_COUNT_OPTIONS}
          value={String(enemyCount)}
          onChange={(value) => setEnemyCount(Number(value) as AutobattleEnemyCount)}
        />
      </Stack>

      <NumberInput
        label='Enemy SPD'
        value={enemySpd}
        onChange={(value) => setEnemySpd(typeof value === 'number' ? value : Number(value))}
        min={1}
        max={500}
      />

      <NumberInput
        label='Duration (Action Value)'
        value={totalAv}
        onChange={(value) => setTotalAv(typeof value === 'number' ? value : Number(value))}
        min={100}
        max={100000}
        step={500}
      />

      <Button
        disabled={loading || Object.keys(team).length === 0}
        loading={loading}
        onClick={runSimulation}
      >
        Run Simulation
      </Button>
    </Stack>
  )
}

function TeamSlotPlaceholder({ slot, characterId }: { slot: SlotIndex; characterId: string | undefined }): ReactElement {
  return (
    <div style={{
      width: 80,
      height: 80,
      borderRadius: 6,
      border: '1px dashed var(--mantine-color-default-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      padding: 4,
      textAlign: 'center',
    }}>
      <Text size='xs' c='dimmed'>Slot {slot}</Text>
      <Text size='xs' c={characterId ? undefined : 'dimmed'}>{characterId ?? 'Empty'}</Text>
    </div>
  )
}
