import type { ArchetypeId } from 'lib/autobattle/types'
import { PathNames } from 'lib/constants/constants'
import type { PathName } from 'lib/constants/constants'

export const PATH_TO_ARCHETYPE: Record<PathName, ArchetypeId> = {
  [PathNames.Destruction]: 'pureDps',
  [PathNames.Hunt]: 'pureDps',
  [PathNames.Erudition]: 'aoeDps',
  [PathNames.Harmony]: 'fieldBuffer',
  [PathNames.Abundance]: 'healer',
  [PathNames.Nihility]: 'debuffer',
  [PathNames.Preservation]: 'healer',
  [PathNames.Remembrance]: 'pureDps',
  [PathNames.Elation]: 'pureDps',
}
