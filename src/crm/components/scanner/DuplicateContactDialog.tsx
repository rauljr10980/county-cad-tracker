import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Lead } from '@/crm/data/types'

type Props = {
  open: boolean
  possibleDuplicate: Lead | null
  onUpdateExisting: () => void
  onCreateNew: () => void
  onCancel: () => void
}

export function DuplicateContactDialog({
  open,
  possibleDuplicate,
  onUpdateExisting,
  onCreateNew,
  onCancel,
}: Props) {
  if (!possibleDuplicate) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Possible Existing Contact</DialogTitle>
          <DialogDescription>
            {possibleDuplicate.ownerName || 'This contact'}
            {possibleDuplicate.firm ? ` — ${possibleDuplicate.firm}` : ''} may already be in your
            CRM.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button onClick={onUpdateExisting}>Update Existing Contact</Button>
          <Button variant="outline" onClick={onCreateNew}>
            Create New Contact
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
