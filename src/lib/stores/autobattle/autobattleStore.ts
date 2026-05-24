import type { AutobattleResult, SlotIndex } from 'lib/autobattle/types'
import { createTabAwareStore } from 'lib/stores/infrastructure/createTabAwareStore'
import type { CharacterId } from 'types/character'

export type AutobattleEnemyCount = 1 | 3 | 5

export type AutobattleTeam = Partial<Record<SlotIndex, CharacterId>>

export type AutobattleStoreState = {
  // Inputs
  team: AutobattleTeam
  mainDpsSlot: SlotIndex
  enemyCount: AutobattleEnemyCount
  enemySpd: number
  totalAv: number

  // Run state
  loading: boolean
  result: AutobattleResult | null
  error: string | null

  // UI state
  timelineExpanded: boolean

  // Actions
  setSlot: (slot: SlotIndex, characterId: CharacterId | undefined) => void
  setMainDpsSlot: (slot: SlotIndex) => void
  setEnemyCount: (count: AutobattleEnemyCount) => void
  setEnemySpd: (spd: number) => void
  setTotalAv: (av: number) => void
  setLoading: (loading: boolean) => void
  setResult: (result: AutobattleResult | null) => void
  setError: (error: string | null) => void
  setTimelineExpanded: (expanded: boolean) => void
  reset: () => void
}

const initialInputs = {
  team: {} as AutobattleTeam,
  mainDpsSlot: 0 as SlotIndex,
  enemyCount: 1 as AutobattleEnemyCount,
  enemySpd: 134,
  totalAv: 6000,
}

export const useAutobattleStore = createTabAwareStore<AutobattleStoreState>((set) => ({
  ...initialInputs,

  loading: false,
  result: null,
  error: null,
  timelineExpanded: false,

  setSlot: (slot, characterId) =>
    set((state) => {
      const team = { ...state.team }
      if (characterId === undefined) delete team[slot]
      else team[slot] = characterId
      return { team }
    }),
  setMainDpsSlot: (mainDpsSlot) => set({ mainDpsSlot }),
  setEnemyCount: (enemyCount) => set({ enemyCount }),
  setEnemySpd: (enemySpd) => set({ enemySpd }),
  setTotalAv: (totalAv) => set({ totalAv }),
  setLoading: (loading) => set({ loading }),
  setResult: (result) => set({ result, loading: false, error: null }),
  setError: (error) => set({ error, loading: false }),
  setTimelineExpanded: (timelineExpanded) => set({ timelineExpanded }),
  reset: () =>
    set({
      ...initialInputs,
      loading: false,
      result: null,
      error: null,
      timelineExpanded: false,
    }),
}))
