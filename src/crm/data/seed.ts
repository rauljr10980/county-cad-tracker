import type { CrmState } from './types'
import { buildNetworkState } from './networkContacts'

export function generateSeed(now: Date, ownerKey: string): CrmState {
  return buildNetworkState(now, ownerKey)
}
