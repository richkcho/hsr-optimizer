import { stackDpsTendency } from 'lib/autobattle/tendencies/archetypes/stackDps'
import type { Tendency } from 'lib/autobattle/types'

// Acheron uses the stackDps shape verbatim: skill when SP affords, basic when starved, ult
// when nihility stacks reach threshold. All numbers come from characterData.stacks.
export const AcheronTendency: Tendency = {
  ...stackDpsTendency,
}
