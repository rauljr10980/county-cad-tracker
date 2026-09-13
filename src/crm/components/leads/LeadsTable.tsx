import { CalendarPlus, MoreVertical } from 'lucide-react'
import { AvatarInitials } from '@/components/ui/avatar-initials'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ConnectionRating, Lead, Task } from '@/crm/data/types'
import {
  RELATIONSHIP_DROPDOWN_OPTIONS,
  relationshipRatingMeta,
} from '@/crm/lib/connectionRating'
import { pillClass } from '@/lib/pillBadge'

type LeadsTableProps = {
  leads: Lead[]
  tasks: Task[]
  onRowClick: (leadId: string) => void
  onRateConnection: (leadId: string, rating: ConnectionRating) => void
  onScheduleMeeting: (leadId: string) => void
}

const ACTIVE_WINDOW_DAYS = 90

function isActiveLead(lead: Lead): boolean {
  if (!lead.lastContactedAt) return false
  const daysSinceContact = (Date.now() - new Date(lead.lastContactedAt).getTime()) / 86_400_000
  return daysSinceContact <= ACTIVE_WINDOW_DAYS
}

/** The nearest not-yet-completed task for a lead, regardless of whether it's
 *  already overdue — that's still the next thing due for this contact. */
function nextFollowUpFor(leadId: string, tasks: Task[]): string | null {
  const upcoming = tasks
    .filter((task) => task.leadId === leadId && !task.completed)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
  return upcoming[0]?.dueAt ?? null
}

function formatShortDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function LeadsTable({ leads, tasks, onRowClick, onRateConnection, onScheduleMeeting }: LeadsTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-border/70 bg-card shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Contact</th>
            <th className="px-4 py-3 text-left font-medium">Company</th>
            <th className="px-4 py-3 text-left font-medium">City</th>
            <th className="px-4 py-3 text-left font-medium">Specialization</th>
            <th className="px-4 py-3 text-left font-medium">Last Interaction</th>
            <th className="px-4 py-3 text-left font-medium">Next Follow Up</th>
            <th className="px-4 py-3 text-left font-medium">Status</th>
            <th className="px-4 py-3 text-left font-medium"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => {
            const name = lead.ownerName || lead.businessName
            return (
              <tr
                key={lead.id}
                onClick={() => onRowClick(lead.id)}
                className="cursor-pointer border-t transition hover:bg-accent/30"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <AvatarInitials name={name} size={32} />
                    <span className="font-medium">{name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">{lead.firm || lead.businessName}</td>
                <td className="px-4 py-3 text-muted-foreground">{lead.city}</td>
                <td className="px-4 py-3 text-muted-foreground">{lead.specialization}</td>
                <td className="px-4 py-3">
                  <div>{formatShortDate(lead.lastContactedAt)}</div>
                  {lead.lastConversationNotes && (
                    <div className="text-xs text-muted-foreground">{lead.lastConversationNotes}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatShortDate(nextFollowUpFor(lead.id, tasks))}
                </td>
                <td className="px-4 py-3">
                  <span className={pillClass(isActiveLead(lead) ? 'success' : 'grey')}>
                    {isActiveLead(lead) ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="More actions"
                        className="rounded p-1.5 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Met personally</DropdownMenuLabel>
                      {RELATIONSHIP_DROPDOWN_OPTIONS.map((rating) => (
                        <DropdownMenuItem key={rating} onClick={() => onRateConnection(lead.id, rating)}>
                          {relationshipRatingMeta[rating].tableLabel}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onScheduleMeeting(lead.id)}>
                        <CalendarPlus className="mr-2 h-4 w-4" />
                        Schedule a meeting
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            )
          })}
          {leads.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-16 text-center text-muted-foreground">
                No contacts match your filters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}
