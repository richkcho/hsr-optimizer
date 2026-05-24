import { fuaDpsTendency } from 'lib/autobattle/tendencies/archetypes/fuaDps'
import type { Tendency } from 'lib/autobattle/types'

// Yunli plays as a fuaDps on her own turn (skill > basic, ult ASAP). The counter mechanic is
// driven by characterData.fuaTriggers, not by the tendency.
export const YunliTendency: Tendency = {
  ...fuaDpsTendency,
}
