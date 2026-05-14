import type { CrmState } from './types'
import { buildNetworkState } from './networkContacts'

export function generateSeed(now: Date): CrmState {
  return buildNetworkState(now)
}
