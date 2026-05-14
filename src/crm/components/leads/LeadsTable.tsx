import { CalendarPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ConnectionRating, Lead } from '@/crm/data/types'
import {
  RELATIONSHIP_DROPDOWN_OPTIONS,
  relationshipRatingMeta,
} from '@/crm/lib/connectionRating'
import { cn } from '@/crm/lib/utils'

type LeadsTableProps = {
  leads: Lead[]
  onRowClick: (leadId: string) => void
  onRateConnection: (leadId: string, rating: ConnectionRating) => void
  onScheduleMeeting: (leadId: string) => void
}

export function LeadsTable({ leads, onRowClick, onRateConnection, onScheduleMeeting }: LeadsTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-border/70 bg-card shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="px-4 py-3 text-left font-medium">JOB TITLE/INDUSTRY</th>
            <th className="px-4 py-3 text-left font-medium">Name</th>
            <th className="px-4 py-3 text-left font-medium">City</th>
            <th className="px-4 py-3 text-left font-medium">Firm</th>
            <th className="px-4 py-3 text-left font-medium">Email</th>
            <th className="px-4 py-3 text-left font-medium">Phone</th>
            <th className="px-4 py-3 text-left font-medium">Asset</th>
            <th className="px-4 py-3 text-left font-medium">Specialization</th>
            <th className="min-w-[260px] px-4 py-3 text-left font-medium">Updated Notes</th>
            <th className="px-4 py-3 text-left font-medium">Met personally</th>
            <th className="px-4 py-3 text-left font-medium">Schedule</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr
              key={lead.id}
              onClick={() => onRowClick(lead.id)}
              className="cursor-pointer border-t transition hover:bg-accent/30"
            >
              <td className="px-4 py-3">
                {lead.jobTitleIndustry || lead.industry || ''}
              </td>
              <td className="px-4 py-3">
                <div className="font-medium">{lead.ownerName || lead.businessName}</div>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{lead.city}</td>
              <td className="px-4 py-3">{lead.firm || lead.businessName}</td>
              <td className="px-4 py-3 text-muted-foreground">{lead.email}</td>
              <td className="px-4 py-3 text-muted-foreground">{lead.phone}</td>
              <td className="px-4 py-3 text-muted-foreground">{lead.asset}</td>
              <td className="px-4 py-3 text-muted-foreground">{lead.specialization}</td>
              <td className="px-4 py-3 text-muted-foreground">{lead.lastConversationNotes}</td>
              <td className="px-4 py-3">
                <div
                  className="min-w-[140px]"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Select
                    value={lead.connectionRating ?? 'none'}
                    onValueChange={(rating) =>
                      onRateConnection(lead.id, rating as ConnectionRating)
                    }
                  >
                    <SelectTrigger
                      className={cn(
                        'h-8 w-[140px]',
                        relationshipRatingMeta[lead.connectionRating ?? 'none'].selectClass,
                      )}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RELATIONSHIP_DROPDOWN_OPTIONS.map((rating) => (
                        <SelectItem key={rating} value={rating}>
                          {relationshipRatingMeta[rating].tableLabel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </td>
              <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onScheduleMeeting(lead.id)}
                >
                  <CalendarPlus className="h-4 w-4" />
                  Schedule a meeting
                </Button>
              </td>
            </tr>
          ))}
          {leads.length === 0 ? (
            <tr>
              <td colSpan={11} className="px-4 py-16 text-center text-muted-foreground">
                No contacts match your filters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}
