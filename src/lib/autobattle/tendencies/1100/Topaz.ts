import { fuaDpsTendency } from 'lib/autobattle/tendencies/archetypes/fuaDps'
import type { Tendency } from 'lib/autobattle/types'

// Topaz uses skill to mark a target with Proof of Debt, enabling Numby's FUA. She skill-
// camps whenever SP allows. fuaDps's "skill > basic when SP affords" matches naturally.
export const TopazTendency: Tendency = {
  ...fuaDpsTendency,
}
