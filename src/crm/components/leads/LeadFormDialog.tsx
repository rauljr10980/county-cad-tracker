import { useEffect, useState } from 'react'
import { LeadForm } from '@/crm/components/leads/LeadForm'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useToast } from '@/crm/components/ui/toast'
import { useCrmStore } from '@/crm/store/useCrmStore'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { LeadKind } from '@/crm/data/types'

type Destination = 'contacts' | 'retail' | 'opportunity'

const DESTINATIONS: { value: Destination; label: string }[] = [
  { value: 'contacts', label: 'Contacts (industry relationship)' },
  { value: 'retail', label: 'Retail (stay-in-touch buyer)' },
  { value: 'opportunity', label: 'Opportunities (active deal)' },
]

const initialDestinationFor = (defaultKind: LeadKind): Destination =>
  defaultKind === 'retail' ? 'retail' : 'contacts'

const kindForDestination = (destination: Destination): LeadKind =>
  destination === 'retail' ? 'retail' : 'industry'

const titleFor = (destination: Destination): string => {
  switch (destination) {
    case 'retail':
      return 'New Retail Contact'
    case 'opportunity':
      return 'New Opportunity'
    default:
      return 'New Contact'
  }
}

const descriptionFor = (destination: Destination): string => {
  switch (destination) {
    case 'retail':
      return 'Add a retail buyer to your sphere for occasional real estate letter reminders.'
    case 'opportunity':
      return 'Create a contact and place them directly in the Opportunities pipeline.'
    default:
      return 'Add an industry relationship you want to keep warm for referrals, investors, or future collaboration.'
  }
}

const submitLabelFor = (destination: Destination): string => {
  switch (destination) {
    case 'retail':
      return 'Create Retail Contact'
    case 'opportunity':
      return 'Create Opportunity'
    default:
      return 'Create Contact'
  }
}

const toastFor = (destination: Destination): string => {
  switch (destination) {
    case 'retail':
      return 'Retail contact created'
    case 'opportunity':
      return 'Opportunity created'
    default:
      return 'Contact created'
  }
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultKind?: LeadKind
}

export function LeadFormDialog({ open, onOpenChange, defaultKind = 'industry' }: Props) {
  const addLead = useCrmStore((state) => state.addLead)
  const createOpportunity = useCrmStore((state) => state.createOpportunity)
  const addActivity = useCrmStore((state) => state.addActivity)
  const defaultOutreach = useCrmStore(
    (state) => state.settings.defaultOpportunityOutreachMessage,
  )
  const { show } = useToast()
  const [destination, setDestination] = useState<Destination>(() =>
    initialDestinationFor(defaultKind),
  )
  const [outreachMessage, setOutreachMessage] = useState(defaultOutreach)

  useEffect(() => {
    if (open) {
      setDestination(initialDestinationFor(defaultKind))
      setOutreachMessage(defaultOutreach)
    }
  }, [open, defaultKind, defaultOutreach])

  const kind = kindForDestination(destination)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{titleFor(destination)}</DialogTitle>
          <DialogDescription>{descriptionFor(destination)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="lead-destination">Where to put this contact?</Label>
          <Select
            value={destination}
            onValueChange={(value) => setDestination(value as Destination)}
          >
            <SelectTrigger id="lead-destination">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DESTINATIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {destination === 'opportunity' ? (
          <div className="space-y-1.5">
            <Label htmlFor="opportunity-outreach">First outreach message</Label>
            <textarea
              id="opportunity-outreach"
              className="flex min-h-[110px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={outreachMessage}
              onChange={(event) => setOutreachMessage(event.target.value)}
              placeholder="Hi, it was great meeting you..."
            />
            <p className="text-xs text-muted-foreground">
              Saved as a Note on this contact's timeline so you have a record of exactly what you sent. Edit your default in Settings.
            </p>
          </div>
        ) : null}

        <LeadForm
          key={kind}
          defaultKind={kind}
          onSubmit={(values) => {
            const lead = addLead(values)
            if (destination === 'opportunity') {
              createOpportunity(lead.id)
              const trimmed = outreachMessage.trim()
              if (trimmed) {
                addActivity(lead.id, 'note', `First outreach: ${trimmed}`)
              }
            }
            show(toastFor(destination))
            onOpenChange(false)
          }}
          onCancel={() => onOpenChange(false)}
          submitLabel={submitLabelFor(destination)}
        />
      </DialogContent>
    </Dialog>
  )
}
